import sqlite3
import json
from pathlib import Path
from datetime import datetime
from contextlib import contextmanager

DB_PATH = Path("/opt/ndloadouts_storage/builds.db")
DB_PATH.parent.mkdir(exist_ok=True)

# ========================
# Общие утилиты для SQLite
# ========================

@contextmanager
def get_conn(row_mode: bool = False):
    conn = sqlite3.connect(DB_PATH)
    if row_mode:
        conn.row_factory = sqlite3.Row
    try:
        # Включим внешние ключи и WAL (однократно; если уже стоит — ок)
        conn.execute("PRAGMA foreign_keys = ON")
        try:
            conn.execute("PRAGMA journal_mode = WAL")
        except sqlite3.DatabaseError:
            pass
        yield conn
        conn.commit()
    finally:
        conn.close()

# ========================
# ИНИЦИАЛИЗАЦИЯ БАЗЫ
# ========================

def init_db():
    with get_conn() as conn:
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

        # Справочник модулей (инициализация и индексы)
        c.execute("""
            CREATE TABLE IF NOT EXISTS weapon_modules (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                weapon_type TEXT NOT NULL,   -- assault, smg, shotgun, ...
                category    TEXT NOT NULL,   -- "Muzzle", "Barrel", "Optic", ...
                en          TEXT NOT NULL,   -- ключ как в сборках (eng)
                ru          TEXT NOT NULL,   -- отображаемое имя (ru)
                pos         INTEGER DEFAULT 0
            )
        """)
        c.execute("CREATE UNIQUE INDEX IF NOT EXISTS wm_unique ON weapon_modules(weapon_type, category, en)")
        c.execute("CREATE INDEX IF NOT EXISTS wm_idx ON weapon_modules(weapon_type, category)")
        # При желании можно сделать кейс-инсенситивность для en через COLLATE NOCASE на уровне таблицы.

# ====== СБОРКИ ======

def get_all_builds():
    with get_conn() as conn:
        c = conn.cursor()
        c.execute("SELECT * FROM builds ORDER BY id DESC")
        rows = c.fetchall()
        columns = [desc[0] for desc in c.description]

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
    tabs = data.get("tabs") or []
    if not isinstance(tabs, list):
        tabs = []

    categories = data.get("categories", ["all"])
    if not isinstance(categories, list):
        categories = ["all"]

    with get_conn() as conn:
        c = conn.cursor()
        c.execute("""
            INSERT INTO builds (title, weapon_type, top1, top2, top3, tabs_json, image, date, categories)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        """, (
            data["title"],
            data["weapon_type"],
            data.get("top1", ""),
            data.get("top2", ""),
            data.get("top3", ""),
            json.dumps(tabs, ensure_ascii=False),
            data.get("image"),
            data.get("date"),
            json.dumps(categories, ensure_ascii=False)
        ))

def delete_build_by_id(build_id: str):
    with get_conn() as conn:
        conn.execute("DELETE FROM builds WHERE id = ?", (build_id,))

