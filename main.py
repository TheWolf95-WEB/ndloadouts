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

# Проверка

# Проверка
