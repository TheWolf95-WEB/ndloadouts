import json
from pathlib import Path
from database_bf_settings import init_bf_settings_table, ensure_section_column, add_bf_setting

JSON_PATH = Path("data/accessibility_settings.json")


def normalize_type(t):
    allowed = {"toggle", "slider", "number", "select", "button", "color"}
    return t if t in allowed else "toggle"


def flatten_settings(data, parent_section=None):
    """Рекурсивно разворачивает настройки с subsettings."""
    flat = []

    for item in data:
        section = item.get("section", parent_section)
        base_item = {
            "category": item.get("category", "accessibility"),
            "section": section,
            "title_en": item.get("title_en"),
            "title_ru": item.get("title_ru"),
            "type": normalize_type(item.get("type", "toggle")),
            "default": item.get("default", ""),
            "options": item.get("options", []),
        }
        flat.append(base_item)

        # Если есть поднастройки — добавляем их как отдельные записи
        if "subsettings" in item and isinstance(item["subsettings"], list):
            for sub in item["subsettings"]:
                flat.append({
                    "category": item.get("category", "accessibility"),
                    "section": section + " → " + item.get("title_en", ""),  # например: AUDIO → Subtitles Settings
                    "title_en": sub.get("title_en"),
                    "title_ru": sub.get("title_ru"),
                    "type": normalize_type(sub.get("type", "toggle")),
                    "default": sub.get("default", ""),
                    "options": sub.get("options", []),
                })

    return flat


def import_accessibility_settings():
    if not JSON_PATH.exists():
        raise FileNotFoundError(f"❌ Не найден файл: {JSON_PATH}")

    with open(JSON_PATH, "r", encoding="utf-8") as f:
        data = json.load(f)

    init_bf_settings_table()
    ensure_section_column()

    all_items = flatten_settings(data)
    imported = 0

    for item in all_items:
        try:
            add_bf_setting(item)
            imported += 1
        except Exception as e:
            print(f"⚠️ Ошибка при добавлении {item.get('title_en')}: {e}")

    print(f"✅ Импортировано {imported} записей из {JSON_PATH.name}.")


if __name__ == "__main__":
    import_accessibility_settings()
