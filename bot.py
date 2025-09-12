import os
import sqlite3
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
from aiogram.exceptions import TelegramBadRequest
from typing import Callable, Awaitable, Dict, Any
from database import save_user, init_db

# --- env ---
load_dotenv("/opt/ndloadouts/.env")
BOT_TOKEN = os.getenv("TOKEN")
WEBAPP_URL = os.getenv("WEBAPP_URL")
CHANNEL_ID = int(os.getenv("CHANNEL_ID", "-1001990222164"))  # обязательно со знаком минус
DB_PATH = "/opt/ndloadouts_storage/builds.db"

if not BOT_TOKEN or not WEBAPP_URL:
    raise ValueError("❌ BOT_TOKEN и WEBAPP_URL должны быть заданы в .env")

# --- bot ---
bot = Bot(token=BOT_TOKEN, default=DefaultBotProperties(parse_mode=ParseMode.HTML))
dp = Dispatcher()
router = Router()

# --- middleware: только личные чаты ---
class PrivateOnlyMiddleware(BaseMiddleware):
    async def __call__(self, handler: Callable, event: TelegramObject, data: Dict[str, Any]) -> Any:
        chat = getattr(event, 'chat', None) or getattr(getattr(event, 'message', None), 'chat', None)
        if chat and chat.type != "private":
            return
        return await handler(event, data)

dp.message.middleware(PrivateOnlyMiddleware())
dp.callback_query.middleware(PrivateOnlyMiddleware())
dp.include_router(router)

# --- безопасная замена текста ---
async def safe_edit(orig_message: Message, text: str, reply_markup: InlineKeyboardMarkup | None = None):
    try:
        await orig_message.edit_text(text, reply_markup=reply_markup)
    except TelegramBadRequest as e:
        if "message is not modified" in str(e):
            await orig_message.answer(text, reply_markup=reply_markup)
        else:
            print(f"[TG ERROR] edit_text failed: {e}")
            await orig_message.answer(text, reply_markup=reply_markup)

# --- проверка подписки ---
async def is_subscribed(user_id: int) -> bool:
    try:
        member = await bot.get_chat_member(chat_id=CHANNEL_ID, user_id=user_id)
        status = member.status
        ok = status in ("member", "administrator", "creator")
        print(f"[DEBUG] get_chat_member | user_id={user_id} | status={status} | subscribed={ok}")
        return ok
    except Exception as e:
        msg = str(e)
        print(f"[TG ERROR] get_chat_member: {msg}")
        if "CHAT_ADMIN_REQUIRED" in msg or "not enough rights" in msg.lower():
            print("[HINT] Бот должен быть админом канала @callofdutynd.")
        return False

# --- команда /me (для отладки) ---
@router.message(F.text == "/me")
async def whoami(message: Message):
    member = await bot.get_chat_member(chat_id=CHANNEL_ID, user_id=message.from_user.id)
    await message.answer(f"Ты: {message.from_user.id}\nСтатус: {member.status}")

# --- доступ разрешён ---
async def grant_access(callback: CallbackQuery):
    text = (
        "✅ Личность подтверждена, боец.\n"
        "🪂 Добро пожаловать в NDHQ.\n\n"
        "📡 Теперь тебе доступны:\n"
        "🛠 Мета-сборки и арсенал\n"
        "📖 Гайды и разборы\n"
        "🎯 Полезные советы\n\n"
        "Соблюдай протокол. Удачи в бою!"
    )
    keyboard = InlineKeyboardMarkup(inline_keyboard=[[ 
        InlineKeyboardButton(text="🔗 Открыть", web_app=WebAppInfo(url=WEBAPP_URL)),
        InlineKeyboardButton(text="💬 Связаться", url="https://t.me/ndzone_admin")
    ]])
    await safe_edit(callback.message, text, keyboard)

# --- старт /start ---
@router.message(CommandStart())
async def start_handler(message: Message):
    user_id = int(message.from_user.id)
    subscribed = await is_subscribed(user_id)

    try:
        with sqlite3.connect(DB_PATH) as conn:
            cur = conn.cursor()
            cur.execute(
                "INSERT OR IGNORE INTO users(id, first_name, username, verified) VALUES(?, ?, ?, 0)",
                (str(user_id), message.from_user.first_name or "", message.from_user.username or "")
            )
            cur.execute("UPDATE users SET verified = ? WHERE id = ?", (1 if subscribed else 0, str(user_id)))
            conn.commit()
    except Exception as e:
        print(f"[DB ERROR] {e}")

    if subscribed:
        keyboard = InlineKeyboardMarkup(inline_keyboard=[[ 
            InlineKeyboardButton(text="🔗 Открыть", web_app=WebAppInfo(url=WEBAPP_URL)),
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

# --- повторная проверка ---
@router.callback_query(F.data == "recheck_sub")
async def recheck_subscription(callback: CallbackQuery):
    user_id = int(callback.from_user.id)
    try:
        await callback.answer("Проверяю подписку…")
    except Exception:
        pass

    subscribed = await is_subscribed(user_id)
    print(f"[DEBUG] recheck | user_id={user_id} | subscribed={subscribed}")

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
        try:
            await callback.answer("✅ Подписка подтверждена.")
        except Exception:
            pass
        await grant_access(callback)
    else:
        keyboard = InlineKeyboardMarkup(inline_keyboard=[
            [InlineKeyboardButton(text="📅 Подписаться", url="https://t.me/callofdutynd")],
            [InlineKeyboardButton(text="🔁 Проверить снова", callback_data="recheck_sub")],
            [InlineKeyboardButton(text="🧑‍✈️ Связаться", url="https://t.me/ndzone_admin")]
        ])
        await safe_edit(
            callback.message,
            "❌ Ошибка идентификации. Доступ к NDHQ запрещён.\n"
            "📡 Подпишись на канал и повтори попытку.",
            keyboard
        )


@router.message(F.text == "/analytics")
async def analytics_cmd(message: Message):
    admin_ids = os.getenv("ADMIN_IDS", "").split(",")
    if str(message.from_user.id) not in admin_ids:
        await message.answer("🚫 У тебя нет доступа к аналитике.")
        return

    keyboard = InlineKeyboardMarkup(inline_keyboard=[
        [InlineKeyboardButton(text="📊 Открыть аналитику", web_app=WebAppInfo(url="https://ndloadouts.ru/analytics"))]
    ])
    await message.answer("Вот твоя аналитика:", reply_markup=keyboard)


# --- запуск бота ---
async def main():
    print("🤖 Бот запускается…")
    init_db()
    try:
        await bot.delete_webhook(drop_pending_updates=True)
        print("[INIT] Webhook удалён (если был). Переключаемся на polling.")
    except Exception as e:
        print(f"[INIT] delete_webhook error: {e}")
    await dp.start_polling(bot)

if __name__ == "__main__":
    asyncio.run(main())
