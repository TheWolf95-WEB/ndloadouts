import sqlite3
from pathlib import Path
from contextlib import contextmanager
from datetime import datetime


# =====================================================
# 📘 БАЗА ИСПЫТАНИЙ (bf_challenges.db)
# =====================================================
BF_DB_PATH = Path("/opt/ndloadouts_storage/bf_challenges.db")
BF_DB_PATH.parent.mkdir(exist_ok=True)


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


def init_bf_db():
    with get_bf_conn() as conn:
        c = conn.cursor()

        # Таблица категорий
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

        # Прогресс пользователей
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


# ---------------------- CRUD категории ----------------------

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


# ---------------------- CRUD испытаний ----------------------

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


# ---------------------- Прогресс пользователя ----------------------

def get_user_challenges(user_id: int):
    with get_bf_conn(row_mode=True) as conn:
        rows = conn.execute("""
            SELECT 
                c.id, c.category_id, c.title_en, c.title_ru, c.goal,
                COALESCE(uc.current, 0) as current,
                cat.name as category_name,
                uc.completed_at
            FROM challenges c
            LEFT JOIN challenge_categories cat ON cat.id = c.category_id
            LEFT JOIN user_challenges uc ON uc.challenge_id = c.id AND uc.user_id = ?
            ORDER BY c.id DESC
        """, (user_id,)).fetchall()
    return [dict(r) for r in rows]


def update_user_progress(user_id: int, challenge_id: int, delta: int):
    with get_bf_conn(row_mode=True) as conn:
        row = conn.execute("""
            SELECT uc.id, uc.current, c.goal
            FROM challenges c
            LEFT JOIN user_challenges uc ON uc.challenge_id = c.id AND uc.user_id = ?
            WHERE c.id = ?
        """, (user_id, challenge_id)).fetchone()

        if not row:
            conn.execute("""
                INSERT INTO user_challenges (user_id, challenge_id, current)
                VALUES (?, ?, ?)
            """, (user_id, challenge_id, max(0, delta)))
            return {"current": max(0, delta), "goal": get_challenge_goal(challenge_id)}

        current = int(row["current"] or 0)
        goal = int(row["goal"] or 0)
        new_value = max(0, min(goal, current + delta))

        conn.execute("""
            UPDATE user_challenges
            SET current = ?, completed_at = CASE WHEN ? >= ? THEN CURRENT_TIMESTAMP ELSE NULL END
            WHERE user_id = ? AND challenge_id = ?
        """, (new_value, new_value, goal, user_id, challenge_id))

    return {"current": new_value, "goal": goal}

def get_challenge_goal(challenge_id: int) -> int:
    with get_bf_conn(row_mode=True) as conn:
        row = conn.execute("SELECT goal FROM challenges WHERE id = ?", (challenge_id,)).fetchone()
        return int(row["goal"]) if row else 0



# =====================================================
# 🔫 БАЗА СБОРК Battlefield (builds_bf.db)
# =====================================================
DB_PATH = Path(__file__).parent / "builds_bf.db"

def get_connection():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn

def init_bf_builds_table():
    with get_connection() as conn:
        conn.execute("""
        CREATE TABLE IF NOT EXISTS bf_builds (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            title TEXT,
            weapon_type TEXT,
            top1 TEXT,
            top2 TEXT,
            top3 TEXT,
            date TEXT,
            tabs TEXT,
            categories TEXT
        )
        """)
        conn.execute("""
        CREATE TABLE IF NOT EXISTS bf_weapon_types (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            key TEXT UNIQUE,
            label TEXT
        )
        """)
        conn.execute("""
        CREATE TABLE IF NOT EXISTS bf_modules (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            weapon_type TEXT,
            category TEXT,
            name TEXT
        )
        """)
        conn.commit()


# =====================================================
# CRUD типы / модули / сборки
# =====================================================
def get_bf_weapon_types():
    with get_connection() as conn:
        return [dict(r) for r in conn.execute("SELECT * FROM bf_weapon_types ORDER BY label")]

def add_bf_weapon_type(data):
    with get_connection() as conn:
        conn.execute("INSERT INTO bf_weapon_types (key, label) VALUES (?, ?)", (data["key"], data["label"]))
        conn.commit()

def delete_bf_weapon_type(type_id):
    with get_connection() as conn:
        conn.execute("DELETE FROM bf_weapon_types WHERE id = ?", (type_id,))
        conn.commit()

def get_bf_modules_by_type(weapon_type):
    with get_connection() as conn:
        rows = conn.execute(
            "SELECT id, category, name FROM bf_modules WHERE weapon_type = ? ORDER BY category, name",
            (weapon_type,)
        ).fetchall()
        data = {}
        for r in rows:
            cat = r["category"]
            data.setdefault(cat, []).append(dict(r))
        return data

def add_bf_module(data):
    with get_connection() as conn:
        conn.execute(
            "INSERT INTO bf_modules (weapon_type, category, name) VALUES (?, ?, ?)",
            (data["weapon_type"], data["category"], data["name"])
        )
        conn.commit()

def delete_bf_module(module_id):
    with get_connection() as conn:
        conn.execute("DELETE FROM bf_modules WHERE id = ?", (module_id,))
        conn.commit()

def get_all_bf_builds():
    with get_connection() as conn:
        rows = conn.execute("SELECT * FROM bf_builds ORDER BY id DESC").fetchall()
        return [dict(r) for r in rows]

def add_bf_build(data):
    with get_connection() as conn:
        conn.execute("""
            INSERT INTO bf_builds (title, weapon_type, top1, top2, top3, date, tabs, categories)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        """, (
            data.get("title"), data.get("weapon_type"),
            data.get("top1"), data.get("top2"), data.get("top3"),
            data.get("date"), str(data.get("tabs")), str(data.get("categories"))
        ))
        conn.commit()

def update_bf_build(build_id, data):
    with get_connection() as conn:
        conn.execute("""
            UPDATE bf_builds
            SET title=?, weapon_type=?, top1=?, top2=?, top3=?, date=?, tabs=?, categories=?
            WHERE id=?
        """, (
            data.get("title"), data.get("weapon_type"),
            data.get("top1"), data.get("top2"), data.get("top3"),
            data.get("date"), str(data.get("tabs")), str(data.get("categories")),
            build_id
        ))
        conn.commit()

def delete_bf_build(build_id):
    with get_connection() as conn:
        conn.execute("DELETE FROM bf_builds WHERE id = ?", (build_id,))
        conn.commit()

# =====================================================
# ⚙️ TYPES & MODULES TABLES
# =====================================================
def init_bf_types_modules_tables():
    """Создаёт таблицы типов и модулей, если их нет"""
    with get_connection() as conn:
        conn.execute("""
        CREATE TABLE IF NOT EXISTS bf_weapon_types (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            key TEXT UNIQUE,
            label TEXT
        )
        """)
        conn.execute("""
        CREATE TABLE IF NOT EXISTS bf_modules (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            weapon_type TEXT,
            category TEXT,
            name TEXT
        )
        """)
        conn.commit()



# =====================================================
# ⚙️ Инициализация вручную
# =====================================================
if __name__ == "__main__":
    init_bf_db()
    init_bf_builds_table()
    print("[+] Battlefield DBs initialized:")
    print("  •", BF_DB_PATH)
    print("  •", DB_PATH)
