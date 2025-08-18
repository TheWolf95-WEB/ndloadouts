import os
import asyncio
import requests
import sqlite3
from datetime import datetime
from aiogram import Bot, Dispatcher, F
from aiogram.enums.parse_mode import ParseMode
from aiogram.client.default import DefaultBotProperties
from aiogram.types import Message
from aiogram.methods.get_chat_history import GetChatHistory
from dotenv import load_dotenv

# --- Загрузка .env ---
load_dotenv("/opt/ndloadouts/.env")

BOT_TOKEN = os.getenv("TOKEN")
API_URL = "https://ndloadouts.ru/api/news"
DB_PATH = "/opt/ndloadouts_storage/builds.db"
CHANNEL_ID = os.getenv("CHANNEL_ID")  # Пример: -1001990222164

bot = Bot(token=BOT_TOKEN, default=DefaultBotProperties(parse_mode=ParseMode.HTML))
dp = Dispatcher()


# --- Функция отправки поста на сервер и сохранения в БД ---
async def process_post(msg: Message):
    tg_id = str(msg.message_id)
    text = msg.text or msg.caption or ""

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


# --- Реакция на новые посты в канале ---
@dp.message(F.chat.type == "channel")
async def handle_new_channel_post(message: Message):
    await process_post(message)


# --- При старте — публикуем последний пост из канала ---
async def publish_last_post():
    if not CHANNEL_ID:
        print("[!] CHANNEL_ID не задан в .env")
        return

    try:
        print(f"[*] Получаем последний пост из канала {CHANNEL_ID}...")
        history = await bot.get_chat_history(chat_id=CHANNEL_ID, limit=1)
        if history and history.messages:
            await process_post(history.messages[0])
        else:
            print("[!] Не удалось получить посты из канала")
    except Exception as e:
        print(f"[ERROR] Не удалось получить последний пост: {e}")


# --- Запуск ---
async def main():
    await publish_last_post()
    print("[*] Слушаем новые посты...")
    await dp.start_polling(bot)

if __name__ == "__main__":
    asyncio.run(main())
