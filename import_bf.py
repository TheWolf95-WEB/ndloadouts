import json
from pathlib import Path
from database_bf_settings import (
    init_bf_settings_table,
    ensure_section_column,
    add_bf_setting
)

JSON_PATH = Path("data/bf/audio.json")


def normalize_type(t: str) -> str:
    allowed = {"toggle", "slider", "number", "select", "button", "color", "text"}
    return t if t in allowed else "toggle"


def import_bf_settings():
    if not JSON_PATH.exists():
        raise FileNotFoundError(f"❌ Не найден файл: {JSON_PATH.resolve()}")

    with open(JSON_PATH, "r", encoding="utf-8") as f:
        data = json.load(f)

    init_bf_settings_table()
    ensure_section_column()

    imported = 0
    for item in data:
        try:
            add_bf_setting({
                "category": item.get("category", "accessibility"),
                "section": item.get("section", ""),
                "title_en": item.get("title_en", ""),
                "title_ru": item.get("title_ru", ""),
                "type": normalize_type(item.get("type", "toggle")),
                "default": str(item.get("default", "")),
                "options": item.get("options", []),
                "subsettings": item.get("subsettings", []),
            })
            imported += 1
        except Exception as e:
            print(f"⚠️ Ошибка при добавлении '{item.get('title_en', '')}': {e}")

    print(f"✅ Импортировано {imported} записей из {JSON_PATH.name}.")


if __name__ == "__main__":
    import_bf_settings()
