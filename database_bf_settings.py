import sqlite3
import json
from pathlib import Path
from contextlib import contextmanager

BF_DB_PATH = Path("/opt/ndloadouts/builds_bf.db")
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


def init_bf_settings_table():
    with get_bf_conn() as conn:
        conn.execute("""
            CREATE TABLE IF NOT EXISTS bf_settings (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                category TEXT NOT NULL,
                section TEXT DEFAULT '',
                title_en TEXT NOT NULL,
                title_ru TEXT,
                type TEXT CHECK(type IN (
                    'toggle','slider','number','select','button','color','text'
                )) NOT NULL DEFAULT 'toggle',
                default_value TEXT,
                options_json TEXT,
                subsettings_json TEXT DEFAULT '[]',
                created_at TEXT DEFAULT CURRENT_TIMESTAMP
            )
        """)


def ensure_section_column():
    with get_bf_conn() as conn:
        cols = [r[1] for r in conn.execute("PRAGMA table_info(bf_settings)")]
        if "section" not in cols:
            conn.execute("ALTER TABLE bf_settings ADD COLUMN section TEXT DEFAULT ''")
        if "subsettings_json" not in cols:
            conn.execute("ALTER TABLE bf_settings ADD COLUMN subsettings_json TEXT DEFAULT '[]'")


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

        try:
            item["subsettings"] = json.loads(item.get("subsettings_json") or "[]")
        except Exception:
            item["subsettings"] = []

        item.pop("options_json", None)
        item.pop("subsettings_json", None)

        data.append(item)

    return data


def add_bf_setting(data: dict):
    with get_bf_conn() as conn:
        conn.execute("""
            INSERT INTO bf_settings (
                category, section, title_en, title_ru,
                type, default_value, options_json, subsettings_json
            )
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        """, (
            data.get("category", "accessibility"),
            data.get("section", ""),
            data.get("title_en", ""),
            data.get("title_ru", ""),
            data.get("type", "toggle"),
            str(data.get("default", "")),
            json.dumps(data.get("options") or []),
            json.dumps(data.get("subsettings") or []),
        ))


if __name__ == "__main__":
    init_bf_settings_table()
    ensure_section_column()
    print("✅ Таблица bf_settings готова (section + subsettings проверены).")
