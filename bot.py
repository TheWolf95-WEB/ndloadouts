import os
import asyncio
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
from database import save_user, init_db

# --- Middleware: пропускаем только личку ---
class PrivateOnlyMiddleware(BaseMiddleware):
    async def __call__(
        self,
        handler: Callable,
        event: TelegramObject,
        data: Dict[str, Any]
    ) -> Any:
        chat = getattr(event, 'chat', None) or getattr(getattr(event, 'message', None), 'chat', None)
        if chat and chat.type != "private":
            return
        return await handler(event, data)

# --- Загрузка переменных окружения ---
load_dotenv("/opt/ndloadouts/.env")
BOT_TOKEN = os.getenv("TOKEN")
WEBAPP_URL = os.getenv("WEBAPP_URL")
CHANNEL_ID = "@ndbotslogs"
DB_PATH = "/opt/ndloadouts_storage/builds.db"

if not BOT_TOKEN or not WEBAPP_URL:
    raise ValueError("❌ BOT_TOKEN и WEBAPP_URL должны быть заданы в .env")

# --- Инициализация бота и диспетчера ---
bot = Bot(token=BOT_TOKEN, default=DefaultBotProperties(parse_mode=ParseMode.HTML))
dp = Dispatcher()
router = Router()

dp.message.middleware(PrivateOnlyMiddleware())
dp.callback_query.middleware(PrivateOnlyMiddleware())
dp.include_router(router)

# --- Выдача доступа ---
async def grant_access(callback: CallbackQuery):
    name = callback.from_user.first_name or "боец"
    text = (
        f"🪂 Высадка подтверждена, {name}!\n"
        "🔻 Жми на кнопку ниже, чтобы собрать свою мету и ворваться в топ-1!\n"
        "💬 Нашёл баг, есть идея или хочешь добавить сборку? — Пиши в штаб"
    )
    keyboard = InlineKeyboardMarkup(inline_keyboard=[
        [
            InlineKeyboardButton(text="🔗 Открыть сборки", web_app=WebAppInfo(url=WEBAPP_URL)),
            InlineKeyboardButton(text="💬 Штаб", url="https://t.me/ndzone_admin")
        ]
    ])
    await callback.message.edit_text(text, reply_markup=keyboard)

# --- /start ---
@router.message(CommandStart())
async def start_handler(message: Message):
    keyboard = InlineKeyboardMarkup(inline_keyboard=[
        [
            InlineKeyboardButton(text="📅 Подписаться", url="https://t.me/ndbotslogs"),
            InlineKeyboardButton(text="✅ Проверить", callback_data="check_sub")
        ]
    ])
    await message.answer(
        "🪂 Добро пожаловать, боец!\n\n"
        "📡 Чтобы получить доступ к сборкам, сначала подпишись на наш канал.",
        reply_markup=keyboard
    )

# --- Проверка подписки ---
@router.callback_query(F.data == "check_sub")
async def check_subscription(callback: CallbackQuery):
    user_id = str(callback.from_user.id)

    # Проверка в базе
    try:
        import sqlite3
        conn = sqlite3.connect(DB_PATH)
        cursor = conn.cursor()
        cursor.execute("SELECT 1 FROM users WHERE id = ?", (user_id,))
        if cursor.fetchone():
            await grant_access(callback)
            return
    except Exception as e:
        print(f"[DB ERROR] {e}")
    finally:
        conn.close()

    # Проверка через Telegram API
    try:
        member = await bot.get_chat_member(chat_id=CHANNEL_ID, user_id=int(user_id))
        if member.status not in ("left", "kicked"):
            save_user(user_id, callback.from_user.first_name or "", callback.from_user.username or "")
            await grant_access(callback)
            return
    except Exception as e:
        print(f"[TG ERROR] {e}")

    # Если не подписан
    keyboard = InlineKeyboardMarkup(inline_keyboard=[
        [
            InlineKeyboardButton(text="📅 Подписаться", url="https://t.me/ndbotslogs"),
            InlineKeyboardButton(text="🔁 Проверить снова", callback_data="check_sub")
        ]
    ])
    await callback.answer("❌ Подписка не подтверждена. Попробуй ещё раз.", show_alert=True)
    await callback.message.edit_text(
        "🚫 Доступ временно ограничен.\n\n"
        "Ты ещё не подписан на нашу штаб квартиру.\n"
        "🛡 Без связи со штабом доступ к сборкам невозможен.",
        reply_markup=keyboard
    )

# --- Старт ---
async def main():
    print("🤖 Бот запущен.")
    init_db()  # ← обязательно
    await dp.start_polling(bot)

if __name__ == "__main__":
    asyncio.run(main())
