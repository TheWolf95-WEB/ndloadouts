from fastapi import FastAPI, Request, Body
from fastapi.responses import HTMLResponse, JSONResponse
from fastapi.staticfiles import StaticFiles
from fastapi.templating import Jinja2Templates
from dotenv import load_dotenv
import json
import os
import hmac
import hashlib

from database import init_db, get_all_builds, add_build

# Загружаем переменные окружения
load_dotenv()
WEBAPP_URL = os.getenv("WEBAPP_URL")

app = FastAPI()

GITHUB_SECRET = os.getenv("WEBHOOK_SECRET", "")

@app.post("/webhook")
async def webhook(request: Request, background_tasks: BackgroundTasks):
    body = await request.body()
    signature = request.headers.get("X-Hub-Signature-256")

    if not signature or not hmac.compare_digest(
        signature,
        "sha256=" + hmac.new(GITHUB_SECRET.encode(), body, hashlib.sha256).hexdigest()
    ):
        return JSONResponse(status_code=403, content={"error": "Invalid signature"})

    background_tasks.add_task(os.system, "/opt/ndloadouts/deploy.sh")
    return {"status": "ok"}

# Подключаем статические файлы
app.mount("/static", StaticFiles(directory="static"), name="static")
app.mount("/data", StaticFiles(directory="data"), name="data")
templates = Jinja2Templates(directory="templates")

# Инициализация базы данных
init_db()

# === Главная страница WebApp ===
@app.get("/", response_class=HTMLResponse)
async def index(request: Request):
    return templates.TemplateResponse("index.html", {"request": request})

# === Получить все сборки ===
@app.get("/api/builds")
async def api_builds():
    return JSONResponse(get_all_builds())

# === Добавить новую сборку ===
@app.post("/api/builds")
async def create_build(data: dict = Body(...)):
    try:
        add_build(data)
        return JSONResponse({"status": "ok"})
    except Exception as e:
        return JSONResponse({"status": "error", "detail": str(e)}, status_code=500)

# === Получить список типов оружия ===
@app.get("/api/types")
def get_weapon_types():
    with open("data/types.json", "r", encoding="utf-8") as f:
        types = json.load(f)
    return JSONResponse(types)


