import sqlite3
import json
from pathlib import Path

DB_PATH = Path("data/builds.db")
DB_PATH.parent.mkdir(exist_ok=True)

def init_db():
    conn = sqlite3.connect(DB_PATH)
    c = conn.cursor()
    c.execute("""
        CREATE TABLE IF NOT EXISTS builds (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            title TEXT NOT NULL,
            weapon_type TEXT,
            top1 TEXT,
            top2 TEXT,
            top3 TEXT,
            tabs_json TEXT,
            image TEXT
        )
    """)
    conn.commit()
    conn.close()

def get_all_builds():
    conn = sqlite3.connect(DB_PATH)
    c = conn.cursor()
    c.execute("SELECT * FROM builds ORDER BY id DESC")
    rows = c.fetchall()
    conn.close()
    builds = []
    for row in rows:
        builds.append({
            "id": row[0],
            "title": row[1],
            "weapon_type": row[2],
            "top1": row[3],
            "top2": row[4],
            "top3": row[5],
            "tabs": json.loads(row[6]) if row[6] else [],
            "image": row[7]
        })
    return builds

# Добавление сборки
def add_build(data):
    conn = sqlite3.connect(DB_PATH)
    c = conn.cursor()
    c.execute("""
        INSERT INTO builds (title, weapon_type, top1, top2, top3, tabs_json, image)
        VALUES (?, ?, ?, ?, ?, ?, ?)
    """, (
        data["title"],
        data["weapon_type"],
        data["top1"],
        data["top2"],
        data["top3"],
        json.dumps(data["tabs"]),
        data.get("image")
    ))
    conn.commit()
    conn.close()


# Удаление сборки
def delete_build_by_id(build_id: str):
    conn = sqlite3.connect(DB_PATH)
    cursor = conn.cursor()
    cursor.execute("DELETE FROM builds WHERE id = ?", (build_id,))
    conn.commit()
    conn.close()
