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
CHANNEL_ID = os.getenv("CHANNEL_ID") 

bot = Bot(token=BOT_TOKEN, default=DefaultBotProperties(parse_mode=ParseMode.HTML))
dp = Dispatcher()

def ensure_news_schema():
    """Добавляем tg_id, если его ещё нет, и создаём таблицу при необходимости."""
    conn = sqlite3.connect(DB_PATH)
    cur = conn.cursor()
    cur.execute("""
        CREATE TABLE IF NOT EXISTS news (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            tg_id TEXT UNIQUE,
            title TEXT NOT NULL,
            content TEXT NOT NULL,
            image TEXT,
            date TEXT,
            category TEXT
        )
    """)
    # Проверим наличие tg_id
    cur.execute("PRAGMA table_info(news)")
    cols = [c[1] for c in cur.fetchall()]
    if "tg_id" not in cols:
        try:
            cur.execute("ALTER TABLE news ADD COLUMN tg_id TEXT UNIQUE")
        except Exception:
            pass
    conn.commit()
    conn.close()

async def process_post(msg: Message):
    tg_id = str(msg.message_id)
    text = msg.text or msg.caption or ""
    if not text.strip():
        print("[SKIP] Пустой текст")
        return

    # Фильтрация по нужному каналу (если задан)
    if CHANNEL_ID:
        try:
            if str(msg.chat.id) != str(CHANNEL_ID):
                return
        except Exception:
            pass

    title = text.strip().split("\n")[0][:100]
    content = text.strip()
    date = datetime.now().strftime("%d.%m.%Y")

    conn = sqlite3.connect(DB_PATH)
    cur = conn.cursor()

    cur.execute("SELECT 1 FROM news WHERE tg_id = ?", (tg_id,))
    exists = cur.fetchone()

    if exists:
        cur.execute(
            "UPDATE news SET title = ?, content = ?, date = ? WHERE tg_id = ?",
            (title, content, date, tg_id)
        )
        conn.commit()
        conn.close()
        print(f"[UPDATE] Обновлён пост {tg_id}")
        return

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
            cur.execute(
                "INSERT INTO news (tg_id, title, content, date) VALUES (?, ?, ?, ?)",
                (tg_id, title, content, date)
            )
            conn.commit()
        else:
            print(f"[ERROR] API вернул ошибку: {r.status_code} {r.text}")
    except Exception as e:
        print(f"[ERROR] Ошибка запроса: {e}")
    finally:
        conn.close()


@dp.message(F.chat.type == "channel")
async def handle_new_channel_post(message: Message):
    await process_post(message)

async def main():
    ensure_news_schema()
    print("[*] Слушаем новые посты в канале(ах)...")
    await dp.start_polling(bot)

if __name__ == "__main__":
    asyncio.run(main())
