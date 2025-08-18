import os
import asyncio
import requests
import sqlite3
from datetime import datetime
from aiogram import Bot, Dispatcher, F
from aiogram.enums.parse_mode import ParseMode
from aiogram.client.default import DefaultBotProperties
from aiogram.types import Message
from dotenv import load_dotenv

# --- Загрузка .env ---
load_dotenv("/opt/ndloadouts/.env")

BOT_TOKEN = os.getenv("TOKEN")
API_URL = "https://ndloadouts.ru/api/news"
DB_PATH = "/opt/ndloadouts_storage/builds.db"

bot = Bot(token=BOT_TOKEN, default=DefaultBotProperties(parse_mode=ParseMode.HTML))
dp = Dispatcher()

# --- Обработка новых постов в канале ---
@dp.message(F.chat.type == "channel")
async def handle_channel_post(message: Message):
    tg_id = str(message.message_id)
    text = message.text or message.caption or ""

    if not text.strip():
        print("[SKIP] Пустой текст")
        return

    # Проверка — есть ли уже такой ID
    conn = sqlite3.connect(DB_PATH)
    cursor = conn.cursor()
    cursor.execute("SELECT 1 FROM news WHERE tg_id = ?", (tg_id,))
    exists = cursor.fetchone()
    conn.close()

    if exists:
        print(f"[SKIP] Уже опубликовано: {tg_id}")
        return

    title = text.strip().split("\n")[0][:100]
    content = text.strip()
    date = datetime.now().strftime("%d.%m.%Y")

    payload = {
        "title": title,
        "content": content,
        "date": date,
        "tg_id": tg_id
    }

    try:
        r = requests.post(API_URL, json=payload, timeout=5)
        if r.status_code == 200:
            print(f"[OK] Новость опубликована: {title}")

            # Сохраняем в БД
            conn = sqlite3.connect(DB_PATH)
            cursor = conn.cursor()
            cursor.execute(
                "INSERT INTO news (tg_id, title, content, date) VALUES (?, ?, ?, ?)",
                (tg_id, title, content, date)
            )
            conn.commit()
            conn.close()
        else:
            print(f"[ERROR] Не удалось отправить новость: {r.text}")
    except Exception as e:
        print(f"[ERROR] Ошибка запроса: {e}")


# --- Запуск ---
async def main():
    print("[*] Бот слушает канал и ждёт новые посты...")
    await dp.start_polling(bot)

if __name__ == "__main__":
    asyncio.run(main())
