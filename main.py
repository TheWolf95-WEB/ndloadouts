from fastapi import FastAPI, Request, Body, BackgroundTasks
from fastapi import Query
from fastapi.responses import HTMLResponse, JSONResponse
from fastapi.staticfiles import StaticFiles
from fastapi.templating import Jinja2Templates
from dotenv import load_dotenv, set_key, dotenv_values
import json
import os
import hmac
import hashlib
import requests
import subprocess
from pathlib import Path
from urllib.parse import parse_qs
from datetime import datetime
from database import (
    init_db, get_all_builds, add_build, delete_build_by_id, get_all_users,
    save_user, update_build_by_id, add_version_entry, get_latest_version, get_all_versions
)

load_dotenv()
WEBAPP_URL = os.getenv("WEBAPP_URL")
GITHUB_SECRET = os.getenv("WEBHOOK_SECRET", "")

app = FastAPI()

# --- Утилита для проверки прав ---
def extract_user_roles(init_data_str: str):
    try:
        parsed = parse_qs(init_data_str)
        user_data = parsed.get("user", [None])[0]
        if not user_data:
            return None, False, False

        user = json.loads(user_data)
        user_id = str(user.get("id"))

        env_vars = dotenv_values(".env")
        admin_ids = set(map(str.strip, env_vars.get("ADMIN_IDS", "").split(",")))
        admin_dop = set(map(str.strip, env_vars.get("ADMIN_DOP", "").split(",")))

        is_super_admin = user_id in admin_ids
        is_admin = is_super_admin or user_id in admin_dop

        return user_id, is_admin, is_super_admin
    except:
        return None, False, False

# --- GitHub Webhook ---
@app.post("/webhook")
async def webhook(request: Request, background_tasks: BackgroundTasks):
    body = await request.body()
    signature = request.headers.get("X-Hub-Signature-256")

    if not signature or not hmac.compare_digest(
        signature,
        "sha256=" + hmac.new(GITHUB_SECRET.encode(), body, hashlib.sha256).hexdigest()
    ):
        return JSONResponse(status_code=403, content={"error": "Invalid signature"})

    background_tasks.add_task(subprocess.call, ["/bin/bash", "/opt/ndloadouts/deploy.sh"])
    return {"status": "ok"}

app.mount("/static", StaticFiles(directory="static"), name="static")
app.mount("/data", StaticFiles(directory="data"), name="data")
templates = Jinja2Templates(directory="templates")

init_db()

@app.get("/", response_class=HTMLResponse)
async def index(request: Request):
    return templates.TemplateResponse("index.html", {"request": request})

@app.get("/api/builds")
async def api_builds(category: str = Query("all")):
    try:
        builds = get_all_builds()

        # Фильтрация по категории (если выбрана не "all")
        if category != "all":
            builds = [b for b in builds if category in (b.get("categories") or [])]

        # Приоритет топа: есть top1 -> 1, иначе если есть top2 -> 2, далее top3 -> 3, иначе в конец
        def top_priority(b):
            if b.get("top1"): return 1
            if b.get("top2"): return 2
            if b.get("top3"): return 3
            return 999

        # Ключ даты: парсим "ДД.ММ.ГГГГ", для пустых ставим 0; сортируем по убыванию
        def date_ts(b):
            s = b.get("date") or ""
            try:
                return datetime.strptime(s, "%d.%m.%Y").timestamp()
            except Exception:
                return 0

        # Сортировка: 1) по приоритету топа (возр.), 2) по дате (убыв.)
        builds.sort(key=lambda b: (top_priority(b), -date_ts(b)))

        return JSONResponse(builds)
    except Exception as e:
        return JSONResponse({"error": str(e)}, status_code=500)


@app.post("/api/builds")
async def create_build(request: Request, data: dict = Body(...)):
    user_id, is_admin, _ = extract_user_roles((await request.json()).get("initData", ""))
    if not is_admin:
        return JSONResponse({"error": "Недостаточно прав"}, status_code=403)

    try:
        print("[DEBUG] Полученные данные при создании сборки:", data)
        add_build(data)
        return JSONResponse({"status": "ok"})
    except Exception as e:
        print("[ERROR] Ошибка при добавлении сборки:", str(e))
        return JSONResponse({"status": "error", "detail": str(e)}, status_code=500)


@app.put("/api/builds/{build_id}")
async def update_build(build_id: str, request: Request):
    body = await request.json()
    user_id, is_admin, _ = extract_user_roles(body.get("initData", ""))
    if not is_admin:
        return JSONResponse({"error": "Недостаточно прав"}, status_code=403)

    try:
        update_build_by_id(build_id, body)
        return JSONResponse({"status": "ok"})
    except Exception as e:
        return JSONResponse({"status": "error", "detail": str(e)}, status_code=500)

@app.delete("/api/builds/{build_id}")
async def delete_build(build_id: str, request: Request):
    body = await request.json()
    user_id, is_admin, _ = extract_user_roles(body.get("initData", ""))
    if not is_admin:
        return JSONResponse({"error": "Недостаточно прав"}, status_code=403)

    try:
        delete_build_by_id(build_id)
        return {"status": "ok"}
    except Exception as e:
        return JSONResponse({"status": "error", "detail": str(e)}, status_code=500)

@app.get("/api/types")
def get_weapon_types():
    with open("data/types.json", "r", encoding="utf-8") as f:
        types = json.load(f)
    return JSONResponse(types)

