import json
import sqlite3
from pathlib import Path

# === Пути ===
BASE_DIR = Path("/opt/ndloadouts")
DB_PATH = BASE_DIR / "builds_bf.db"              # твоя база Battlefield
JSON_PATH = BASE_DIR / "data/modules-shv.json"   # путь к JSON-файлу

# === Подключаемся к БД ===
conn = sqlite3.connect(DB_PATH)
cur = conn.cursor()

# === Создаём таблицу, если её ещё нет ===
cur.execute("""
CREATE TABLE IF NOT EXISTS bf_modules (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    weapon_type TEXT NOT NULL,
    category TEXT NOT NULL,
    en TEXT NOT NULL,
    pos INTEGER DEFAULT 0
);
""")

# === Удаляем старые записи для weapon_type='shv' ===
weapon_type = "shv"
cur.execute("DELETE FROM bf_modules WHERE weapon_type = ?", (weapon_type,))
print(f"🧹 Старые записи для типа '{weapon_type}' удалены.")

# === Загружаем JSON ===
with open(JSON_PATH, "r", encoding="utf-8") as f:
    data = json.load(f)

# === Импортируем данные ===
count = 0
for category, items in data.items():
    for i, name in enumerate(items, start=1):
        cur.execute("""
        INSERT INTO bf_modules (weapon_type, category, en, pos)
        VALUES (?, ?, ?, ?)
        """, (weapon_type, category, name.strip(), i))
        count += 1

# === Сохраняем изменения и закрываем ===
conn.commit()
conn.close()

print(f"✅ Импорт завершён! Добавлено {count} модулей в таблицу bf_modules ({DB_PATH.name}).")
