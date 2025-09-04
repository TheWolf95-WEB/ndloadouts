import os
import sqlite3
import asyncio
from datetime import datetime
from dotenv import load_dotenv
from aiogram import Bot, Dispatcher, F
from aiogram.enums.parse_mode import ParseMode
from aiogram.client.default import DefaultBotProperties
from aiogram.filters import CommandStart
from aiogram.types import (
    Message, InlineKeyboardMarkup, InlineKeyboardButton,
    WebAppInfo, CallbackQuery, TelegramObject
)
from aiogram import BaseMiddleware, Router
from typing import Callable, Awaitable, Dict, Any
from database import save_user, init_db, add_news

# --- Загрузка переменных ---
load_dotenv("/opt/ndloadouts/.env")
BOT_TOKEN = os.getenv("TOKEN")
WEBAPP_URL = os.getenv("WEBAPP_URL")
CHANNEL_ID = int(os.getenv("CHANNEL_ID", -1001990222164))
DB_PATH = "/opt/ndloadouts_storage/builds.db"

if not BOT_TOKEN or not WEBAPP_URL:
    raise ValueError("❌ BOT_TOKEN и WEBAPP_URL должны быть заданы в .env")

# --- Инициализация бота ---
bot = Bot(token=BOT_TOKEN, default=DefaultBotProperties(parse_mode=ParseMode.HTML))
dp = Dispatcher()
router = Router()

# --- Middleware: пропускаем только личку ---
class PrivateOnlyMiddleware(BaseMiddleware):
    async def __call__(self, handler: Callable, event: TelegramObject, data: Dict[str, Any]) -> Any:
        chat = getattr(event, 'chat', None) or getattr(getattr(event, 'message', None), 'chat', None)
        if chat and chat.type != "private":
            return
        return await handler(event, data)

dp.message.middleware(PrivateOnlyMiddleware())
dp.callback_query.middleware(PrivateOnlyMiddleware())
dp.include_router(router)

# --- Хелпер проверки подписки ---
async def is_subscribed(user_id: int) -> bool:
    try:
        member = await bot.get_chat_member(chat_id=CHANNEL_ID, user_id=user_id)
        return member.status in ("member", "administrator", "creator")
    except Exception as e:
        print(f"[TG ERROR] get_chat_member: {e}")
        return False

# --- Выдача доступа ---
async def grant_access(callback: CallbackQuery):
    name = callback.from_user.first_name or "боец"
    text = (
        "✅ Личность подтверждена, боец.\n"
        "🪂 Добро пожаловать в NDHQ.\n\n"
        "📡 Теперь тебе доступны:\n"
        "📰 Свежие игровые новости\n"
        "🛠 Мета-сборки и арсенал\n"
        "📖 Гайды и разборы\n"
        "🎯 Полезные советы\n\n"
        "Соблюдай протокол. Удачи в бою!"
    )

    keyboard = InlineKeyboardMarkup(inline_keyboard=[[
        InlineKeyboardButton(text="🔗 Открыть сборки", web_app=WebAppInfo(url=WEBAPP_URL)),
        InlineKeyboardButton(text="💬 Связаться", url="https://t.me/ndzone_admin")
    ]])
    await callback.message.edit_text(text, reply_markup=keyboard)

# --- /start ---
@router.message(CommandStart())
async def start_handler(message: Message):
    user_id = int(message.from_user.id)
    subscribed = await is_subscribed(user_id)

    try:
        with sqlite3.connect(DB_PATH) as conn:
            cur = conn.cursor()
            cur.execute("INSERT OR IGNORE INTO users(id, first_name, username, verified) VALUES(?, ?, ?, 0)",
                        (str(user_id), message.from_user.first_name or "", message.from_user.username or ""))
            cur.execute("UPDATE users SET verified = ? WHERE id = ?", (1 if subscribed else 0, str(user_id)))
            conn.commit()
    except Exception as e:
        print(f"[DB ERROR] {e}")

    if subscribed:
        keyboard = InlineKeyboardMarkup(inline_keyboard=[[
            InlineKeyboardButton(text="🔗 Открыть сборки", web_app=WebAppInfo(url=WEBAPP_URL)),
            InlineKeyboardButton(text="💬 Связаться", url="https://t.me/ndzone_admin")
        ]])
        await message.answer("✅ Личность подтверждена.\n\n🪂 Добро пожаловать в NDHQ.", reply_markup=keyboard)
    else:
        keyboard = InlineKeyboardMarkup(inline_keyboard=[[
            InlineKeyboardButton(text="📅 Подписаться", url="https://t.me/callofdutynd"),
            InlineKeyboardButton(text="✅ Проверить", callback_data="recheck_sub")
        ]])
        await message.answer(
            "🪂 Добро пожаловать, боец!\n\n"
            "🔐 Ты на NDHQ — секретной базе для игроков.\n"
            "📡 Подтверди личность: вступи в штаб и нажми «Проверить».",
            reply_markup=keyboard
        )

