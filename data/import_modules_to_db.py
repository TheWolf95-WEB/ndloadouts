import os
import json
import requests

API_URL = "http://localhost:8000/api/modules"
INIT_DATA = os.getenv("INIT_DATA") or "test"  # или подставь вручную, если нужно

FOLDER = "./data"
FILES = [f for f in os.listdir(FOLDER) if f.startswith("modules-") and f.endswith(".json")]

for filename in FILES:
    weapon_type = filename.replace("modules-", "").replace(".json", "")
    filepath = os.path.join(FOLDER, filename)

    with open(filepath, 'r', encoding='utf-8') as f:
        try:
            categories_dict = json.load(f)
        except Exception as e:
            print(f"❌ Ошибка чтения {filename}: {e}")
            continue

    print(f"\n📦 Импорт из {filename} → тип: {weapon_type}")

    for category, modules in categories_dict.items():
        if not isinstance(modules, list):
            print(f"⚠️ Пропущено: категория {category} не список")
            continue

        for i, item in enumerate(modules, 1):
            payload = {
                "initData": INIT_DATA,
                "weapon_type": weapon_type,
                "category": category.strip(),
                "en": item.get("en", "").strip(),
                "ru": item.get("ru", "").strip(),
                "pos": i
            }

            if not payload["category"] or not payload["en"] or not payload["ru"]:
                print(f"⚠️ Пропущено: пустые поля в {category} → {item}")
                continue

            try:
                r = requests.post(API_URL, json=payload)
                if r.status_code == 200:
                    print(f"✅ [{weapon_type}] {category} → {payload['en']}")
                else:
                    print(f"❌ [{weapon_type}] {category} → {payload['en']} — {r.status_code}: {r.text}")
            except Exception as e:
                print(f"❌ Ошибка запроса: {e}")
