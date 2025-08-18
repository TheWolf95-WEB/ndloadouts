import os
import asyncio
import requests
from aiogram import Bot, Dispatcher, F
from aiogram.enums.parse_mode import ParseMode
from aiogram.client.default import DefaultBotProperties 
from aiogram.types import Message
from dotenv import load_dotenv
import sqlite3
from datetime import datetime

# Загрузка переменных
load_dotenv("/opt/ndloadouts/.env")

BOT_TOKEN = os.getenv("TOKEN")
API_URL = "https://ndloadouts.ru/api/news"
DB_PATH = "/opt/ndloadouts_storage/builds.db"

# Бот
bot = Bot(
    token=BOT_TOKEN,
    default=DefaultBotProperties(parse_mode=ParseMode.HTML)
)
dp = Dispatcher()

# --- Обработка сообщений из канала ---
@dp.message(F.chat.type == "channel")
async def handle_channel_post(message: Message):
    tg_id = str(message.message_id)

    # Проверяем, есть ли такой пост уже
    conn = sqlite3.connect(DB_PATH)
    cursor = conn.cursor()
    cursor.execute("SELECT 1 FROM news WHERE tg_id = ?", (tg_id,))
    exists = cursor.fetchone()
    conn.close()

    if exists:
        print(f"[SKIP] Уже опубликовано: {tg_id}")
        return

    # Формируем данные
    text = message.text or message.caption or ""
    if not text.strip():
        print(f"[SKIP] Пустой текст")
        return

    title = text.strip().split("\n")[0][:100]  # Первая строка — заголовок
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


# --- Старт ---
async def main():
    print("[*] Запуск слушателя новостей...")
    await dp.start_polling(bot)

if __name__ == "__main__":
    asyncio.run(main())
