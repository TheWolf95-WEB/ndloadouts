from fastapi import FastAPI, Request, Body, BackgroundTasks
from fastapi import Query
from fastapi.responses import HTMLResponse, JSONResponse
from fastapi.staticfiles import StaticFiles
from fastapi.templating import Jinja2Templates
from dotenv import load_dotenv, set_key, dotenv_values
from fastapi.middleware.cors import CORSMiddleware
import json
import os
import hmac
import hashlib
import requests
import subprocess
import sqlite3
from pathlib import Path
from urllib.parse import parse_qs
from datetime import datetime
from database import (
    init_db, get_all_builds, add_build, delete_build_by_id, get_all_users,
    save_user, update_build_by_id, add_version_entry, get_latest_version, get_all_versions, modules_grouped_by_category,
    module_add_or_update, module_update, module_delete,
)

load_dotenv()
WEBAPP_URL = os.getenv("WEBAPP_URL")
GITHUB_SECRET = os.getenv("WEBHOOK_SECRET", "")

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["https://ndloadouts.ru"],
    allow_methods=["*"],
    allow_headers=["*"],
)

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

def prettify_time(ts: str):
    if not ts:
        return "-"
    try:
        # парсим как UTC
        dt = datetime.fromisoformat(ts.replace("Z", "+00:00")).astimezone(timezone(timedelta(hours=3)))  
        return dt.strftime("%d.%m.%Y %H:%M:%S")
    except Exception:
        return ts



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

def ensure_admin_from_init(init_data_str: str):
    uid, is_admin, _ = extract_user_roles(init_data_str or "")
    if not is_admin:
        from fastapi import HTTPException
        raise HTTPException(status_code=403, detail="Недостаточно прав")

# ====== MODULES DICT API ======

@app.get("/api/modules/{weapon_type}")
def api_modules_list(weapon_type: str):
    return modules_grouped_by_category(weapon_type)

@app.post("/api/modules")
async def api_modules_add(payload: dict = Body(...)):
    ensure_admin_from_init(payload.get("initData", ""))
    module_add_or_update(
        weapon_type=payload["weapon_type"],
        category=payload["category"],
        en=payload["en"],
        ru=payload["ru"],
        pos=int(payload.get("pos", 0) or 0)
    )
    return {"status": "ok"}

@app.put("/api/modules/{module_id}")
async def api_modules_update(module_id: int, payload: dict = Body(...)):
    ensure_admin_from_init(payload.get("initData", ""))
    module_update(
        module_id,
        category=payload.get("category"),
        en=payload.get("en"),
        ru=payload.get("ru"),
        pos=payload.get("pos")
    )
    return {"status": "ok"}

@app.delete("/api/modules/{module_id}")
async def api_modules_delete(module_id: int, payload: dict = Body(...)):
    ensure_admin_from_init(payload.get("initData", ""))
    module_delete(module_id)
    return {"status": "ok"}


@app.get("/", response_class=HTMLResponse)
async def index(request: Request):
    return templates.TemplateResponse("index.html", {"request": request})

@app.get("/api/builds")
async def api_builds(category: str = Query("all")):
    try:
        builds = get_all_builds()

        if category != "all":
            builds = [b for b in builds if category in (b.get("categories") or [])]

        def top_priority(b):
            if b.get("top1"): return 1
            if b.get("top2"): return 2
            if b.get("top3"): return 3
            return 999

        def date_ts(b):
            s = (b.get("date") or "").strip()
            for fmt in ("%d.%m.%Y", "%Y-%m-%d", "%Y.%m.%d"):
                try:
                    return datetime.strptime(s, fmt).timestamp()
                except Exception:
                    continue
            return 0

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
        add_build(data)
        return JSONResponse({"status": "ok"})
    except Exception as e:
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


# АНАЛИТИКА

ANALYTICS_DB = Path("/opt/ndloadouts_storage/analytics.db")

def init_analytics_db():
    conn = sqlite3.connect(ANALYTICS_DB)
    cur = conn.cursor()
    cur.execute("""
    CREATE TABLE IF NOT EXISTS analytics (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id TEXT,
        action TEXT,
        details TEXT,
        timestamp TEXT
    )
    """)
    cur.execute("""
    CREATE TABLE IF NOT EXISTS errors (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id TEXT,
        error TEXT,
        details TEXT,
        timestamp TEXT
    )
    """)
    cur.execute("""
    CREATE TABLE IF NOT EXISTS user_sessions (
        user_id TEXT PRIMARY KEY,
        last_seen TEXT,
        status TEXT,       -- online/offline
        platform TEXT
    )
    """)
    conn.commit()
    conn.close()


init_analytics_db()

@app.post("/api/analytics")
async def save_analytics(data: dict = Body(...)):
    try:
        user_id = str(data.get("user_id"))
        action = data.get("action")
        details = json.dumps(data.get("details"), ensure_ascii=False)
        timestamp = data.get("timestamp")

        conn = sqlite3.connect(ANALYTICS_DB)
        cur = conn.cursor()
        cur.execute(
            "INSERT INTO analytics (user_id, action, details, timestamp) VALUES (?, ?, ?, ?)",
            (user_id, action, details, timestamp)
        )

        # === обновляем таблицу user_sessions ===
        status = "online" if action == "session_start" else "offline" if action == "session_end" else None
        platform = json.loads(details).get("platform", "") if details else ""
        if status:
            cur.execute("""
                INSERT INTO user_sessions (user_id, last_seen, status, platform)
                VALUES (?, ?, ?, ?)
                ON CONFLICT(user_id) DO UPDATE SET
                  last_seen=excluded.last_seen,
                  status=excluded.status,
                  platform=excluded.platform
            """, (user_id, timestamp, status, platform))
        else:
            # просто обновляем last_seen и платформу
            cur.execute("""
                INSERT INTO user_sessions (user_id, last_seen, status, platform)
                VALUES (?, ?, ?, ?)
                ON CONFLICT(user_id) DO UPDATE SET
                  last_seen=excluded.last_seen,
                  platform=excluded.platform
            """, (user_id, timestamp, "online", platform))

        conn.commit()
        conn.close()
        return {"status": "ok"}
    except Exception as e:
        return JSONResponse({"status": "error", "detail": str(e)}, status_code=500)


