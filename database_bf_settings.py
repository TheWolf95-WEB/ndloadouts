import sqlite3
import json
from pathlib import Path
from contextlib import contextmanager

BF_DB_PATH = Path("/opt/ndloadouts/builds_bf.db")
BF_DB_PATH.parent.mkdir(exist_ok=True)


# --------------------------------------------------
# 🔌 Контекстный менеджер
# --------------------------------------------------
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


# --------------------------------------------------
# 🧱 ИНИЦИАЛИЗАЦИЯ
# --------------------------------------------------
def init_bf_settings_table():
    with get_bf_conn() as conn:
        conn.execute("""
            CREATE TABLE IF NOT EXISTS bf_settings (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                category TEXT NOT NULL,
                section TEXT DEFAULT '',
                title_en TEXT NOT NULL,
                title_ru TEXT,
                type TEXT CHECK(type IN ('toggle','slider','number','select','button')) NOT NULL DEFAULT 'toggle',
                default_value TEXT,
                options_json TEXT,
                created_at TEXT DEFAULT CURRENT_TIMESTAMP
            )
        """)


def ensure_section_column():
    with get_bf_conn() as conn:
        cols = [r[1] for r in conn.execute("PRAGMA table_info(bf_settings)")]
        if "section" not in cols:
            conn.execute("ALTER TABLE bf_settings ADD COLUMN section TEXT DEFAULT ''")


# --------------------------------------------------
# ⚙️ CRUD НАСТРОЕК
# --------------------------------------------------
def add_bf_setting(data: dict):
    with get_bf_conn() as conn:
        conn.execute("""
            INSERT INTO bf_settings (category, section, title_en, title_ru, type, default_value, options_json)
            VALUES (?, ?, ?, ?, ?, ?, ?)
        """, (
            data.get("category"),
            data.get("section", "").strip(),
            data.get("title_en", "").strip(),
            data.get("title_ru", "").strip(),
            data.get("type", "toggle"),
            str(data.get("default")),
            json.dumps(data.get("options") or []),
        ))


def get_bf_settings(category: str | None = None):
    with get_bf_conn(row_mode=True) as conn:
        if category:
            rows = conn.execute(
                "SELECT * FROM bf_settings WHERE category = ? ORDER BY id ASC",
                (category,)
            ).fetchall()
        else:
            rows = conn.execute("SELECT * FROM bf_settings ORDER BY id ASC").fetchall()
    data = []
    for r in rows:
        item = dict(r)
        try:
            item["options"] = json.loads(item.get("options_json") or "[]")
        except Exception:
            item["options"] = []
        del item["options_json"]
        data.append(item)
    return data


def update_bf_setting(setting_id: int, data: dict):
    with get_bf_conn() as conn:
        conn.execute("""
            UPDATE bf_settings
            SET category=?, section=?, title_en=?, title_ru=?, type=?, default_value=?, options_json=?
            WHERE id=?
        """, (
            data.get("category"),
            data.get("section", "").strip(),
            data.get("title_en", "").strip(),
            data.get("title_ru", "").strip(),
            data.get("type", "toggle"),
            str(data.get("default")),
            json.dumps(data.get("options") or []),
            setting_id
        ))


def delete_bf_setting(setting_id: int):
    with get_bf_conn() as conn:
        conn.execute("DELETE FROM bf_settings WHERE id=?", (setting_id,))


# --------------------------------------------------
# 🧩 Утилиты
# --------------------------------------------------
def get_bf_settings_summary():
    with get_bf_conn(row_mode=True) as conn:
        rows = conn.execute("""
            SELECT category, COUNT(*) AS count
            FROM bf_settings
            GROUP BY category
        """).fetchall()
    return [dict(r) for r in rows]


# --------------------------------------------------
# 🧰 Тест при запуске напрямую
# --------------------------------------------------
if __name__ == "__main__":
    init_bf_settings_table()
    ensure_section_column()
    print("✅ Таблица bf_settings готова (section проверен).")

    # Пример добавления
    add_bf_setting({
        "category": "graphics",
        "section": "GRAPHICS QUALITY SETTINGS",
        "title_en": "Field of View",
        "title_ru": "Поле зрения",
        "type": "slider",
        "default": "90",
        "options": []
    })
    print("Добавлена тестовая настройка.")
    print(get_bf_settings())
