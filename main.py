from fastapi import FastAPI, Request, Body, BackgroundTasks
from fastapi import Query
from fastapi.responses import HTMLResponse, JSONResponse
from fastapi.staticfiles import StaticFiles
from fastapi.templating import Jinja2Templates
from dotenv import load_dotenv, set_key, dotenv_values
from fastapi.middleware.cors import CORSMiddleware
from fastapi import HTTPException
import json
import os
import hmac
import hashlib
import requests
import subprocess
import sqlite3
import asyncio
from typing import List
from pathlib import Path
from urllib.parse import parse_qs, unquote
from datetime import datetime, timezone, timedelta
from database import (
    init_db, get_all_builds, add_build, delete_build_by_id, get_all_users,
    save_user, update_build_by_id, modules_grouped_by_category,
    module_add_or_update, module_update, module_delete,
)

load_dotenv()

ANALYTICS_DB = Path("/opt/ndloadouts_storage/analytics.db")

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


@app.get("/")
async def index(request: Request):
    version = int(datetime.utcnow().timestamp())  # каждая загрузка — новый timestamp
    return templates.TemplateResponse("index.html", {"request": request, "version": version})

# --- Утилита для проверки прав ---
def extract_user_roles(init_data_str: str):
    try:
        if not init_data_str:
            return None, False, False

        parsed = parse_qs(init_data_str)
        user_data = parsed.get("user", [None])[0]
        if not user_data:
            return None, False, False

        # Декодируем строку
        user_json = json.loads(unquote(user_data))
        user_id = str(user_json.get("id"))

        env_vars = dotenv_values("/opt/ndloadouts/.env")
        admin_ids = set(x.strip() for x in env_vars.get("ADMIN_IDS", "").split(",") if x.strip())
        admin_dop = set(x.strip() for x in env_vars.get("ADMIN_DOP", "").split(",") if x.strip())

        is_super_admin = user_id in admin_ids
        is_admin = is_super_admin or user_id in admin_dop

        return user_id, is_admin, is_super_admin
    except Exception as e:
        print(f"[extract_user_roles ERROR] {e}")
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
        # === Уникальные категории: снимаем с других сборок "Новинки" и "Популярное" ===
        conn = sqlite3.connect("/opt/ndloadouts_storage/builds.db")
        cursor = conn.cursor()

        for unique_cat in ["Новинки", "Популярное"]:
            if unique_cat in data.get("categories", []):
                cursor.execute("SELECT id, categories FROM builds")
                for row in cursor.fetchall():
                    b_id, cats_raw = row
                    try:
                        cats = eval(cats_raw) if isinstance(cats_raw, str) else cats_raw
                    except:
                        cats = []
                    if unique_cat in cats:
                        cats = [c for c in cats if c != unique_cat]
                        cursor.execute("UPDATE builds SET categories = ? WHERE id = ?", (str(cats), b_id))

        conn.commit()
        conn.close()

        # === Сохраняем сборку ===
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
        # === Уникальные категории: снимаем с других сборок "Новинки" и "Популярное" ===
        conn = sqlite3.connect("/opt/ndloadouts_storage/builds.db")
        cursor = conn.cursor()

        for unique_cat in ["Новинки", "Популярное"]:
            if unique_cat in body.get("categories", []):
                cursor.execute("SELECT id, categories FROM builds")
                for row in cursor.fetchall():
                    b_id, cats_raw = row
                    try:
                        cats = eval(cats_raw) if isinstance(cats_raw, str) else cats_raw
                    except:
                        cats = []
                    if unique_cat in cats and str(b_id) != str(build_id):
                        cats = [c for c in cats if c != unique_cat]
                        cursor.execute("UPDATE builds SET categories = ? WHERE id = ?", (str(cats), b_id))

        conn.commit()
        conn.close()

        # === Обновляем сборку ===
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
    import datetime
    init_data = data.get("initData", "")
    parsed = parse_qs(init_data)
    user_data = parsed.get("user", [None])[0]

    if not user_data:
        print(f"[{datetime.datetime.now()}] [API /me] ❌ Нет user_data в initData")
        return JSONResponse({"error": "No user info"}, status_code=400)

    try:
        user_json = json.loads(user_data)
        user_id = str(user_json.get("id"))
        first_name = user_json.get("first_name", "")
        username = user_json.get("username", "")

        save_user(user_id, first_name, username)

        env_vars = dotenv_values("/opt/ndloadouts/.env")
        admin_ids = set(map(str.strip, env_vars.get("ADMIN_IDS", "").split(",")))
        admin_dop = set(map(str.strip, env_vars.get("ADMIN_DOP", "").split(",")))

        is_super_admin = user_id in admin_ids
        is_admin = is_super_admin or user_id in admin_dop

        # 🧩 Логируем
        print(
            f"[{datetime.datetime.now()}] [API /me] "
            f"user_id={user_id} ({first_name}) | username=@{username or '-'} | "
            f"is_admin={is_admin} | is_super_admin={is_super_admin}"
        )

        return JSONResponse({
            "user_id": user_id,
            "first_name": first_name,
            "is_admin": is_admin,
            "is_super_admin": is_super_admin
        })

    except Exception as e:
        print(f"[{datetime.datetime.now()}] [API /me] ⚠️ Ошибка: {e}")
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


