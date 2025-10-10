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
# Прогресс пользователя
# ========================

def get_user_challenges(user_id: int):
    """Возвращает список всех испытаний пользователя с текущим прогрессом"""
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
    """Изменяет прогресс конкретного пользователя"""
    with get_bf_conn(row_mode=True) as conn:
        # Проверяем, есть ли запись
        row = conn.execute("""
            SELECT uc.id, uc.current, c.goal
            FROM challenges c
            LEFT JOIN user_challenges uc ON uc.challenge_id = c.id AND uc.user_id = ?
            WHERE c.id = ?
        """, (user_id, challenge_id)).fetchone()

        if not row:
            # создаём запись
            conn.execute("""
                INSERT INTO user_challenges (user_id, challenge_id, current)
                VALUES (?, ?, ?)
            """, (user_id, challenge_id, max(0, delta)))
            return {"current": max(0, delta), "goal": get_challenge_goal(challenge_id)}

        current = int(row["current"] or 0)
        goal = int(row["goal"] or 0)
        new_value = max(0, min(goal, current + delta))

        # обновляем прогресс
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




# ========================
# 🧱 BATTLEFIELD BUILDS
# ========================

def init_bf_builds_table():
    """Создание таблицы сборок Battlefield (если не существует)"""
    with get_bf_conn() as conn:
        conn.execute("""
            CREATE TABLE IF NOT EXISTS bf_builds (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                title TEXT NOT NULL,
                weapon_type TEXT NOT NULL,
                top1 TEXT,
                top2 TEXT,
                top3 TEXT,
                date TEXT,
                tabs_json TEXT,
                categories_json TEXT,
                created_at TEXT DEFAULT CURRENT_TIMESTAMP
            )
        """)


def add_bf_build(data: dict):
    """Добавление новой сборки Battlefield"""
    with get_bf_conn() as conn:
        conn.execute("""
            INSERT INTO bf_builds (title, weapon_type, top1, top2, top3, date, tabs_json, categories_json)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        """, (
            data.get("title", "").strip(),
            data.get("weapon_type", "").strip(),
            data.get("top1", "").strip(),
            data.get("top2", "").strip(),
            data.get("top3", "").strip(),
            data.get("date", "").strip(),
            json.dumps(data.get("tabs", []), ensure_ascii=False),
            json.dumps(data.get("categories", []), ensure_ascii=False)
        ))


def get_all_bf_builds():
    """Получить все сборки Battlefield"""
    with get_bf_conn(row_mode=True) as conn:
        rows = conn.execute("SELECT * FROM bf_builds ORDER BY id DESC").fetchall()
        builds = []
        for r in rows:
            item = dict(r)
            # распаковка JSON
            item["tabs"] = json.loads(item.get("tabs_json") or "[]")
            item["categories"] = json.loads(item.get("categories_json") or "[]")
            builds.append(item)
        return builds


def update_bf_build(build_id: int, data: dict):
    """Обновление сборки Battlefield"""
    with get_bf_conn() as conn:
        conn.execute("""
            UPDATE bf_builds
            SET title = ?, weapon_type = ?, top1 = ?, top2 = ?, top3 = ?, 
                date = ?, tabs_json = ?, categories_json = ?
            WHERE id = ?
        """, (
            data.get("title", "").strip(),
            data.get("weapon_type", "").strip(),
            data.get("top1", "").strip(),
            data.get("top2", "").strip(),
            data.get("top3", "").strip(),
            data.get("date", "").strip(),
            json.dumps(data.get("tabs", []), ensure_ascii=False),
            json.dumps(data.get("categories", []), ensure_ascii=False),
            build_id
        ))


def delete_bf_build(build_id: int):
    """Удаление сборки Battlefield"""
    with get_bf_conn() as conn:
        conn.execute("DELETE FROM bf_builds WHERE id = ?", (build_id,))

# ========================
# ⚙️ BATTLEFIELD TYPES & MODULES
# ========================

def init_bf_types_modules_tables():
    """Создание таблиц типов оружия и модулей"""
    with get_bf_conn() as conn:
        conn.execute("""
            CREATE TABLE IF NOT EXISTS bf_weapon_types (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                key TEXT UNIQUE NOT NULL,
                label TEXT NOT NULL
            )
        """)
        conn.execute("""
            CREATE TABLE IF NOT EXISTS bf_modules (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                weapon_type TEXT NOT NULL,
                category TEXT NOT NULL,
                name TEXT NOT NULL
            )
        """)


def add_bf_weapon_type(key: str, label: str):
    with get_bf_conn() as conn:
        conn.execute("INSERT OR IGNORE INTO bf_weapon_types (key, label) VALUES (?, ?)", (key, label))


def get_bf_weapon_types():
    with get_bf_conn(row_mode=True) as conn:
        return [dict(r) for r in conn.execute("SELECT * FROM bf_weapon_types ORDER BY id ASC").fetchall()]


def delete_bf_weapon_type(type_id: int):
    with get_bf_conn() as conn:
        conn.execute("DELETE FROM bf_weapon_types WHERE id = ?", (type_id,))
        conn.execute("DELETE FROM bf_modules WHERE weapon_type IN (SELECT key FROM bf_weapon_types WHERE id=?)", (type_id,))


def add_bf_module(weapon_type: str, category: str, name: str):
    with get_bf_conn() as conn:
        conn.execute("""
            INSERT INTO bf_modules (weapon_type, category, name)
            VALUES (?, ?, ?)
        """, (weapon_type, category, name))


def get_bf_modules_by_type(weapon_type: str):
    with get_bf_conn(row_mode=True) as conn:
        rows = conn.execute(
            "SELECT * FROM bf_modules WHERE weapon_type = ? ORDER BY category ASC, name ASC",
            (weapon_type,)
        ).fetchall()
        data = {}
        for r in rows:
            cat = r["category"]
            if cat not in data:
                data[cat] = []
            data[cat].append(dict(r))
        return data


def delete_bf_module(module_id: int):
    with get_bf_conn() as conn:
        conn.execute("DELETE FROM bf_modules WHERE id = ?", (module_id,))



# ========================
# Инициализация вручную
# ========================

if __name__ == "__main__":
    init_bf_db()
    init_bf_builds_table()
    print("[+] Battlefield Challenges DB initialized:", BF_DB_PATH)
