import os
import asyncio
from aiogram import Bot, Dispatcher, types
from aiogram.enums.parse_mode import ParseMode
from aiogram.filters import CommandStart
from aiogram.client.default import DefaultBotProperties
from dotenv import load_dotenv

# Загрузка переменных окружения
load_dotenv(dotenv_path="/opt/ndloadouts/.env")

BOT_TOKEN = os.getenv("TOKEN")
WEBAPP_URL = os.getenv("WEBAPP_URL")

# Проверка переменных
if not BOT_TOKEN or not WEBAPP_URL:
    raise ValueError("❌ BOT_TOKEN и WEBAPP_URL должны быть заданы в .env")

# Инициализация бота с корректной установкой parse_mode
bot = Bot(
    token=BOT_TOKEN,
    default=DefaultBotProperties(parse_mode=ParseMode.HTML)
)

# Диспетчер
dp = Dispatcher()

# Хэндлер на /start
@dp.message(CommandStart())
async def send_welcome(message: types.Message):
    user = message.from_user
    name = user.first_name or "боец"
    text = (
        f"👋 Привет, {name}!\n\n"
        "Добро пожаловать в сборки Warzone.\n\n"
        f"🔗 <a href=\"{WEBAPP_URL}\">Открыть WebApp</a>"
    )
    await message.answer(text, disable_web_page_preview=True)

# Главная точка входа
async def main():
    print("🤖 Бот запущен. Ожидание сообщений...")
    await dp.start_polling(bot)

# Запуск
if __name__ == "__main__":
    asyncio.run(main())
