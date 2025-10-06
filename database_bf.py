import sqlite3
from pathlib import Path
from contextlib import contextmanager
from datetime import datetime

BF_DB_PATH = Path("/opt/ndloadouts_storage/bf_challenges.db")
BF_DB_PATH.parent.mkdir(exist_ok=True)


# ========================
# Подключение к базе
# ========================

@contextmanager
def get_bf_conn(row_mode: bool = False):
    conn = sqlite3.connect(BF_DB_PATH)
    if row_mode:
        conn.row_factory = sqlite3.Row
    try:
        conn.execute("PRAGMA foreign_keys = ON")
        conn.execute("PRAGMA journal_mode = WAL")
        yield conn
        conn.commit()
    finally:
        conn.close()


# ========================
# Инициализация базы
# ========================

def init_bf_db():
    with get_bf_conn() as conn:
        c = conn.cursor()

        # Таблица категорий (вкладки)
        c.execute("""
            CREATE TABLE IF NOT EXISTS challenge_categories (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                name TEXT UNIQUE NOT NULL
            )
        """)

        # Таблица испытаний
        c.execute("""
            CREATE TABLE IF NOT EXISTS challenges (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                category_id INTEGER,
                title_en TEXT NOT NULL,
                title_ru TEXT NOT NULL,
                current INTEGER DEFAULT 0,
                goal INTEGER DEFAULT 0,
                created_at TEXT DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (category_id) REFERENCES challenge_categories(id) ON DELETE CASCADE
            )
        """)


        # === Прогресс пользователей ===
        c.execute("""
            CREATE TABLE IF NOT EXISTS user_challenges (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                user_id INTEGER NOT NULL,
                challenge_id INTEGER NOT NULL,
                current INTEGER DEFAULT 0,
                completed_at TEXT,
                UNIQUE(user_id, challenge_id),
                FOREIGN KEY (challenge_id) REFERENCES challenges(id) ON DELETE CASCADE
            )
        """)



# ========================
# CRUD категории (вкладки)
# ========================

def add_category(name: str):
    name = name.strip()
    if not name:
        return None
    with get_bf_conn() as conn:
        conn.execute("INSERT OR IGNORE INTO challenge_categories (name) VALUES (?)", (name,))
    return get_category_by_name(name)

def get_all_categories():
    with get_bf_conn(row_mode=True) as conn:
        rows = conn.execute("SELECT * FROM challenge_categories ORDER BY id ASC").fetchall()
    return [dict(r) for r in rows]

def get_category_by_name(name: str):
    with get_bf_conn(row_mode=True) as conn:
        row = conn.execute("SELECT * FROM challenge_categories WHERE name = ?", (name,)).fetchone()
    return dict(row) if row else None

def delete_category(category_id: int):
    with get_bf_conn() as conn:
        conn.execute("DELETE FROM challenge_categories WHERE id = ?", (category_id,))


# ========================
# CRUD испытаний
# ========================

def add_challenge(data: dict):
    with get_bf_conn() as conn:
        conn.execute("""
            INSERT INTO challenges (category_id, title_en, title_ru, current, goal)
            VALUES (?, ?, ?, ?, ?)
        """, (
            data["category_id"],
            data["title_en"].strip(),
            data["title_ru"].strip(),
            int(data.get("current", 0)),
            int(data.get("goal", 0))
        ))

def get_all_challenges(category_id: int | None = None):
    with get_bf_conn(row_mode=True) as conn:
        if category_id:
            rows = conn.execute("""
                SELECT c.*, cat.name as category_name
                FROM challenges c
                LEFT JOIN challenge_categories cat ON cat.id = c.category_id
                WHERE c.category_id = ?
                ORDER BY c.id DESC
            """, (category_id,)).fetchall()
        else:
            rows = conn.execute("""
                SELECT c.*, cat.name as category_name
                FROM challenges c
                LEFT JOIN challenge_categories cat ON cat.id = c.category_id
                ORDER BY c.id DESC
            """).fetchall()
    return [dict(r) for r in rows]

def update_challenge(challenge_id: int, data: dict):
    with get_bf_conn() as conn:
        conn.execute("""
            UPDATE challenges
            SET category_id = ?, title_en = ?, title_ru = ?, current = ?, goal = ?
            WHERE id = ?
        """, (
            data["category_id"],
            data["title_en"].strip(),
            data["title_ru"].strip(),
            int(data.get("current", 0)),
            int(data.get("goal", 0)),
            challenge_id
        ))

def delete_challenge(challenge_id: int):
    with get_bf_conn() as conn:
        conn.execute("DELETE FROM challenges WHERE id = ?", (challenge_id,))


# ========================
# Инициализация вручную
# ========================

if __name__ == "__main__":
    init_bf_db()
    print("[+] Battlefield Challenges DB initialized:", BF_DB_PATH)
