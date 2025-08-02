from fastapi import FastAPI, Request, Body, BackgroundTasks
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

from database import init_db, get_all_builds, add_build, delete_build_by_id, get_all_users, save_user,  update_build_by_id 

# Загрузка .env
load_dotenv()
WEBAPP_URL = os.getenv("WEBAPP_URL")
GITHUB_SECRET = os.getenv("WEBHOOK_SECRET", "")

VERSION_FILE = Path("data/version-history.html")

app = FastAPI()

# === GitHub Webhook ===
@app.post("/webhook")
async def webhook(request: Request, background_tasks: BackgroundTasks):
    body = await request.body()
    signature = request.headers.get("X-Hub-Signature-256")

    # Проверка подписи
    if not signature or not hmac.compare_digest(
        signature,
        "sha256=" + hmac.new(GITHUB_SECRET.encode(), body, hashlib.sha256).hexdigest()
    ):
        return JSONResponse(status_code=403, content={"error": "Invalid signature"})

    # Запуск скрипта обновления в фоне
    background_tasks.add_task(subprocess.call, ["/bin/bash", "/opt/ndloadouts/deploy.sh"])
    return {"status": "ok"}

# === Подключение статики и шаблонов ===
app.mount("/static", StaticFiles(directory="static"), name="static")
app.mount("/data", StaticFiles(directory="data"), name="data")
templates = Jinja2Templates(directory="templates")

# === Инициализация БД ===
init_db()

# === Главная страница ===
@app.get("/", response_class=HTMLResponse)
async def index(request: Request):
    return templates.TemplateResponse("index.html", {"request": request})

# === Получение сборок ===
@app.get("/api/builds")
async def api_builds():
    return JSONResponse(get_all_builds())

# === Добавление сборки ===
@app.post("/api/builds")
async def create_build(data: dict = Body(...)):
    try:
        add_build(data)
        return JSONResponse({"status": "ok"})
    except Exception as e:
        print(f"[add_build] Ошибка при добавлении сборки: {e}")
        return JSONResponse({"status": "error", "detail": str(e)}, status_code=500)


# === Получение типов оружия ===
@app.get("/api/types")
def get_weapon_types():
    with open("data/types.json", "r", encoding="utf-8") as f:
        types = json.load(f)
    return JSONResponse(types)

from fastapi import Query
from urllib.parse import parse_qs
from starlette.requests import Request

# === /api/me — Получение информации о пользователе
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

        # ✅ Сохраняем пользователя
        save_user(user_id, first_name, username)

        # ✅ Получаем переменные окружения напрямую из .env
        env_vars = dotenv_values(".env")
        admin_ids = set(map(str.strip, env_vars.get("ADMIN_IDS", "").split(",")))
        admin_dop = set(map(str.strip, env_vars.get("ADMIN_DOP", "").split(",")))

        is_super_admin = user_id in admin_ids
        is_admin = is_super_admin or user_id in admin_dop

        return JSONResponse({
            "user_id": user_id,
            "first_name": first_name,
            "is_admin": is_admin,
            "is_super_admin": is_super_admin,
            "admin_ids": list(admin_ids),
            "admin_dop": list(admin_dop)  # можно убрать позже
        })

    except Exception as e:
        return JSONResponse({
            "error": "Invalid user data",
            "detail": str(e),
            "raw": user_data
        }, status_code=400)



# функция удаления сборки

@app.delete("/api/builds/{build_id}")
def delete_build(build_id: str):
    try:
        delete_build_by_id(build_id)
        return {"status": "ok"}
    except Exception as e:
        return JSONResponse({"status": "error", "detail": str(e)}, status_code=500)

# Функция редактирования сборок

@app.put("/api/builds/{build_id}")
async def update_build(build_id: str, data: dict = Body(...)):
    try:
        update_build_by_id(build_id, data)
        return JSONResponse({"status": "ok"})
    except Exception as e:
        return JSONResponse({"status": "error", "detail": str(e)}, status_code=500)


