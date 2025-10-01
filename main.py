# main.py - исправленная версия
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
from datetime import datetime, timezone, timedelta
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
    allow_origins=["*"],  # Разрешаем все для тестирования
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# --- Утилита для проверки прав ---
def extract_user_roles(init_data_str: str):
    try:
        if not init_data_str:
            return None, False, False
            
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
    except Exception as e:
        print(f"Error extracting user roles: {e}")
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
    user_id, is_admin, _ = extract_user_roles(data.get("initData", ""))
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

# АНАЛИТИКА - ПОЛНАЯ И КРАСИВАЯ ВЕРСИЯ

ANALYTICS_DB = Path("/opt/ndloadouts_storage/analytics.db")

def init_analytics_db():
    try:
        ANALYTICS_DB.parent.mkdir(parents=True, exist_ok=True)
        
        conn = sqlite3.connect(ANALYTICS_DB)
        cur = conn.cursor()
        
        # Основные события
        cur.execute("""
        CREATE TABLE IF NOT EXISTS analytics (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id TEXT,
            action TEXT,
            details TEXT,
            timestamp TEXT
        )
        """)
        
        # Ошибки
        cur.execute("""
        CREATE TABLE IF NOT EXISTS errors (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id TEXT,
            error TEXT,
            details TEXT,
            timestamp TEXT
        )
        """)
        
        # Пользователи (расширенная информация)
        cur.execute("""
        CREATE TABLE IF NOT EXISTS user_profiles (
            user_id TEXT PRIMARY KEY,
            first_name TEXT,
            username TEXT,
            last_seen TEXT,
            platform TEXT,
            total_actions INTEGER DEFAULT 0,
            first_seen TEXT,
            last_action TEXT
        )
        """)
        
        conn.commit()
        conn.close()
        print("✅ Analytics DB initialized")
    except Exception as e:
        print(f"❌ Analytics DB error: {e}")

init_analytics_db()

@app.post("/api/analytics")
async def save_analytics(data: dict = Body(...)):
    try:
        user_id = data.get("user_id", "anonymous")
        action = data.get("action", "unknown")
        details = data.get("details", {})
        timestamp = data.get("timestamp")
        
        if user_id == "anonymous":
            return {"status": "ok"}  # Пропускаем анонимных
            
        details_json = json.dumps(details, ensure_ascii=False) if details else "{}"
        
        conn = sqlite3.connect(ANALYTICS_DB)
        cur = conn.cursor()
        
        # Сохраняем событие
        cur.execute(
            "INSERT INTO analytics (user_id, action, details, timestamp) VALUES (?, ?, ?, ?)",
            (str(user_id), action, details_json, timestamp)
        )
        
        # Обновляем профиль пользователя
        platform = details.get("platform", "unknown")
        now_iso = datetime.now().isoformat()
        
        cur.execute("""
            INSERT INTO user_profiles (user_id, first_name, username, last_seen, platform, total_actions, first_seen, last_action)
            VALUES (?, ?, ?, ?, ?, 1, ?, ?)
            ON CONFLICT(user_id) DO UPDATE SET
                last_seen = excluded.last_seen,
                platform = excluded.platform,
                total_actions = total_actions + 1,
                last_action = excluded.last_action
        """, (str(user_id), "", "", timestamp, platform, now_iso, action))
        
        conn.commit()
        conn.close()
        return {"status": "ok"}
    except Exception as e:
        print(f"❌ Analytics save error: {e}")
        return JSONResponse({"status": "error", "detail": str(e)}, status_code=500)