# --- Повторная проверка подписки ---
@router.callback_query(F.data == "recheck_sub")
async def recheck_subscription(callback: CallbackQuery):
    user_id = int(callback.from_user.id)

    try:
        await callback.answer("Проверяю подписку…")
    except:
        pass

    subscribed = await is_subscribed(user_id)
    print(f"[DEBUG] user_id={user_id} | subscribed={subscribed}")

    try:
        with sqlite3.connect(DB_PATH) as conn:
            cur = conn.cursor()
            cur.execute("UPDATE users SET verified = ? WHERE id = ?", (1 if subscribed else 0, str(user_id)))
            conn.commit()
    except Exception as e:
        print(f"[DB ERROR] {e}")

    if subscribed:
        try:
            save_user(str(user_id), callback.from_user.first_name or "", callback.from_user.username or "")
        except Exception as e:
            print(f"[DB ERROR] save_user: {e}")

        await callback.answer("✅ Подписка подтверждена.")  # <- добавили
        await grant_access(callback)
    else:
        keyboard = InlineKeyboardMarkup(inline_keyboard=[
            [InlineKeyboardButton(text="📅 Подписаться", url="https://t.me/callofdutynd")],
            [InlineKeyboardButton(text="🔁 Проверить снова", callback_data="recheck_sub")],
            [InlineKeyboardButton(text="🧑‍✈️ Связаться", url="https://t.me/ndzone_admin")]
        ])
        await callback.message.edit_text(
            "❌ Ошибка идентификации. Доступ к NDHQ запрещён.\n"
            "📡 Подпишись на канал и повтори попытку.",
            reply_markup=keyboard
        )


# --- Обработка постов из канала ---
@router.channel_post()
async def on_channel_post(message: Message):
    try:
        if message.chat.id != CHANNEL_ID:
            return

        text = message.text or message.caption or ""
        if "#новости" not in text.lower():
            return

        with sqlite3.connect(DB_PATH) as conn:
            cur = conn.cursor()
            cur.execute("SELECT COUNT(*) FROM news WHERE content LIKE ?", (f"%{message.message_id}%",))
            if cur.fetchone()[0] > 0:
                print("[SKIP] Уже опубликовано.")
                return

        title = text.strip().split('\n')[0]
        image_url = None
        if message.photo:
            largest = message.photo[-1]
            file = await bot.get_file(largest.file_id)
            image_url = f"https://api.telegram.org/file/bot{BOT_TOKEN}/{file.file_path}"

        def detect_category(text: str) -> str:
            text = text.lower()
            rules = {
                "call-of-duty": ["#callofduty", "#blackops", "#bo7", "#warzone", "#cod", "#mw3"],
                "battlefield": ["#battlefield", "#bf6", "#bf2042"],
                "cs2": ["#cs2", "#counterstrike"],
                "apex": ["#apex", "#apexlegends"]
            }
            for cat, tags in rules.items():
                if any(tag in text for tag in tags):
                    return cat
            return "general"

        category = detect_category(text)
        date_str = message.date.strftime("%d.%m.%Y %H:%M")

        add_news({
            "title": title,
            "content": text.strip(),
            "image": image_url,
            "date": date_str,
            "category": category
        })

        print(f"[OK] Новость добавлена: {title}")

    except Exception as e:
        print(f"[ERROR] Ошибка автопостинга: {e}")

# --- Запуск ---
async def main():
    print("🤖 Бот запущен.")
    init_db()
    await dp.start_polling(bot)

if __name__ == "__main__":
    asyncio.run(main())
