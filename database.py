import sqlite3
import json
from pathlib import Path
from datetime import datetime

DB_PATH = Path("/opt/ndloadouts_storage/builds.db")
DB_PATH.parent.mkdir(exist_ok=True)

def init_db():
    conn = sqlite3.connect(DB_PATH)
    c = conn.cursor()

    # Таблица сборок
    c.execute("""
        CREATE TABLE IF NOT EXISTS builds (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            title TEXT NOT NULL,
            weapon_type TEXT,
            top1 TEXT,
            top2 TEXT,
            top3 TEXT,
            tabs_json TEXT,
            image TEXT
        )
    """)

    # ✅ Таблица пользователей
    c.execute("""
        CREATE TABLE IF NOT EXISTS users (
            id TEXT PRIMARY KEY,
            first_name TEXT,
            username TEXT
        )
    """)

    conn.commit()
    conn.close()


def get_all_builds():
    conn = sqlite3.connect(DB_PATH)
    c = conn.cursor()
    c.execute("SELECT * FROM builds ORDER BY id DESC")
    rows = c.fetchall()
    conn.close()
    builds = []
    for row in rows:
        builds.append({
            "id": row[0],
            "title": row[1],
            "weapon_type": row[2],
            "top1": row[3],
            "top2": row[4],
            "top3": row[5],
            "tabs": json.loads(row[6]) if row[6] else [],
            "image": row[7],
            "date": row[8] if len(row) > 8 else None

        })
    return builds

# Добавление сборки
def add_build(data):
    conn = sqlite3.connect(DB_PATH)
    c = conn.cursor()
    c.execute("""
        INSERT INTO builds (title, weapon_type, top1, top2, top3, tabs_json, image, date)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    """, (
        data["title"],
        data["weapon_type"],
        data["top1"],
        data["top2"],
        data["top3"],
        json.dumps(data["tabs"]),
        data.get("image"),
        data.get("date")
    ))
    conn.commit()  # ⬅️ важно
    conn.close()   # ⬅️ важно

# Удаление сборки
def delete_build_by_id(build_id: str):
    conn = sqlite3.connect(DB_PATH)
    cursor = conn.cursor()
    cursor.execute("DELETE FROM builds WHERE id = ?", (build_id,))
    conn.commit()
    conn.close()

# Редактирование сборки в БД

def update_build_by_id(build_id, data):
    conn = sqlite3.connect(DB_PATH)
    c = conn.cursor()
    c.execute("""
        UPDATE builds
        SET title = ?, weapon_type = ?, top1 = ?, top2 = ?, top3 = ?, tabs_json = ?, date = ?
        WHERE id = ?
    """, (
        data["title"],
        data["weapon_type"],
        data.get("top1", ""),
        data.get("top2", ""),
        data.get("top3", ""),
        json.dumps(data["tabs"], ensure_ascii=False),
        data.get("date", ""),
        build_id
    ))

    conn.commit()
    conn.close()

def save_user(user_id: str, first_name: str, username: str = ""):
    conn = sqlite3.connect(DB_PATH)
    c = conn.cursor()
    c.execute("""
        INSERT INTO users (id, first_name, username)
        VALUES (?, ?, ?)
        ON CONFLICT(id) DO UPDATE SET
            first_name = excluded.first_name,
            username = excluded.username
    """, (user_id, first_name, username))
    conn.commit()
    conn.close()


def get_all_users():
    conn = sqlite3.connect(DB_PATH)
    c = conn.cursor()
    c.execute("SELECT id, first_name, username FROM users")
    rows = c.fetchall()
    conn.close()
    return [{"id": row[0], "first_name": row[1], "username": row[2]} for row in rows]

# Если дата еще не добавлену в сборку то обновляем
def add_date_column_if_not_exists():
    conn = sqlite3.connect(DB_PATH)
    c = conn.cursor()

    # Проверяем наличие колонки
    c.execute("PRAGMA table_info(builds)")
    columns = [col[1] for col in c.fetchall()]
    if "date" not in columns:
        c.execute("ALTER TABLE builds ADD COLUMN date TEXT")
        print("Поле date добавлено.")
    else:
        print("Поле date уже существует.")
    
    conn.commit()
    conn.close()

def fill_empty_dates():
    conn = sqlite3.connect(DB_PATH)
    c = conn.cursor()
    today = datetime.now().strftime('%Y-%m-%d')
    c.execute("UPDATE builds SET date = ? WHERE date IS NULL OR date = ''", (today,))
    conn.commit()
    conn.close()
    print("Обновлены пустые даты.")



if __name__ == '__main__':
    init_db()
    add_date_column_if_not_exists()
    fill_empty_dates()



