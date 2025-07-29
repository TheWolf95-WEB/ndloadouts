from fastapi import FastAPI, Request, Body, BackgroundTasks
from fastapi.responses import HTMLResponse, JSONResponse
from fastapi.staticfiles import StaticFiles
from fastapi.templating import Jinja2Templates
from dotenv import load_dotenv
import json
import os
import hmac
import hashlib
import subprocess
from urllib.parse import parse_qs

from database import init_db, get_all_builds, add_build

# Загрузка .env
load_dotenv()
WEBAPP_URL = os.getenv("WEBAPP_URL")
GITHUB_SECRET = os.getenv("WEBHOOK_SECRET", "")

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
        admin_ids = os.getenv("ADMIN_IDS", "").split(",")

        return JSONResponse({
            "user_id": user_id,
            "first_name": user_json.get("first_name"),
            "is_admin": user_id in admin_ids,
            "admin_ids": admin_ids
        })
    except Exception as e:
        return JSONResponse({"error": "Invalid user data", "detail": str(e)}, status_code=400)


# функция удаления сборки

@app.delete("/api/builds/{build_id}")
async def delete_build(build_id: str):
    try:
        # Удали из БД (реализуем в database.py)
        delete_build_by_id(build_id)
        return JSONResponse({"status": "ok"})
    except Exception as e:
        return JSONResponse({"error": str(e)}, status_code=500)

