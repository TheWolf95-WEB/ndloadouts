import sqlite3
from pathlib import Path
from contextlib import contextmanager

# =====================================================
# 📘 ОДНА БАЗА ДАННЫХ ДЛЯ ВСЕГО BATTLEFIELD
# =====================================================
BF_DB_PATH = Path("/opt/ndloadouts_storage/bf_builds.db")
BF_DB_PATH.parent.mkdir(exist_ok=True)

@contextmanager
def get_bf_conn(row_mode: bool = False):
    """Универсальное соединение для всех таблиц Battlefield"""
    conn = sqlite3.connect(BF_DB_PATH)
    if row_mode:
        conn.row_factory = sqlite3.Row
    try:
        conn.execute("PRAGMA foreign_keys = ON")
        conn.execute("PRAGMA journal_mode = WAL")
        yield conn
        conn.commit()
    except Exception as e:
        conn.rollback()
        raise e
    finally:
        conn.close()

def init_bf_db():
    """Инициализация ВСЕХ таблиц Battlefield"""
    with get_bf_conn() as conn:
        # Таблица категорий испытаний
        conn.execute("""
            CREATE TABLE IF NOT EXISTS challenge_categories (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                name TEXT UNIQUE NOT NULL
            )
        """)

        # Таблица испытаний
        conn.execute("""
            CREATE TABLE IF NOT EXISTS challenges (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                category_id INTEGER,
                title_en TEXT NOT NULL,
                title_ru TEXT NOT NULL,
                goal INTEGER DEFAULT 0,
                created_at TEXT DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (category_id) REFERENCES challenge_categories(id) ON DELETE CASCADE
            )
        """)

        # Прогресс пользователей
        conn.execute("""
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

        # Таблица сборок
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

        # Таблица типов оружия
        conn.execute("""
            CREATE TABLE IF NOT EXISTS bf_weapon_types (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                key TEXT UNIQUE,
                label TEXT
            )
        """)

        # Таблица модулей
        conn.execute("""
            CREATE TABLE IF NOT EXISTS bf_modules (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                weapon_type TEXT,
                category TEXT,
                name TEXT
            )
        """)
        
        print("[BF] ✅ Все таблицы Battlefield созданы")

# =====================================================
# 🔫 CRUD ДЛЯ СБОРОК
# =====================================================

def get_all_bf_builds():
    with get_bf_conn(row_mode=True) as conn:
        rows = conn.execute("SELECT * FROM bf_builds ORDER BY id DESC").fetchall()
        return [dict(r) for r in rows]

def add_bf_build(data):
    with get_bf_conn() as conn:
        conn.execute("""
            INSERT INTO bf_builds (title, weapon_type, top1, top2, top3, date, tabs, categories)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        """, (
            data.get("title"), data.get("weapon_type"),
            data.get("top1"), data.get("top2"), data.get("top3"),
            data.get("date"), str(data.get("tabs") or []), str(data.get("categories") or [])
        ))

def update_bf_build(build_id, data):
    with get_bf_conn() as conn:
        conn.execute("""
            UPDATE bf_builds
            SET title=?, weapon_type=?, top1=?, top2=?, top3=?, date=?, tabs=?, categories=?
            WHERE id=?
        """, (
            data.get("title"), data.get("weapon_type"),
            data.get("top1"), data.get("top2"), data.get("top3"),
            data.get("date"), str(data.get("tabs") or []), str(data.get("categories") or []),
            build_id
        ))

def delete_bf_build(build_id):
    with get_bf_conn() as conn:
        conn.execute("DELETE FROM bf_builds WHERE id = ?", (build_id,))

# =====================================================
# ⚙️ CRUD ДЛЯ ТИПОВ ОРУЖИЯ
# =====================================================

def get_bf_weapon_types():
    with get_bf_conn(row_mode=True) as conn:
        rows = conn.execute("SELECT * FROM bf_weapon_types ORDER BY label").fetchall()
        return [dict(r) for r in rows]

def add_bf_weapon_type(key, label):
    with get_bf_conn() as conn:
        conn.execute("INSERT OR IGNORE INTO bf_weapon_types (key, label) VALUES (?, ?)", (key, label))

def delete_bf_weapon_type(type_id):
    with get_bf_conn() as conn:
        conn.execute("DELETE FROM bf_weapon_types WHERE id = ?", (type_id,))

# =====================================================
# 🔩 CRUD ДЛЯ МОДУЛЕЙ
# =====================================================

def get_bf_modules_by_type(weapon_type):
    with get_bf_conn(row_mode=True) as conn:
        rows = conn.execute(
            "SELECT id, category, name FROM bf_modules WHERE weapon_type = ? ORDER BY category, name",
            (weapon_type,)
        ).fetchall()
        data = {}
        for r in rows:
            cat = r["category"]
            data.setdefault(cat, []).append(dict(r))
        return data

def add_bf_module(weapon_type, category, name):
    with get_bf_conn() as conn:
        conn.execute(
            "INSERT INTO bf_modules (weapon_type, category, name) VALUES (?, ?, ?)",
            (weapon_type, category, name)
        )

def delete_bf_module(module_id):
    with get_bf_conn() as conn:
        conn.execute("DELETE FROM bf_modules WHERE id = ?", (module_id,))

# =====================================================
# 🎯 CRUD ДЛЯ ИСПЫТАНИЙ
# =====================================================

def get_all_categories():
    with get_bf_conn(row_mode=True) as conn:
        rows = conn.execute("SELECT * FROM challenge_categories ORDER BY id ASC").fetchall()
        return [dict(r) for r in rows]

def add_category(name: str):
    name = name.strip()
    if not name:
        return None
    with get_bf_conn() as conn:
        conn.execute("INSERT OR IGNORE INTO challenge_categories (name) VALUES (?)", (name,))

def delete_category(category_id: int):
    with get_bf_conn() as conn:
        conn.execute("DELETE FROM challenge_categories WHERE id = ?", (category_id,))

def add_challenge(data: dict):
    with get_bf_conn() as conn:
        conn.execute("""
            INSERT INTO challenges (category_id, title_en, title_ru, goal)
            VALUES (?, ?, ?, ?)
        """, (
            data["category_id"],
            data["title_en"].strip(),
            data["title_ru"].strip(),
            int(data.get("goal", 0))
        ))

def update_challenge(challenge_id: int, data: dict):
    with get_bf_conn() as conn:
        conn.execute("""
            UPDATE challenges
            SET category_id = ?, title_en = ?, title_ru = ?, goal = ?
            WHERE id = ?
        """, (
            data["category_id"],
            data["title_en"].strip(),
            data["title_ru"].strip(),
            int(data.get("goal", 0)),
            challenge_id
        ))

def delete_challenge(challenge_id: int):
    with get_bf_conn() as conn:
        conn.execute("DELETE FROM challenges WHERE id = ?", (challenge_id,))

# =====================================================
# 🚀 ИНИЦИАЛИЗАЦИЯ ПРИ ЗАПУСКЕ
# =====================================================
if __name__ == "__main__":
    init_bf_db()
    print("[BF] ✅ База данных Battlefield готова")
