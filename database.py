import sqlite3
import json
from pathlib import Path
from datetime import datetime

DB_PATH = Path("/opt/ndloadouts_storage/builds.db")
DB_PATH.parent.mkdir(exist_ok=True)

def init_db():
    conn = sqlite3.connect(DB_PATH)
    c = conn.cursor()

    # Сборки
    c.execute("""
        CREATE TABLE IF NOT EXISTS builds (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            title TEXT NOT NULL,
            weapon_type TEXT,
            top1 TEXT,
            top2 TEXT,
            top3 TEXT,
            tabs_json TEXT,
            image TEXT,
            date TEXT,
            categories TEXT
        )
    """)

    # Новости
        c.execute("""
            CREATE TABLE IF NOT EXISTS news (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                title TEXT NOT NULL,
                content TEXT NOT NULL,
                image TEXT,
                date TEXT,
                category TEXT
            )
        """)

    # Пользователи
    c.execute("""
        CREATE TABLE IF NOT EXISTS users (
            id TEXT PRIMARY KEY,
            first_name TEXT,
            username TEXT
        )
    """)

    # История версии приложения
    c.execute("""
        CREATE TABLE IF NOT EXISTS version_history (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            content TEXT NOT NULL,
            created_at TEXT NOT NULL
        )
    """)

    conn.commit()
    conn.close()


def get_all_builds():
    conn = sqlite3.connect(DB_PATH)
    c = conn.cursor()
    c.execute("SELECT * FROM builds ORDER BY id DESC")
    rows = c.fetchall()
    columns = [desc[0] for desc in c.description]
    conn.close()

    builds = []
    for row in rows:
        row_dict = dict(zip(columns, row))
        builds.append({
            "id": row_dict["id"],
            "title": row_dict["title"],
            "weapon_type": row_dict["weapon_type"],
            "top1": row_dict["top1"],
            "top2": row_dict["top2"],
            "top3": row_dict["top3"],
            "tabs": json.loads(row_dict.get("tabs_json") or "[]"),
            "image": row_dict.get("image"),
            "date": row_dict.get("date"),
            "categories": json.loads(row_dict.get("categories") or "[]")
        })
    return builds


def add_build(data):
    conn = sqlite3.connect(DB_PATH)
    c = conn.cursor()
    
    # Защита от ошибок: всегда массив
    tabs = data.get("tabs") or []
    if not isinstance(tabs, list):
        tabs = []

    categories = data.get("categories", ["all"])
    if not isinstance(categories, list):
        categories = ["all"]

    c.execute("""
        INSERT INTO builds (title, weapon_type, top1, top2, top3, tabs_json, image, date, categories)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    """, (
        data["title"],
        data["weapon_type"],
        data["top1"],
        data["top2"],
        data["top3"],
        json.dumps(tabs, ensure_ascii=False),
        data.get("image"),
        data.get("date"),
        json.dumps(categories, ensure_ascii=False)
    ))
    conn.commit()
    conn.close()



def delete_build_by_id(build_id: str):
    conn = sqlite3.connect(DB_PATH)
    cursor = conn.cursor()
    cursor.execute("DELETE FROM builds WHERE id = ?", (build_id,))
    conn.commit()
    conn.close()


def update_build_by_id(build_id, data):
    conn = sqlite3.connect(DB_PATH)
    c = conn.cursor()

    tabs = data.get("tabs") or []
    if not isinstance(tabs, list):
        tabs = []

    categories = data.get("categories", ["all"])
    if not isinstance(categories, list):
        categories = ["all"]

    c.execute("""
        UPDATE builds
        SET title = ?, weapon_type = ?, top1 = ?, top2 = ?, top3 = ?, tabs_json = ?, date = ?, categories = ?
        WHERE id = ?
    """, (
        data["title"],
        data["weapon_type"],
        data.get("top1", ""),
        data.get("top2", ""),
        data.get("top3", ""),
        json.dumps(tabs, ensure_ascii=False),
        data.get("date", ""),
        json.dumps(categories, ensure_ascii=False),
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


def add_date_column_if_not_exists():
    conn = sqlite3.connect(DB_PATH)
    c = conn.cursor()
    c.execute("PRAGMA table_info(builds)")
    columns = [col[1] for col in c.fetchall()]
    if "date" not in columns:
        c.execute("ALTER TABLE builds ADD COLUMN date TEXT")
        print("Поле date добавлено.")
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


def add_categories_column_if_not_exists():
    conn = sqlite3.connect(DB_PATH)
    c = conn.cursor()
    c.execute("PRAGMA table_info(builds)")
    columns = [col[1] for col in c.fetchall()]
    if "categories" not in columns:
        c.execute("ALTER TABLE builds ADD COLUMN categories TEXT DEFAULT '[]'")
        print("Поле categories добавлено.")
    conn.commit()
    conn.close()


# === История версий ===

def add_version_entry(content: str):
    conn = sqlite3.connect(DB_PATH)
    c = conn.cursor()
    c.execute("""
        INSERT INTO version_history (content, created_at)
        VALUES (?, ?)
    """, (content, datetime.now().isoformat()))
    conn.commit()
    conn.close()


def get_latest_version():
    conn = sqlite3.connect(DB_PATH)
    c = conn.cursor()
    c.execute("SELECT content FROM version_history ORDER BY created_at DESC LIMIT 1")
    row = c.fetchone()
    conn.close()
    return row[0] if row else ""


def get_all_versions():
    conn = sqlite3.connect(DB_PATH)
    c = conn.cursor()
    c.execute("SELECT content, created_at FROM version_history ORDER BY created_at DESC")
    rows = c.fetchall()
    conn.close()
    return [{"content": r[0], "created_at": r[1]} for r in rows]


if __name__ == '__main__':
    init_db()
    add_date_column_if_not_exists()
    fill_empty_dates()
    add_categories_column_if_not_exists()  # ✅ ДОБАВИЛИ поле categories