@app.get("/api/analytics/dashboard")
async def get_analytics_dashboard():
    try:
        conn = sqlite3.connect(ANALYTICS_DB)
        cur = conn.cursor()
        
        # Общая статистика
        cur.execute("SELECT COUNT(*) FROM user_profiles")
        total_users = cur.fetchone()[0]
        
        # Онлайн (активны последние 5 минут)
        five_min_ago = (datetime.now() - timedelta(minutes=5)).isoformat()
        cur.execute("SELECT COUNT(*) FROM user_profiles WHERE last_seen > ?", (five_min_ago,))
        online_users = cur.fetchone()[0]
        
        cur.execute("SELECT COUNT(*) FROM analytics")
        total_actions = cur.fetchone()[0]
        
        cur.execute("SELECT COUNT(*) FROM errors")
        total_errors = cur.fetchone()[0]
        
        # Популярные действия
        cur.execute("""
            SELECT action, COUNT(*) as count 
            FROM analytics 
            WHERE action != 'session_start' AND action != 'session_end'
            GROUP BY action 
            ORDER BY count DESC 
            LIMIT 10
        """)
        popular_actions = cur.fetchall()
        
        # Все пользователи с детальной информацией
        cur.execute("""
            SELECT 
                user_id, first_name, username, last_seen, platform, 
                total_actions, first_seen, last_action
            FROM user_profiles 
            ORDER BY last_seen DESC
            LIMIT 100
        """)
        users_data = cur.fetchall()
        
        # Последние действия всех пользователей
        cur.execute("""
            SELECT a.user_id, a.action, a.details, a.timestamp,
                   u.first_name, u.username, u.platform
            FROM analytics a
            LEFT JOIN user_profiles u ON a.user_id = u.user_id
            WHERE a.user_id != 'anonymous'
            ORDER BY a.timestamp DESC
            LIMIT 50
        """)
        actions_data = cur.fetchall()
        
        conn.close()

        # Форматируем популярные действия
        formatted_popular_actions = []
        for action, count in popular_actions:
            action_name = {
                'view_build': '👀 Просмотры сборок',
                'search': '🔍 Поиски',
                'open_screen': '📱 Открытия экранов',
                'switch_category': '📂 Смена категорий'
            }.get(action, action)
            formatted_popular_actions.append({"action": action_name, "count": count})

        # Форматируем пользователей
        formatted_users = []
        for user_id, first_name, username, last_seen, platform, total_actions, first_seen, last_action in users_data:
            # Определяем статус
            if last_seen:
                last_seen_dt = datetime.fromisoformat(last_seen.replace('Z', '+00:00'))
                time_diff = datetime.now(timezone.utc) - last_seen_dt
                is_online = time_diff.total_seconds() < 300  # 5 минут
            else:
                is_online = False
            
            # Форматируем имя пользователя
            user_display = first_name or username or f"ID: {user_id}"
            if username:
                user_display = f"{first_name or 'Пользователь'} (@{username})"
            
            # Форматируем последнее действие
            last_action_text = {
                'session_start': '🟢 Вошел в бот',
                'view_build': '🔫 Смотрел сборку',
                'search': '🔍 Искал',
                'open_screen': '📱 Открыл экран'
            }.get(last_action, last_action)
            
            formatted_users.append({
                "id": user_id,
                "name": user_display,
                "status": "online" if is_online else "offline",
                "platform": platform,
                "actions_count": total_actions,
                "last_seen": prettify_time(last_seen),
                "first_seen": prettify_time(first_seen),
                "last_action": last_action_text
            })

        # Форматируем действия
        formatted_actions = []
        for user_id, action, details, timestamp, first_name, username, platform in actions_data:
            user_display = first_name or username or f"ID: {user_id}"
            if username:
                user_display = f"{first_name or 'Пользователь'} (@{username})"
            
            # Детали действия
            action_details = ""
            try:
                details_obj = json.loads(details) if details else {}
                if action == 'view_build':
                    title = details_obj.get('title', '')
                    weapon = details_obj.get('weapon_name', '')
                    action_details = title or weapon or 'сборку'
                elif action == 'search':
                    query = details_obj.get('query', '')
                    action_details = f"«{query}»" if query else ''
                elif action == 'open_screen':
                    screen = details_obj.get('screen', '')
                    action_details = screen
            except:
                pass
            
            action_text = {
                'session_start': '🟢 Вошел в бот',
                'session_end': '🔴 Вышел из бота', 
                'view_build': f'🔫 Просмотр сборки {action_details}',
                'search': f'🔍 Поиск {action_details}',
                'open_screen': f'📱 Открыл {action_details}',
                'switch_category': f'📂 Сменил категорию {action_details}'
            }.get(action, action)
            
            formatted_actions.append({
                "user": user_display,
                "action": action_text,
                "platform": "💻" if platform in ["tdesktop", "web"] else "📱",
                "time": prettify_time(timestamp),
                "user_id": user_id
            })

        return {
            "stats": {
                "total_users": total_users,
                "online_users": online_users,
                "total_actions": total_actions,
                "total_errors": total_errors
            },
            "popular_actions": formatted_popular_actions,
            "users": formatted_users,
            "recent_activity": formatted_actions
        }
        
    except Exception as e:
        print(f"❌ Dashboard error: {e}")
        return {
            "stats": {"total_users": 0, "online_users": 0, "total_actions": 0, "total_errors": 0},
            "popular_actions": [],
            "users": [],
            "recent_activity": []
        }

@app.get("/api/analytics/user/{user_id}")
async def get_user_analytics(user_id: str):
    """Детальная аналитика по конкретному пользователю"""
    try:
        conn = sqlite3.connect(ANALYTICS_DB)
        cur = conn.cursor()
        
        # Информация о пользователе
        cur.execute("SELECT * FROM user_profiles WHERE user_id = ?", (user_id,))
        user_data = cur.fetchone()
        
        # Последние действия пользователя
        cur.execute("""
            SELECT action, details, timestamp 
            FROM analytics 
            WHERE user_id = ? 
            ORDER BY timestamp DESC 
            LIMIT 50
        """, (user_id,))
        user_actions = cur.fetchall()
        
        conn.close()
        
        if not user_data:
            return {"error": "User not found"}
            
        # Форматируем данные пользователя
        user_info = {
            "id": user_data[0],
            "first_name": user_data[1],
            "username": user_data[2],
            "last_seen": prettify_time(user_data[3]),
            "platform": user_data[4],
            "total_actions": user_data[5],
            "first_seen": prettify_time(user_data[6]),
            "last_action": user_data[7]
        }
        
        # Форматируем действия
        formatted_actions = []
        for action, details, timestamp in user_actions:
            action_details = ""
            try:
                details_obj = json.loads(details) if details else {}
                if action == 'view_build':
                    action_details = details_obj.get('title') or details_obj.get('weapon_name') or ''
                elif action == 'search':
                    action_details = details_obj.get('query', '')
            except:
                pass
                
            formatted_actions.append({
                "action": action,
                "details": action_details,
                "time": prettify_time(timestamp)
            })
        
        return {
            "user": user_info,
            "actions": formatted_actions
        }
        
    except Exception as e:
        return {"error": str(e)}

@app.get("/analytics", response_class=HTMLResponse)
async def analytics_page(request: Request):
    return templates.TemplateResponse("analytics.html", {"request": request})




if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=False)