### РАССЫЛКА


# Эндпоинты для рассылки
@app.get("/api/analytics/broadcast-users")
async def get_broadcast_users():
    """Получить всех пользователей для рассылки"""
    try:
        conn = sqlite3.connect(ANALYTICS_DB)
        cur = conn.cursor()
        
        cur.execute("""
            SELECT user_id, first_name, username 
            FROM user_profiles 
            WHERE user_id != 'anonymous'
            ORDER BY last_seen DESC
        """)
        users = cur.fetchall()
        conn.close()
        
        formatted_users = []
        for user_id, first_name, username in users:
            formatted_users.append({
                "id": user_id,
                "name": f"{first_name or 'Пользователь'}" + (f" (@{username})" if username else ""),
                "username": username
            })
        
        return {"users": formatted_users}
        
    except Exception as e:
        return JSONResponse({"error": str(e)}, status_code=500)

@app.post("/api/analytics/broadcast")
async def send_broadcast(data: dict = Body(...)):
    """Отправить рассылку пользователям"""
    try:
        message = data.get("message", "").strip()
        user_ids = data.get("user_ids", [])
        
        if not message:
            return JSONResponse({"error": "Сообщение не может быть пустым"}, status_code=400)
        
        if not user_ids:
            return JSONResponse({"error": "Не выбраны пользователи"}, status_code=400)
        
        # Отправка сообщений через бота
        bot_token = os.getenv("TOKEN")
        if not bot_token:
            return JSONResponse({"error": "Токен бота не настроен"}, status_code=500)
        
        success_count = 0
        failed_count = 0
        results = []
        
        for target_user_id in user_ids:
            try:
                # Отправляем сообщение через Telegram Bot API
                response = requests.post(
                    f"https://api.telegram.org/bot{bot_token}/sendMessage",
                    json={
                        "chat_id": target_user_id,
                        "text": f"📢 Рассылка от NDHQ:\n\n{message}",
                        "parse_mode": "HTML"
                    },
                    timeout=10
                )
                
                if response.status_code == 200:
                    success_count += 1
                    results.append({"user_id": target_user_id, "status": "success"})
                else:
                    failed_count += 1
                    results.append({"user_id": target_user_id, "status": "failed", "error": response.text})
                
                # Небольшая задержка чтобы не превысить лимиты Telegram
                await asyncio.sleep(0.1)
                
            except Exception as e:
                failed_count += 1
                results.append({"user_id": target_user_id, "status": "failed", "error": str(e)})
        
        return {
            "status": "ok",
            "message": f"Рассылка отправлена: {success_count} успешно, {failed_count} с ошибками",
            "success_count": success_count,
            "failed_count": failed_count,
            "results": results
        }
        
    except Exception as e:
        return JSONResponse({"error": str(e)}, status_code=500)


# АНАЛИТИКА - УЛУЧШЕННАЯ ВЕРСИЯ