# Эндпоинт получения всех админов:

@app.get("/api/admins")
async def get_admins():
    users = get_all_users()  # из БД или JSON (должны быть user_id и first_name)

    admin_ids = set(map(str.strip, os.getenv("ADMIN_IDS", "").split(",")))
    admin_dop = set(map(str.strip, os.getenv("ADMIN_DOP", "").split(",")))

    def get_name(uid):
        user = next((u for u in users if str(u["id"]) == uid), None)
        return user["first_name"] if user else "Без имени"

    return {
        "main_admins": [{"id": uid, "name": get_name(uid)} for uid in admin_ids],
        "dop_admins": [{"id": uid, "name": get_name(uid)} for uid in admin_dop]
    }



# добавления админа

@app.post("/api/assign-admin")
async def assign_admin(data: dict = Body(...)):
    requester_id = str(data.get("requesterId", "")).strip()
    user_id = str(data.get("userId", "")).strip()

    # Проверка корректности ID
    if not requester_id.isdigit() or not user_id.isdigit():
        return JSONResponse({"status": "error", "message": "Некорректный ID"}, status_code=400)

    env_path = Path(".env")
    env_vars = dotenv_values(env_path)

    admin_ids = set(filter(None, map(str.strip, env_vars.get("ADMIN_IDS", "").split(","))))
    admin_dop = set(filter(None, map(str.strip, env_vars.get("ADMIN_DOP", "").split(","))))

    # Разрешить только главному админу
    if requester_id not in admin_ids:
        return JSONResponse({"status": "error", "message": "Недостаточно прав"}, status_code=403)

    # Уже админ (главный или доп)
    if user_id in admin_ids or user_id in admin_dop:
        return JSONResponse({"status": "ok", "message": "Пользователь уже админ."})

    # Добавить пользователя в ADMIN_DOP
    admin_dop.add(user_id)
    new_value = ",".join(sorted(admin_dop))
    set_key(env_path, "ADMIN_DOP", new_value)

    # Отправка уведомления через Telegram
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
                json={
                    "chat_id": user_id,
                    "text": message,
                    "parse_mode": "HTML"
                },
                timeout=5
            )
        except Exception as e:
            print(f"[!] Ошибка отправки уведомления: {e}")

    return JSONResponse({"status": "ok", "message": f"Пользователь {user_id} назначен админом."})


# Эндпоинт удаления доп-админа:

@app.post("/api/remove-admin")
async def remove_admin(data: dict = Body(...)):
    requester_id = str(data.get("requesterId", "")).strip()
    target_id = str(data.get("userId", "")).strip()

    if not requester_id.isdigit() or not target_id.isdigit():
        return JSONResponse({"status": "error", "message": "Некорректный ID"}, status_code=400)

    env_path = Path(".env")
    env_vars = dotenv_values(env_path)

    admin_ids = set(map(str.strip, env_vars.get("ADMIN_IDS", "").split(",")))
    admin_dop = set(filter(None, map(str.strip, env_vars.get("ADMIN_DOP", "").split(","))))

    # Только супер админ может удалять
    if requester_id not in admin_ids:
        return JSONResponse({"status": "error", "message": "Недостаточно прав"}, status_code=403)

    if target_id not in admin_dop:
        return JSONResponse({"status": "error", "message": "Пользователь не является доп. админом"}, status_code=404)

    admin_dop.remove(target_id)
    set_key(env_path, "ADMIN_DOP", ",".join(sorted(admin_dop)))

    return JSONResponse({"status": "ok", "message": f"Пользователь {target_id} удалён из админов."})


# версии приложений

@app.get("/api/version-history")
async def get_version_history():
    if VERSION_FILE.exists():
        return {"content": VERSION_FILE.read_text(encoding="utf-8")}
    return {"content": ""}

@app.post("/api/version-history")
async def update_version_history(data: dict = Body(...)):
    content = data.get("content", "")
    VERSION_FILE.write_text(content, encoding="utf-8")
    return {"message": "Сохранено!"}
