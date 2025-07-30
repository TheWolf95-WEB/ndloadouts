from fastapi import FastAPI, Request, Body, BackgroundTasks
from fastapi.responses import HTMLResponse, JSONResponse
from fastapi.staticfiles import StaticFiles
from fastapi.templating import Jinja2Templates
from dotenv import load_dotenv, set_key, dotenv_values
import json
import os
import hmac
import hashlib
import requests 
import subprocess
from pathlib import Path
from urllib.parse import parse_qs

# Загрузка переменных окружения
load_dotenv(dotenv_path="/opt/ndloadouts/.env")

BOT_TOKEN = os.getenv("TOKEN")
WEBAPP_URL = os.getenv("WEBAPP_URL")
CHANNEL_ID = "@callofdutynd"  # можно и ID, но username надёжнее

if not BOT_TOKEN or not WEBAPP_URL:
    raise ValueError("❌ BOT_TOKEN и WEBAPP_URL должны быть заданы в .env")

bot = Bot(token=BOT_TOKEN, default=DefaultBotProperties(parse_mode=ParseMode.HTML))
dp = Dispatcher()

# /start
@dp.message(CommandStart())
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

# Проверка подписки
@dp.callback_query(Text("check_sub"))
async def check_subscription(callback: types.CallbackQuery):
    user_id = callback.from_user.id
    try:
        member = await bot.get_chat_member(chat_id=CHANNEL_ID, user_id=user_id)
        if member.status in ("member", "creator", "administrator"):
            # ✅ Подписка подтверждена — отправляем основное сообщение
            name = callback.from_user.first_name or "боец"
            text = (
                f"🪂 Высадка подтверждена, {name}!\n\n"
                "🔻 Жми на кнопку ниже, чтобы собрать свою мету и ворваться в топ-1!\n\n"
                f"💬 Нашёл баг, есть идея или хочешь добавить сборку? — {hlink('Пиши в штаб', 'https://t.me/ndzone_admin')}"
            )

            keyboard = InlineKeyboardMarkup(inline_keyboard=[
                [
                    InlineKeyboardButton(text="🔗 Открыть сборки", web_app=WebAppInfo(url=WEBAPP_URL)),
                    InlineKeyboardButton(text="💬 Штаб", url="https://t.me/ndzone_admin")
                ]
            ])
            await callback.message.edit_text(text, reply_markup=keyboard)
        else:
            raise Exception("Not subscribed")
    except Exception:
        await callback.answer("❌ Подписка не подтверждена. Попробуй ещё раз.", show_alert=True)
        await callback.message.edit_text(
            "🚫 Доступ временно ограничен.\n\n"
            "Ты ещё не подписан на нашу базу командования.\n"
            "🛰 Без связи с базой доступ к сборкам невозможен.",
            reply_markup=InlineKeyboardMarkup(inline_keyboard=[
                [
                    InlineKeyboardButton(text="📥 Подписаться", url="https://t.me/callofdutynd"),
                    InlineKeyboardButton(text="🔁 Проверить снова", callback_data="check_sub")
                ]
            ])
        )

# Запуск
async def main():
    print("🤖 Бот запущен.")
    await dp.start_polling(bot)

if __name__ == "__main__":
    asyncio.run(main())