def init_analytics_db():
    try:
        ANALYTICS_DB.parent.mkdir(parents=True, exist_ok=True)
        
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
        
        if user_id == "anonymous" or not user_id:
            return {"status": "ok"}
            
        details_json = json.dumps(details, ensure_ascii=False) if details else "{}"
        
        conn = sqlite3.connect(ANALYTICS_DB)
        cur = conn.cursor()
        
        # Быстрое сохранение события
        cur.execute(
            "INSERT INTO analytics (user_id, action, details, timestamp) VALUES (?, ?, ?, ?)",
            (str(user_id), action, details_json, timestamp)
        )
        
        # Быстрое обновление профиля пользователя
        platform = details.get("platform", "unknown")
        now_iso = datetime.now().isoformat()
        
        # Получаем данные пользователя из Telegram
        user_info = {}
        try:
            if user_id and user_id != "anonymous":
                users = get_all_users()
                user_info = next((u for u in users if str(u["id"]) == str(user_id)), {})
        except:
            user_info = {}
        
        cur.execute("""
            INSERT INTO user_profiles (user_id, first_name, username, last_seen, platform, total_actions, first_seen, last_action)
            VALUES (?, ?, ?, ?, ?, 1, ?, ?)
            ON CONFLICT(user_id) DO UPDATE SET
                last_seen = excluded.last_seen,
                platform = excluded.platform,
                total_actions = total_actions + 1,
                last_action = excluded.last_action
        """, (
            str(user_id), 
            user_info.get('first_name', ''),
            user_info.get('username', ''),
            timestamp, 
            platform, 
            now_iso, 
            action
        ))
        
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
        
        # Онлайн (активны последние 2 минуты - быстрее обновление!)
        two_min_ago = (datetime.now() - timedelta(minutes=2)).isoformat()
        cur.execute("SELECT COUNT(*) FROM user_profiles WHERE last_seen > ?", (two_min_ago,))
        online_users = cur.fetchone()[0]
        
        cur.execute("SELECT COUNT(*) FROM analytics")
        total_actions = cur.fetchone()[0]
        
        cur.execute("SELECT COUNT(*) FROM errors")
        total_errors = cur.fetchone()[0]
        
        # Популярные действия
        cur.execute("""
            SELECT action, COUNT(*) as count 
            FROM analytics 
            WHERE action NOT IN ('session_start', 'session_end', 'click_button')
            GROUP BY action 
            ORDER BY count DESC 
            LIMIT 8
        """)
        popular_actions = cur.fetchall()
        
        # Все пользователи за все время
        cur.execute("""
            SELECT 
                user_id, first_name, username, last_seen, platform, 
                total_actions, first_seen, last_action
            FROM user_profiles 
            ORDER BY last_seen DESC
        """)
        users_data = cur.fetchall()
        
        # Последние действия (быстрая выборка)
        cur.execute("""
            SELECT a.user_id, a.action, a.details, a.timestamp,
                   u.first_name, u.username, u.platform
            FROM analytics a
            LEFT JOIN user_profiles u ON a.user_id = u.user_id
            WHERE a.user_id != 'anonymous'
            ORDER BY a.timestamp DESC
            LIMIT 30
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
                'switch_category': '📂 Смена категорий',
                'click_button': '🖱️ Клики'
            }.get(action, action)
            formatted_popular_actions.append({"action": action_name, "count": count})

        # Форматируем пользователей
        formatted_users = []
        for user_id, first_name, username, last_seen, platform, total_actions, first_seen, last_action in users_data:
            # Определяем статус (2 минуты для онлайн)
            if last_seen:
                try:
                    last_seen_dt = datetime.fromisoformat(last_seen.replace('Z', '+00:00'))
                    time_diff = datetime.now(timezone.utc) - last_seen_dt
                    is_online = time_diff.total_seconds() < 120  # 2 минуты
                except:
                    is_online = False
            else:
                is_online = False
            
            # Форматируем имя пользователя с ID
            user_display = f"{first_name or 'Пользователь'}"
            if username:
                user_display += f" (@{username})"
            user_display += f" | ID: {user_id}"
            
            # Форматируем последнее действие
            last_action_text = {
                'session_start': '🟢 Вошел в бот',
                'view_build': '🔫 Смотрел сборку',
                'search': '🔍 Искал',
                'open_screen': '📱 Открыл экран',
                'click_button': '🖱️ Кликнул',
                'switch_category': '📂 Сменил категорию'
            }.get(last_action, last_action)
            
            formatted_users.append({
                "id": user_id,
                "name": user_display,
                "username": username,
                "first_name": first_name,
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
            user_display = f"{first_name or 'Пользователь'}"
            if username:
                user_display += f" (@{username})"
            user_display += f" | ID: {user_id}"
            
            # Детали действия
            action_details = ""
            try:
                details_obj = json.loads(details) if details else {}
                if action == 'view_build':
                    title = details_obj.get('title', '')
                    weapon = details_obj.get('weapon_name', '')
                    action_details = f"«{title or weapon or 'сборку'}»"
                elif action == 'search':
                    query = details_obj.get('query', '')
                    action_details = f"«{query}»" if query else ''
                elif action == 'open_screen':
                    screen = details_obj.get('screen', '')
                    action_details = screen
                elif action == 'click_button':
                    button = details_obj.get('button', '')
                    action_details = button
            except:
                pass
            
            action_text = {
                'session_start': '🟢 Вошел в бот',
                'session_end': '🔴 Вышел из бота', 
                'view_build': f'🔫 Просмотр {action_details}',
                'search': f'🔍 Поиск {action_details}',
                'open_screen': f'📱 Открыл {action_details}',
                'switch_category': f'📂 Сменил категорию {action_details}',
                'click_button': f'🖱️ Кликнул {action_details}'
            }.get(action, action)
            
            formatted_actions.append({
                "user": user_display,
                "user_id": user_id,
                "username": username,
                "action": action_text,
                "platform": "💻" if platform in ["tdesktop", "web"] else "📱",
                "time": prettify_time(timestamp)
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

@app.delete("/api/analytics/clear")
async def clear_analytics():
    """Очистка всей статистики"""
    try:
        conn = sqlite3.connect(ANALYTICS_DB)
        cur = conn.cursor()
        
        cur.execute("DELETE FROM analytics")
        cur.execute("DELETE FROM errors")
        cur.execute("DELETE FROM user_profiles")
        
        conn.commit()
        conn.close()
        
        return {"status": "ok", "message": "Вся статистика очищена"}
    except Exception as e:
        return JSONResponse({"status": "error", "message": str(e)}, status_code=500)


@app.get("/analytics", response_class=HTMLResponse)
async def analytics_page(request: Request):
    return templates.TemplateResponse("analytics.html", {"request": request})



# --- Battlefield: базы, сборки, модули, типы, испытания ---
from database_bf import (
    init_bf_db,
    get_bf_conn,
    get_all_categories, add_category, delete_category,
    add_challenge, update_challenge, delete_challenge,
    get_all_bf_builds, add_bf_build, update_bf_build, delete_bf_build,
    get_bf_weapon_types, add_bf_weapon_type, delete_bf_weapon_type,
    get_bf_modules_by_type, add_bf_module, delete_bf_module,
    init_bf_builds_table, init_bf_types_modules_tables
)



@app.on_event("startup")
def init_bf_tables():
    """Инициализация таблицы сборок Battlefield при запуске"""
    try:
        init_bf_builds_table()
        print("[BF] ✅ Таблица bf_builds готова")
    except Exception as e:
        print("[BF] ⚠️ Ошибка инициализации bf_builds:", e)


# === Получить все сборки ===
@app.get("/api/bf/builds")
async def api_get_bf_builds():
    try:
        builds = get_all_bf_builds()
        return builds
    except Exception as e:
        return JSONResponse({"error": str(e)}, status_code=500)


# === Добавить новую сборку ===
@app.post("/api/bf/builds")
async def api_add_bf_build(request: Request):
    data = await request.json()
    try:
        add_bf_build(data)
        return {"status": "ok", "message": "Build added"}
    except Exception as e:
        return JSONResponse({"error": str(e)}, status_code=500)


# === Обновить сборку ===
@app.put("/api/bf/builds/{build_id}")
async def api_update_bf_build(build_id: int, request: Request):
    data = await request.json()
    try:
        update_bf_build(build_id, data)
        return {"status": "ok", "message": "Build updated"}
    except Exception as e:
        return JSONResponse({"error": str(e)}, status_code=500)


# === Удалить сборку ===
@app.delete("/api/bf/builds/{build_id}")
async def api_delete_bf_build(build_id: int):
    try:
        delete_bf_build(build_id)
        return {"status": "ok", "message": "Build deleted"}
    except Exception as e:
        return JSONResponse({"error": str(e)}, status_code=500)


# ==============================
# ⚙️ BATTLEFIELD TYPES & MODULES API
# ==============================
from database_bf import (
    init_bf_types_modules_tables,
    get_bf_weapon_types,
    add_bf_weapon_type,
    delete_bf_weapon_type,
    get_bf_modules_by_type,
    add_bf_module,
    delete_bf_module
)

@app.on_event("startup")
def init_bf_types_modules():
    try:
        init_bf_types_modules_tables()
        print("[BF] ✅ Таблицы типов и модулей готовы")
    except Exception as e:
        print("[BF] ⚠️ Ошибка инициализации типов/модулей:", e)


# === Типы оружия ===
@app.get("/api/bf/types")
async def api_bf_get_types():
    return get_bf_weapon_types()

@app.post("/api/bf/types")
async def api_bf_add_type(request: Request):
    data = await request.json()
    add_bf_weapon_type(data.get("key"), data.get("label"))
    return {"status": "ok"}

@app.delete("/api/bf/types/{type_id}")
async def api_bf_del_type(type_id: int):
    delete_bf_weapon_type(type_id)
    return {"status": "ok"}


# === Модули ===
@app.get("/api/bf/modules/{weapon_type}")
async def api_bf_get_modules(weapon_type: str):
    return get_bf_modules_by_type(weapon_type)

@app.post("/api/bf/modules")
async def api_bf_add_module(request: Request):
    data = await request.json()
    add_bf_module(data.get("weapon_type"), data.get("category"), data.get("name"))
    return {"status": "ok"}

@app.delete("/api/bf/modules/{module_id}")
async def api_bf_del_module(module_id: int):
    delete_bf_module(module_id)
    return {"status": "ok"}






# =========================
# 🪖 BATTLEFIELD CHALLENGES API (персональный прогресс)
# =========================
from fastapi import HTTPException, Request, Body
import sqlite3, os
from database_bf import (
    init_bf_db, get_bf_conn,
    get_all_categories, add_category, delete_category,
    add_challenge, update_challenge, delete_challenge
)
from datetime import datetime

# --- Инициализация базы данных ---
init_bf_db()

# --- Проверка прав администратора ---
def ensure_bf_admin(request: Request, data: dict | None = None):
    """
    Проверяет права администратора через initData (как в ND Loadouts)
    """
    init_data = ""
    if data and "initData" in data:
        init_data = data["initData"]
    else:
        init_data = request.query_params.get("initData", "")

    user_id, is_admin, _ = extract_user_roles(init_data or "")
    if not is_admin:
        raise HTTPException(status_code=403, detail="Access denied")

    return user_id


# === Категории ===
@app.get("/api/bf/categories")
def bf_get_categories():
    return get_all_categories()


@app.post("/api/bf/categories")
def bf_add_category(data: dict, request: Request):
    ensure_bf_admin(request, data)
    name = data.get("name", "").strip()
    if not name:
        raise HTTPException(status_code=400, detail="Name is required")
    return add_category(name)


@app.put("/api/bf/categories/{category_id}")
def bf_update_category(category_id: int, data: dict, request: Request):
    ensure_bf_admin(request, data)
    name = data.get("name", "").strip()
    if not name:
        raise HTTPException(status_code=400, detail="Name required")
    with get_bf_conn() as conn:
        conn.execute("UPDATE challenge_categories SET name = ? WHERE id = ?", (name, category_id))
    return {"status": "updated"}


@app.delete("/api/bf/categories/{category_id}")
def bf_delete_category(category_id: int, request: Request, data: dict | None = None):
    ensure_bf_admin(request, data)
    delete_category(category_id)
    return {"status": "deleted"}


# === Испытания ===
# === Испытания ===

@app.post("/api/bf/challenges/list")
def bf_get_challenges(data: dict = Body(...)):
    """
    Получает список испытаний с прогрессом для конкретного пользователя
    """
    initData = data.get("initData", "")
    user_id, _, _ = extract_user_roles(initData or "")
    with get_bf_conn(row_mode=True) as conn:
        rows = conn.execute("""
            SELECT 
                c.id, c.category_id, c.title_en, c.title_ru, c.goal,
                COALESCE(uc.current, 0) as current,
                cat.name as category_name
            FROM challenges c
            LEFT JOIN challenge_categories cat ON cat.id = c.category_id
            LEFT JOIN user_challenges uc 
                ON uc.challenge_id = c.id AND uc.user_id = ?
            ORDER BY c.id DESC
        """, (user_id,)).fetchall()
    return [dict(r) for r in rows]


@app.post("/api/bf/challenges")
def bf_add_challenge(data: dict, request: Request):
    """
    Добавление нового испытания (только для админов)
    """
    ensure_bf_admin(request, data)
    if not all(k in data for k in ("title_en", "title_ru", "category_id")):
        raise HTTPException(status_code=400, detail="Missing required fields")
    add_challenge(data)
    return {"status": "added"}



@app.put("/api/bf/challenges/{challenge_id}")
def bf_update_challenge(challenge_id: int, data: dict, request: Request):
    ensure_bf_admin(request, data)
    update_challenge(challenge_id, data)
    return {"status": "updated"}


@app.delete("/api/bf/challenges/{challenge_id}")
def bf_delete_challenge(challenge_id: int, request: Request, data: dict | None = None):
    ensure_bf_admin(request, data)
    delete_challenge(challenge_id)
    return {"status": "deleted"}


# === Battlefield: персональный прогресс ===
@app.patch("/api/bf/challenges/{challenge_id}/progress")
def bf_update_progress(challenge_id: int, data: dict = Body(...)):
    """
    Обновление прогресса испытания для конкретного пользователя (+1 / -1)
    """
    delta = int(data.get("delta", 0))
    init_data = data.get("initData", "")
    user_id, _, _ = extract_user_roles(init_data or "")

    if not user_id:
        raise HTTPException(status_code=400, detail="User ID missing")

    with get_bf_conn() as conn:
        # Проверяем, существует ли испытание
        challenge = conn.execute(
            "SELECT goal FROM challenges WHERE id = ?", (challenge_id,)
        ).fetchone()
        if not challenge:
            raise HTTPException(status_code=404, detail="Challenge not found")

        goal = int(challenge[0])

        # Создаём запись прогресса, если нет
        conn.execute("""
            INSERT OR IGNORE INTO user_challenges (user_id, challenge_id, current)
            VALUES (?, ?, 0)
        """, (user_id, challenge_id))

        # Обновляем прогресс с ограничениями (0...goal)
        conn.execute("""
            UPDATE user_challenges
            SET current = MAX(0, MIN(?, current + ?))
            WHERE user_id = ? AND challenge_id = ?
        """, (goal, delta, user_id, challenge_id))

        # Получаем обновлённое значение
        row = conn.execute("""
            SELECT current FROM user_challenges 
            WHERE user_id = ? AND challenge_id = ?
        """, (user_id, challenge_id)).fetchone()

        # Если завершено — фиксируем время завершения
        if row and row[0] >= goal:
            conn.execute("""
                UPDATE user_challenges 
                SET completed_at = ? 
                WHERE user_id = ? AND challenge_id = ?
            """, (datetime.utcnow().isoformat(), user_id, challenge_id))

    return {"id": challenge_id, "current": row[0], "goal": goal}




if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=False)