@app.post("/api/me")
async def get_me(data: dict = Body(...)):
    init_data = data.get("initData", "")
    parsed = parse_qs(init_data)
    user_data = parsed.get("user", [None])[0]

    if not user_data:
        return JSONResponse({"error": "No user info"}, status_code=400)

    try:
        user_json = json.loads(user_data)
        user_id = str(user_json.get("id"))
        first_name = user_json.get("first_name", "")
        username = user_json.get("username", "")
        save_user(user_id, first_name, username)

        env_vars = dotenv_values(".env")
        admin_ids = set(map(str.strip, env_vars.get("ADMIN_IDS", "").split(",")))
        admin_dop = set(map(str.strip, env_vars.get("ADMIN_DOP", "").split(",")))

        is_super_admin = user_id in admin_ids
        is_admin = is_super_admin or user_id in admin_dop

        return JSONResponse({
            "user_id": user_id,
            "first_name": first_name,
            "is_admin": is_admin,
            "is_super_admin": is_super_admin
        })
    except Exception as e:
        return JSONResponse({"error": "Invalid user data", "detail": str(e)}, status_code=400)

@app.get("/api/admins")
async def get_admins():
    users = get_all_users()
    admin_ids = set(map(str.strip, os.getenv("ADMIN_IDS", "").split(",")))
    admin_dop = set(map(str.strip, os.getenv("ADMIN_DOP", "").split(",")))

    def get_name(uid):
        user = next((u for u in users if str(u["id"]) == uid), None)
        return user["first_name"] if user else "Без имени"

    return {
        "main_admins": [{"id": uid, "name": get_name(uid)} for uid in admin_ids],
        "dop_admins": [{"id": uid, "name": get_name(uid)} for uid in admin_dop]
    }

@app.post("/api/assign-admin")
async def assign_admin(data: dict = Body(...)):
    requester_id = str(data.get("requesterId", "")).strip()
    user_id = str(data.get("userId", "")).strip()

    env_path = Path(".env")
    env_vars = dotenv_values(env_path)
    admin_ids = set(filter(None, map(str.strip, env_vars.get("ADMIN_IDS", "").split(","))))
    admin_dop = set(filter(None, map(str.strip, env_vars.get("ADMIN_DOP", "").split(","))))

    if requester_id not in admin_ids:
        return JSONResponse({"status": "error", "message": "Недостаточно прав"}, status_code=403)

    if user_id in admin_ids or user_id in admin_dop:
        return JSONResponse({"status": "ok", "message": "Пользователь уже админ."})

    admin_dop.add(user_id)
    new_value = ",".join(sorted(admin_dop))
    set_key(env_path, "ADMIN_DOP", new_value)

    bot_token = os.getenv("TOKEN")
    if bot_token:
        try:
            message = (
                "👋 <b>Привет!</b>\n"
                "Вы были <b>назначены администратором</b> в ND Loadouts.\n"
                "Теперь у вас есть доступ к добавлению и редактированию сборок."
            )
            requests.post(
                f"https://api.telegram.org/bot{bot_token}/sendMessage",
                json={"chat_id": user_id, "text": message, "parse_mode": "HTML"}, timeout=5
            )
        except Exception as e:
            print(f"[!] Ошибка отправки уведомления: {e}")

    return JSONResponse({"status": "ok", "message": f"Пользователь {user_id} назначен админом."})

@app.post("/api/remove-admin")
async def remove_admin(data: dict = Body(...)):
    requester_id = str(data.get("requesterId", "")).strip()
    target_id = str(data.get("userId", "")).strip()

    env_path = Path(".env")
    env_vars = dotenv_values(env_path)
    admin_ids = set(map(str.strip, env_vars.get("ADMIN_IDS", "").split(",")))
    admin_dop = set(filter(None, map(str.strip, env_vars.get("ADMIN_DOP", "").split(","))))

    if requester_id not in admin_ids:
        return JSONResponse({"status": "error", "message": "Недостаточно прав"}, status_code=403)
    if target_id not in admin_dop:
        return JSONResponse({"status": "error", "message": "Пользователь не является доп. админом"}, status_code=404)

    admin_dop.remove(target_id)
    set_key(env_path, "ADMIN_DOP", ",".join(sorted(admin_dop)))

    return JSONResponse({"status": "ok", "message": f"Пользователь {target_id} удалён из админов."})

@app.get("/api/version-history")
async def get_version_history():
    try:
        return {"content": get_latest_version()}
    except Exception as e:
        return JSONResponse({"error": str(e)}, status_code=500)

@app.post("/api/version-history")
async def update_version_history(request: Request):
    data = await request.json()
    user_id, is_admin, _ = extract_user_roles(data.get("initData", ""))
    if not is_admin:
        return JSONResponse({"error": "Недостаточно прав"}, status_code=403)

    content = data.get("content", "").strip()
    if not content:
        return JSONResponse({"error": "Контент пуст"}, status_code=400)

    try:
        add_version_entry(content)
        return {"message": "Сохранено!"}
    except Exception as e:
        return JSONResponse({"error": str(e)}, status_code=500)

@app.get("/api/version-history/all")
async def all_versions():
    try:
        versions = get_all_versions()
        return {"versions": versions}
    except Exception as e:
        return JSONResponse({"error": str(e)}, status_code=500)


@app.get("/api/news")
async def get_news():
    try:
        from database import get_all_news
        return JSONResponse(get_all_news())
    except Exception as e:
        return JSONResponse({ "error": str(e) }, status_code=500)

@app.post("/api/news")
async def post_news(request: Request):
    try:
        from database import add_news
        body = await request.json()
        add_news(body)
        return JSONResponse({ "status": "ok" })
    except Exception as e:
        return JSONResponse({ "error": str(e) }, status_code=500)



if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=False)
