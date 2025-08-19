import os
import asyncio
import requests
from datetime import datetime
from dotenv import load_dotenv
from aiogram import Bot, Dispatcher, F
from aiogram.enums.parse_mode import ParseMode
from aiogram.client.default import DefaultBotProperties
from aiogram.types import Message
from database import add_news, init_db  # используем общие методы

# --- Загрузка .env ---
load_dotenv("/opt/ndloadouts/.env")

BOT_TOKEN = os.getenv("TOKEN")
API_URL = os.getenv("API_URL", "https://ndloadouts.ru/api/news")
CHANNEL_ID = int(os.getenv("CHANNEL_ID", -1001990222164))

bot = Bot(token=BOT_TOKEN, default=DefaultBotProperties(parse_mode=ParseMode.HTML))
dp = Dispatcher()

def detect_category(text: str) -> str:
    text = text.lower()
    rules = {
        "call-of-duty": ["#callofduty", "#blackops", "#bo7", "#warzone", "#cod", "#mw3"],
        "battlefield": ["#battlefield", "#bf6", "#bf2042"],
        "cs2": ["#cs2", "#counterstrike"],
        "apex": ["#apex", "#apexlegends"],
    }
    for cat, tags in rules.items():
        if any(tag in text for tag in tags):
            return cat
    return "general"

@dp.message(F.chat.type == "channel")
async def handle_new_channel_post(message: Message):
    if message.chat.id != CHANNEL_ID:
        return

    text = message.text or message.caption or ""
    if "#новости" not in text.lower():
        return

    title = text.strip().split('\n')[0][:100]
    content = text.strip()
    category = detect_category(text)
    date_str = message.date.strftime("%d.%m.%Y %H:%M")

    # Получаем изображение (если есть)
    image_url = None
    if message.photo:
        largest = message.photo[-1]
        file = await bot.get_file(largest.file_id)
        image_url = f"https://api.telegram.org/file/bot{BOT_TOKEN}/{file.file_path}"

    # Добавляем в SQLite
    add_news({
        "title": title,
        "content": content,
        "image": image_url,
        "date": date_str,
        "category": category
    })

    # Отправляем на API (дополнительно)
    try:
        r = requests.post(API_URL, json={
            "title": title,
            "content": content,
            "image": image_url,
            "date": date_str,
            "category": category,
            "views": message.views or 0
        }, timeout=5)
        if r.status_code == 200:
            print(f"[API ✅] Новость отправлена: {title}")
        else:
            print(f"[API ❌] {r.status_code}: {r.text}")
    except Exception as e:
        print(f"[API ERROR] {e}")

async def main():
    init_db()
    print("[*] Слушаем канал...")
    await dp.start_polling(bot)

if __name__ == "__main__":
    asyncio.run(main())