@app.get("/api/analytics/users")
async def get_users_status():
    conn = sqlite3.connect(ANALYTICS_DB)
    cur = conn.cursor()
    cur.execute("SELECT user_id, last_seen, status, platform FROM user_sessions")
    rows = cur.fetchall()
    conn.close()

    users = {str(u["id"]): u for u in get_all_users()}

    result = []
    for user_id, last_seen, status, platform in rows:
        u = users.get(str(user_id), {})
        result.append({
            "user": f"{user_id} - {u.get('first_name','')} (@{u.get('username','')})",
            "status": "🟢 Онлайн" if status == "online" else "⚪ Оффлайн",
            "platform": "💻 ПК" if platform in ("tdesktop", "web") else "📱 Телефон" if platform else "-",
            "last_seen": last_seen
        })

    # сортировка: онлайн первыми
    result.sort(key=lambda x: 0 if "Онлайн" in x["status"] else 1)
    return {"users": result}



@app.post("/api/errors")
async def save_error(data: dict = Body(...)):
    try:
        conn = sqlite3.connect(ANALYTICS_DB)
        cur = conn.cursor()
        cur.execute(
            "INSERT INTO errors (user_id, error, details, timestamp) VALUES (?, ?, ?, ?)",
            (
                data.get("user_id"),
                data.get("error"),
                json.dumps(data.get("details"), ensure_ascii=False),
                data.get("timestamp"),
            )
        )
        conn.commit()
        conn.close()
        return {"status": "ok"}
    except Exception as e:
        return JSONResponse({"status": "error", "detail": str(e)}, status_code=500)

@app.get("/api/analytics/errors")
async def get_errors():
 conn = sqlite3.connect(ANALYTICS_DB)
 cur = conn.cursor()
 cur.execute("SELECT user_id, error, details, timestamp FROM errors ORDER BY id DESC LIMIT 100")
 rows = cur.fetchall()
 conn.close()

 users = {str(u["id"]): u for u in get_all_users()}

 errors = []
 for user_id, error, details, timestamp in rows:
     user = users.get(str(user_id), {})
     errors.append({
         "user": f"{user_id} - {user.get('first_name','')} (@{user.get('username','')})",
         "error": error,
         "details": details,
         "time": prettify_time(timestamp)   # 🔥 здесь форматируем
     })

 return {"errors": errors}




# Получение Аналитики 
@app.get("/analytics", response_class=HTMLResponse)
async def analytics_page(request: Request):
    conn = sqlite3.connect("/opt/ndloadouts_storage/analytics.db")
    cur = conn.cursor()
    cur.execute("SELECT user_id, action, details, timestamp FROM analytics ORDER BY id DESC LIMIT 100")
    rows = cur.fetchall()
    conn.close()

    return templates.TemplateResponse("analytics.html", {"request": request, "rows": rows})

@app.get("/api/analytics/latest")
async def get_latest_analytics():
    conn = sqlite3.connect("/opt/ndloadouts_storage/analytics.db")
    cur = conn.cursor()
    cur.execute("SELECT user_id, action, details, timestamp FROM analytics ORDER BY id DESC LIMIT 200")
    rows = cur.fetchall()
    conn.close()

    users = {str(u["id"]): u for u in get_all_users()}

    def prettify_action(action: str, details_json: str):
        try:
            details = json.loads(details_json or "{}")
        except:
            details = {}

        if action == "view_build":
            # 🔑 название сборки приоритетно, если пусто → название оружия
            title = details.get("title")
            weapon = details.get("weapon_name")
            final = title.strip() if title and title.strip() else weapon or "без названия"
            return f"🔫 Просмотр сборки: {final}"

        mapping = {
            "session_start": "🔵 Начало сессии",
            "session_end": "🔴 Конец сессии",
            "open_screen": f"📂 Открытие экрана: {details.get('screen','неизвестно')}",
            "switch_category": f"📑 Категория: {details.get('category','')}",
            "switch_tab": f"📌 Вкладка: {details.get('tab','')}",
            "click_button": f"🖱 Кнопка: {details.get('button','')}",
            "search": f"🔍 Поиск: {details.get('query','')}"
        }
        return mapping.get(action, action)

    def prettify_platform(details_json: str):
        try:
            details = json.loads(details_json or "{}")
            platform = details.get("platform", "")
            if platform in ("tdesktop", "web"):
                return "💻 ПК"
            elif platform in ("android", "ios"):
                return "📱 Телефон"
            elif platform:
                return platform
            return "-"
        except:
            return "-"

    def prettify_status(action: str):
        return "⚪ Оффлайн" if action == "session_end" else "🟢 Онлайн"

    def prettify_time(ts: str):
        try:
            dt = datetime.fromisoformat(ts.replace("Z", "+00:00"))
            return dt.strftime("%d.%m.%Y %H:%M:%S")
        except:
            return ts

    analytics = []
    for user_id, action, details, timestamp in rows:
        user = users.get(str(user_id), {})
        analytics.append({
            "user": f"{user_id} - {user.get('first_name','')} (@{user.get('username','')})",
            "action": prettify_action(action, details),
            "platform": prettify_platform(details),
            "status": prettify_status(action),
            "time": prettify_time(timestamp)
        })

    return {"analytics": analytics}




if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=False)
