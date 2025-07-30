import os
import asyncio
from dotenv import load_dotenv
from aiogram import Bot, Dispatcher, types, F
from aiogram.enums.parse_mode import ParseMode
from aiogram.client.default import DefaultBotProperties
from aiogram.filters import CommandStart
from aiogram.types import Message, InlineKeyboardMarkup, InlineKeyboardButton, WebAppInfo, CallbackQuery
from aiogram.utils.markdown import hlink
from aiogram import BaseMiddleware, Router
from aiogram.types import TelegramObject
from typing import Callable, Awaitable, Dict, Any

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
            return  # Не обрабатываем групповые/канальные чаты
        return await handler(event, data)

# --- Загрузка конфигурации ---
load_dotenv("/opt/ndloadouts/.env")
BOT_TOKEN = os.getenv("TOKEN")
WEBAPP_URL = os.getenv("WEBAPP_URL")
CHANNEL_ID = "@callofdutynd"

if not BOT_TOKEN or not WEBAPP_URL:
    raise ValueError("❌ BOT_TOKEN и WEBAPP_URL должны быть заданы в .env")

# --- Инициализация ---
bot = Bot(token=BOT_TOKEN, default=DefaultBotProperties(parse_mode=ParseMode.HTML))
dp = Dispatcher()
router = Router()

dp.message.middleware(PrivateOnlyMiddleware())
dp.callback_query.middleware(PrivateOnlyMiddleware())
dp.include_router(router)

# --- /start ---
@router.message(CommandStart())
async def start_handler(message: Message):
    keyboard = InlineKeyboardMarkup(inline_keyboard=[
        [
            InlineKeyboardButton(text="📥 Подписаться", url="https://t.me/callofdutynd"),
            InlineKeyboardButton(text="✅ Проверить", callback_data="check_sub")
        ]
    ])
    await message.answer(
        "🪂 Добро пожаловать в штаб, боец!\n\n"
        "📡 Чтобы получить доступ к сборкам, сначала подпишись на наш канал.",
        reply_markup=keyboard
    )

# --- Проверка подписки ---
@router.callback_query(F.data == "check_sub")
async def check_subscription(callback: CallbackQuery):
    user_id = callback.from_user.id
    try:
        member = await bot.get_chat_member(chat_id=CHANNEL_ID, user_id=user_id)

        if member.status not in ("left", "kicked"):
            name = callback.from_user.first_name or "боец"
            text = (
                f"🪂 Высадка подтверждена, {name}!\n\n"
                "🔻 Жми на кнопку ниже, чтобы собрать свою мету и ворваться в топ-1!\n\n"
                f"💬 Нашёл баг, есть идея или хочешь добавить сборку? — "
                f"{hlink('Пиши в штаб', 'https://t.me/ndzone_admin')}"
            )
            keyboard = InlineKeyboardMarkup(inline_keyboard=[
                [
                    InlineKeyboardButton(text="🔗 Открыть сборки", web_app=WebAppInfo(url=WEBAPP_URL)),
                    InlineKeyboardButton(text="💬 Штаб", url="https://t.me/ndzone_admin")
                ]
            ])
            await callback.message.edit_text(text, reply_markup=keyboard)
            return

    except Exception as e:
        # можно логировать: print(f"❌ Ошибка проверки подписки: {e}")
        pass

    keyboard = InlineKeyboardMarkup(inline_keyboard=[
        [
            InlineKeyboardButton(text="📥 Подписаться", url="https://t.me/callofdutynd"),
            InlineKeyboardButton(text="🔁 Проверить снова", callback_data="check_sub")
        ]
    ])
    await callback.answer("❌ Подписка не подтверждена. Попробуй ещё раз.", show_alert=True)
    await callback.message.edit_text(
        "🚫 Доступ временно ограничен.\n\n"
        "Ты ещё не подписан на нашу базу командования.\n"
        "🛰 Без связи с базой доступ к сборкам невозможен.",
        reply_markup=keyboard
    )

# --- Запуск ---
async def main():
    print("🤖 Бот запущен.")
    await dp.start_polling(bot)

if __name__ == "__main__":
    asyncio.run(main())