def update_build_by_id(build_id, data):
    tabs = data.get("tabs") or []
    if not isinstance(tabs, list):
        tabs = []

    categories = data.get("categories", ["all"])
    if not isinstance(categories, list):
        categories = ["all"]

    with get_conn() as conn:
        conn.execute("""
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

# ====== ПОЛЬЗОВАТЕЛИ ======

def save_user(user_id: str, first_name: str, username: str = ""):
    with get_conn() as conn:
        conn.execute("""
            INSERT INTO users (id, first_name, username)
            VALUES (?, ?, ?)
            ON CONFLICT(id) DO UPDATE SET
                first_name = excluded.first_name,
                username = excluded.username
        """, (user_id, first_name, username))

def get_all_users():
    with get_conn() as conn:
        rows = conn.execute("SELECT id, first_name, username FROM users").fetchall()
    return [{"id": row[0], "first_name": row[1], "username": row[2]} for row in rows]

# ====== МИГРАЦИИ/СЛУЖЕБНЫЕ ======

def add_date_column_if_not_exists():
    with get_conn() as conn:
        c = conn.cursor()
        c.execute("PRAGMA table_info(builds)")
        columns = [col[1] for col in c.fetchall()]
        if "date" not in columns:
            c.execute("ALTER TABLE builds ADD COLUMN date TEXT")

def fill_empty_dates():
    today = datetime.now().strftime('%Y-%m-%d')
    with get_conn() as conn:
        conn.execute("UPDATE builds SET date = ? WHERE date IS NULL OR date = ''", (today,))

def add_categories_column_if_not_exists():
    with get_conn() as conn:
        c = conn.cursor()
        c.execute("PRAGMA table_info(builds)")
        columns = [col[1] for col in c.fetchall()]
        if "categories" not in columns:
            c.execute("ALTER TABLE builds ADD COLUMN categories TEXT DEFAULT '[]'")

# =========================
# СПРАВОЧНИК МОДУЛЕЙ (CRUD)
# =========================

def modules_list(weapon_type: str | None = None):
    """
    Возвращает список словарей: {id, weapon_type, category, en, ru, pos}
    Если weapon_type=None — вернёт по всем типам.
    """
    q = """SELECT id, weapon_type, category, en, ru, pos
           FROM weapon_modules"""
    params = []
    if weapon_type:
        q += " WHERE weapon_type = ?"
        params.append(weapon_type)
    q += " ORDER BY category, pos, ru"

    with get_conn(row_mode=True) as conn:
        rows = conn.execute(q, params).fetchall()
    return [dict(r) for r in rows]

def modules_grouped_by_category(weapon_type: str):
    """
    Группирует как JSON: {category: [{id,en,ru,pos}, ...]}
    """
    grouped = {}
    for row in modules_list(weapon_type):
        cat = row["category"]
        grouped.setdefault(cat, []).append({
            "id": row["id"], "en": row["en"], "ru": row["ru"], "pos": row["pos"]
        })
    return grouped

def modules_categories(weapon_type: str | None = None):
    """
    Список уникальных категорий. Если weapon_type=None — по всем типам.
    """
    if weapon_type:
        q = "SELECT DISTINCT category FROM weapon_modules WHERE weapon_type = ? ORDER BY category"
        params = (weapon_type,)
    else:
        q = "SELECT DISTINCT category FROM weapon_modules ORDER BY category"
        params = ()
    with get_conn() as conn:
        rows = conn.execute(q, params).fetchall()
    return [r[0] for r in rows]

def modules_search(query: str, weapon_type: str | None = None, limit: int = 50):
    """
    Поиск по en/ru (LIKE), опционально ограничить по weapon_type.
    """
    like = f"%{query.strip()}%"
    if weapon_type:
        q = """SELECT id, weapon_type, category, en, ru, pos
               FROM weapon_modules
               WHERE weapon_type = ? AND (en LIKE ? OR ru LIKE ?)
               ORDER BY category, pos, ru
               LIMIT ?"""
        params = (weapon_type, like, like, limit)
    else:
        q = """SELECT id, weapon_type, category, en, ru, pos
               FROM weapon_modules
               WHERE (en LIKE ? OR ru LIKE ?)
               ORDER BY category, pos, ru
               LIMIT ?"""
        params = (like, like, limit)

    with get_conn(row_mode=True) as conn:
        rows = conn.execute(q, params).fetchall()
    return [dict(r) for r in rows]

def module_add_or_update(weapon_type: str, category: str, en: str, ru: str, pos: int = 0) -> int:
    """
    UPSERT: если (weapon_type, category, en) существует — обновим ru/pos.
    Возвращает id модуля.
    """
    weapon_type = (weapon_type or "").strip()
    category    = (category or "").strip()
    en_key      = (en or "").strip().lower()  # нормализуем ключ
    ru_name     = (ru or "").strip()
    pos_val     = int(pos or 0)

    with get_conn() as conn:
        # Попробуем вставить
        conn.execute("""
            INSERT INTO weapon_modules(weapon_type, category, en, ru, pos)
            VALUES (?,?,?,?,?)
            ON CONFLICT(weapon_type, category, en)
            DO UPDATE SET
                ru = excluded.ru,
                pos = excluded.pos
        """, (weapon_type, category, en_key, ru_name, pos_val))

        # Вернём id
        row = conn.execute("""
            SELECT id FROM weapon_modules
            WHERE weapon_type = ? AND category = ? AND en = ?
        """, (weapon_type, category, en_key)).fetchone()
        return int(row[0])

def module_update(module_id: int, *, category: str | None = None,
                  en: str | None = None, ru: str | None = None, pos: int | None = None) -> int:
    sets, vals = [], []
    if category is not None: sets.append("category = ?"); vals.append(category.strip())
    if en is not None:       sets.append("en = ?");       vals.append(en.strip().lower())
    if ru is not None:       sets.append("ru = ?");       vals.append(ru.strip())
    if pos is not None:      sets.append("pos = ?");      vals.append(int(pos))
    if not sets:
        return 0
    vals.append(module_id)

    with get_conn() as conn:
        cur = conn.execute(f"UPDATE weapon_modules SET {', '.join(sets)} WHERE id = ?", vals)
        return cur.rowcount

def module_delete(module_id: int) -> int:
    with get_conn() as conn:
        cur = conn.execute("DELETE FROM weapon_modules WHERE id = ?", (module_id,))
        return cur.rowcount

# ====== ВЕРСИИ ======

def add_version_entry(content: str):
    with get_conn() as conn:
        conn.execute("""
            INSERT INTO version_history (content, created_at)
            VALUES (?, ?)
        """, (content, datetime.now().isoformat()))

def get_latest_version():
    with get_conn() as conn:
        row = conn.execute("SELECT content FROM version_history ORDER BY created_at DESC LIMIT 1").fetchone()
    return row[0] if row else ""

def get_all_versions():
    with get_conn() as conn:
        rows = conn.execute("SELECT content, created_at FROM version_history ORDER BY created_at DESC").fetchall()
    return [{"content": r[0], "created_at": r[1]} for r in rows]

# ====== Запуск вручную ======

if __name__ == '__main__':
    init_db()
    add_date_column_if_not_exists()
    fill_empty_dates()
    add_categories_column_if_not_exists()
