import sqlite3
import json
from pathlib import Path
from contextlib import contextmanager

# === Путь к БД ===
BF_DB_PATH = Path("/opt/ndloadouts/builds_bf.db")
BF_DB_PATH.parent.mkdir(exist_ok=True)


@contextmanager
def get_bf_conn(row_mode: bool = False):
    """Контекстный менеджер для соединения с БД Battlefield."""
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
    """Создание таблицы настроек Battlefield, если её нет."""
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
                options_json TEXT DEFAULT '[]',
                subsettings_json TEXT DEFAULT '[]',
                created_at TEXT DEFAULT CURRENT_TIMESTAMP
            )
        """)


def ensure_section_column():
    """Проверяет, чтобы новые колонки section и subsettings_json существовали."""
    with get_bf_conn() as conn:
        cols = [r[1] for r in conn.execute("PRAGMA table_info(bf_settings)")]
        if "section" not in cols:
            conn.execute("ALTER TABLE bf_settings ADD COLUMN section TEXT DEFAULT ''")
        if "subsettings_json" not in cols:
            conn.execute("ALTER TABLE bf_settings ADD COLUMN subsettings_json TEXT DEFAULT '[]'")
        if "options_json" not in cols:
            conn.execute("ALTER TABLE bf_settings ADD COLUMN options_json TEXT DEFAULT '[]'")


def get_bf_settings(category: str | None = None):
    """Возвращает список всех настроек (с опциями и вложенными subsettings)."""
    with get_bf_conn(row_mode=True) as conn:
        if category:
            rows = conn.execute(
                "SELECT * FROM bf_settings WHERE category = ? ORDER BY id ASC",
                (category,),
            ).fetchall()
        else:
            rows = conn.execute("SELECT * FROM bf_settings ORDER BY id ASC").fetchall()

    data = []
    for r in rows:
        item = dict(r)

        # 🟩 Приведение default_value из JSON
        raw_default = item.get("default_value")
        try:
            item["default"] = json.loads(raw_default)
        except Exception:
            item["default"] = raw_default  # fallback
        item.pop("default_value", None)

        # 🟩 Безопасное приведение options_json
        raw_options = item.get("options_json")
        if isinstance(raw_options, str):
            try:
                parsed = json.loads(raw_options)
                item["options"] = parsed if isinstance(parsed, list) else []
            except Exception:
                item["options"] = []
        else:
            item["options"] = []

        # 🟩 Безопасное приведение subsettings_json
        raw_subs = item.get("subsettings_json")
        if isinstance(raw_subs, str):
            try:
                parsed = json.loads(raw_subs)
                item["subsettings"] = parsed if isinstance(parsed, list) else []
            except Exception:
                item["subsettings"] = []
        else:
            item["subsettings"] = []

        # 🧹 Убираем служебные поля
        item.pop("options_json", None)
        item.pop("subsettings_json", None)

        data.append(item)

    return data



def add_bf_setting(data: dict):
    """Добавляет новую настройку Battlefield в таблицу."""
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
            json.dumps(data.get("default", "")),
            json.dumps(data.get("options") or [], ensure_ascii=False),
            json.dumps(data.get("subsettings") or [], ensure_ascii=False),
        ))


if __name__ == "__main__":
    init_bf_settings_table()
    ensure_section_column()
    print("✅ Таблица bf_settings готова (section + subsettings проверены).")
