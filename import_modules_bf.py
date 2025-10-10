import json
import sqlite3
from pathlib import Path

# === Настройки ===
DB_PATH = Path("/opt/ndloadouts/builds.db")  # поменяй путь, если у тебя другая база
JSON_PATH = Path("modules-shv.json")         # путь к твоему JSON-файлу

# === Подключаемся к БД ===
conn = sqlite3.connect(DB_PATH)
cur = conn.cursor()

# === Создаём таблицу, если нет ===
cur.execute("""
CREATE TABLE IF NOT EXISTS bf_modules (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    weapon_type TEXT DEFAULT 'shv',
    category TEXT NOT NULL,
    en TEXT NOT NULL,
    pos INTEGER DEFAULT 0
);
""")

# === Загружаем JSON ===
with open(JSON_PATH, "r", encoding="utf-8") as f:
    data = json.load(f)

count = 0
for category, items in data.items():
    for i, name in enumerate(items, start=1):
        cur.execute("""
        INSERT INTO bf_modules (weapon_type, category, en, pos)
        VALUES (?, ?, ?, ?)
        """, ("shv", category, name.strip(), i))
        count += 1

conn.commit()
conn.close()

print(f"✅ Импорт завершён успешно! Добавлено {count} модулей в таблицу bf_modules.")
