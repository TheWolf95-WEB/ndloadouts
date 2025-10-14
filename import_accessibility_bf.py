import json
from pathlib import Path
from database_bf_settings import init_bf_settings_table, add_bf_setting

JSON_PATH = Path("data/accessibility_settings.json")

def normalize_type(t):
    allowed = {"toggle", "slider", "number", "select"}
    return t if t in allowed else "toggle"

def import_accessibility_settings():
    if not JSON_PATH.exists():
        raise FileNotFoundError(f"❌ Не найден файл: {JSON_PATH}")

    with open(JSON_PATH, "r", encoding="utf-8") as f:
        data = json.load(f)

    init_bf_settings_table()

    imported = 0
    skipped = 0
    for item in data:
        fixed_type = normalize_type(item.get("type", "toggle"))
        try:
            add_bf_setting({
                "category": item.get("category", "accessibility"),
                "title_en": item.get("title_en"),
                "title_ru": item.get("title_ru"),
                "type": fixed_type,
                "default": item.get("default", ""),
                "options": item.get("options", []),
            })
            imported += 1
        except Exception as e:
            skipped += 1
            print(f"⚠️ Ошибка при добавлении {item.get('title_en')}: {e}")

    print(f"✅ Импорт завершён. Добавлено {imported}, пропущено {skipped}.")


if __name__ == "__main__":
    import_accessibility_settings()
