import os
import asyncio
from dotenv import load_dotenv
from aiogram import Bot, Dispatcher, types
from aiogram.enums.parse_mode import ParseMode
from aiogram.client.default import DefaultBotProperties
from aiogram.filters import CommandStart
from aiogram.types import  Message, InlineKeyboardMarkup, InlineKeyboardButton, WebAppInfo

# Загрузка переменных окружения из .env
load_dotenv(dotenv_path="/opt/ndloadouts/.env")

BOT_TOKEN = os.getenv("TOKEN")
WEBAPP_URL = os.getenv("WEBAPP_URL")

# Проверка переменных окружения
if not BOT_TOKEN or not WEBAPP_URL:
    raise ValueError("❌ BOT_TOKEN и WEBAPP_URL должны быть заданы в .env")

# Инициализация бота с HTML в качестве parse_mode
bot = Bot(
    token=BOT_TOKEN,
    default=DefaultBotProperties(parse_mode=ParseMode.HTML)
)

# Инициализация диспетчера
dp = Dispatcher()

# Обработка команды /start
@dp.message(CommandStart())
async def send_welcome(message: types.Message):
    user = message.from_user
    name = user.first_name or "боец"

    text = (
        f"🪂 Высадка подтверждена, {name}!\n\n"
        "🔻 Жми на кнопку ниже, чтобы собрать свою мету и ворваться в топ-1!\n\n"
        
        "💬 Нашёл баг, есть идея или хочешь добавить сборку? — [Пиши в штаб](https://t.me/ndzone_admin)\n\n"
    )

    keyboard = InlineKeyboardMarkup(
        inline_keyboard=[
            [InlineKeyboardButton(text="🔗 Открыть сборки", web_app=WebAppInfo(url=WEBAPP_URL))]
        ]
    )

    await message.answer(text, reply_markup=keyboard, parse_mode="Markdown")



# Точка входа
async def main():
    print("🤖 Бот запущен. Ожидание сообщений...")
    await dp.start_polling(bot)

# Запуск
if __name__ == "__main__":
    asyncio.run(main())
