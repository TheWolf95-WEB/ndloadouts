import os
import asyncio
import sqlite3
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
CHANNEL_ID = -1001990222164 
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
        "✅ Личность подтверждена, боец.\n"
        "🪂 Добро пожаловать в NDHQ.\n\n"
        "📡 Теперь тебе доступны:\n"
        "📰 Свежие игровые новости\n"
        "🛠 Мета-сборки и арсенал\n"
        "📖 Гайды и разборы\n"
        "🎯 Полезные советы\n\n"
        "Соблюдай протокол. Удачи в бою!"
    )

    keyboard = InlineKeyboardMarkup(inline_keyboard=[
        [
            InlineKeyboardButton(text="🔗 Открыть сборки", web_app=WebAppInfo(url=WEBAPP_URL)),
            InlineKeyboardButton(text="💬 Связаться", url="https://t.me/ndzone_admin")
        ]
    ])
    await callback.message.edit_text(text, reply_markup=keyboard)


# --- /start ---
@router.message(CommandStart())
async def start_handler(message: Message):
    user_id = str(message.from_user.id)

    # 🔍 Проверяем, был ли уже подтверждён
    try:
        import sqlite3
        conn = sqlite3.connect(DB_PATH)
        cursor = conn.cursor()
        cursor.execute("SELECT verified FROM users WHERE id = ?", (user_id,))
        row = cursor.fetchone()
        conn.close()

        if row and row[0] == 1:
            keyboard = InlineKeyboardMarkup(inline_keyboard=[
                [
                    InlineKeyboardButton(text="🔗 Открыть сборки", web_app=WebAppInfo(url=WEBAPP_URL)),
                    InlineKeyboardButton(text="💬 Связаться", url="https://t.me/ndzone_admin")
                ]
            ])
            await message.answer(
                "✅ Личность подтверждена ранее.\n\n"
                "🪂 Добро пожаловать в NDHQ.\n\n"
                "📡 Жми на кнопку ниже и погнали!",
                reply_markup=keyboard
            )
            return
    except Exception as e:
        print(f"[DB ERROR] {e}")

    # Показываем стандартный текст
    keyboard = InlineKeyboardMarkup(inline_keyboard=[
        [
            InlineKeyboardButton(text="📅 Подписаться", url="https://t.me/callofdutynd"),
            InlineKeyboardButton(text="✅ Проверить", callback_data="check_sub")
        ]
    ])
    await message.answer(
        "🪂 Добро пожаловать, боец!\n\n"
        "🔐 Ты на NDHQ — секретной базе для игроков, где собраны новости, гайды, мета-сборки, разборы, советы и многое другое из игрового мира.\n\n"
        "📡 Чтобы получить доступ к базе, подтверди личность:\n"
        "Вступи в штаб и нажми «Проверить».\n\n"
        "⚠️ Без подтверждения доступ к базе невозможен.\n"
        "Соблюдай протокол безопасности.",
        reply_markup=keyboard
    )

    


# --- Проверка подписки ---
@router.callback_query(F.data == "check_sub")
async def check_subscription(callback: CallbackQuery):
    user_id = str(callback.from_user.id)

    # Проверка через Telegram API (всегда!)
    subscribed = False
    try:
        member = await bot.get_chat_member(chat_id=CHANNEL_ID, user_id=int(user_id))
        if member.status in ("member", "administrator", "creator"):
            subscribed = True
    except Exception as e:
        print(f"[TG ERROR] {e}")

    if subscribed:
        # Сохраняем пользователя в базу (если ещё не был)
        try:
            save_user(user_id, callback.from_user.first_name or "", callback.from_user.username or "")
            # Обновляем verified = 1
            conn = sqlite3.connect(DB_PATH)
            cursor = conn.cursor()
            cursor.execute("UPDATE users SET verified = 1 WHERE id = ?", (user_id,))
            conn.commit()
            conn.close()
        except Exception as e:
            print(f"[DB ERROR] {e}")

        await grant_access(callback)
        return


    # Если не подписан — показываем отказ
    keyboard = InlineKeyboardMarkup(inline_keyboard=[
        [
            InlineKeyboardButton(text="📅 Подписаться", url="https://t.me/callofdutynd"),
            InlineKeyboardButton(text="🔁 Проверить снова", callback_data="check_sub")
        ],
        [
            InlineKeyboardButton(text="🧑‍✈️ Связаться", url="https://t.me/ndzone_admin")
        ]
    ])

    await callback.message.edit_text(
        "❌ Ошибка идентификации.\n"
        "Доступ к NDHQ запрещён.\n\n"
        "📡 Убедись, что ты вступил в штаб и повтори попытку, нажав «Проверить».\n"
        "Без этого вход невозможен.",
        reply_markup=keyboard
    )
    
    await callback.answer("❌ Подписка не подтверждена. Попробуй ещё раз.", show_alert=True)


from database import add_news
import re

@router.channel_post()
async def on_channel_post(message: Message):
    try:
        if message.chat.id != CHANNEL_ID:
            return

        text = message.text or message.caption or ""
        if "#новости" not in text.lower():
            return

        # ✅ Анти-дубли (по message_id)
        conn = sqlite3.connect(DB_PATH)
        cursor = conn.cursor()
        cursor.execute("SELECT COUNT(*) FROM news WHERE content LIKE ?", (f"%tg://{message.message_id}%",))
        if cursor.fetchone()[0] > 0:
            print("[SKIP] Уже есть такая новость.")
            return

        # ✅ Заголовок — первая строка
        title = text.strip().split('\n')[0]

        # ✅ Картинка
        image_url = None
        if message.photo:
            largest = message.photo[-1]
            file = await bot.get_file(largest.file_id)
            image_url = f"https://api.telegram.org/file/bot{BOT_TOKEN}/{file.file_path}"

        # ✅ Просмотры
        views = message.views or 0

        # ✅ Дата
        date_str = message.date.strftime("%d.%m.%Y %H:%M")

        # ✅ Категория по хэштегам
        def detect_category(text: str) -> str:
            text = text.lower()
            rules = {
                "call-of-duty": ["#callofduty", "#blackops", "#bo7", "#warzone", "#cod", "#mw3"],
                "battlefield": ["#battlefield", "#bf6", "#bf2042"],
                "cs2": ["#cs2", "#counterstrike"],
                "apex": ["#apex", "#apexlegends"],
            }
            for cat, tags in rules.items():
                if any(tag in text for tag in tags):
                    return cat
            return "general"

        category = detect_category(text)

        # ✅ Добавляем в БД
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




# --- Старт ---
async def main():
    print("🤖 Бот запущен.")
    init_db()  # ← обязательно
    await dp.start_polling(bot)

if __name__ == "__main__":
    asyncio.run(main())
