# database_versions.py
import sqlite3
from datetime import datetime

DB_VERSIONS = "version_history.db"


def init_versions_table():
    conn = sqlite3.connect(DB_VERSIONS)
    c = conn.cursor()
    c.execute("""
    CREATE TABLE IF NOT EXISTS version_history (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        version TEXT NOT NULL,
        title TEXT NOT NULL,
        content TEXT NOT NULL,
        created_at TEXT NOT NULL
    )
    """)
    conn.commit()
    conn.close()


def add_version(version: str, title: str, content: str):
    conn = sqlite3.connect(DB_VERSIONS)
    c = conn.cursor()
    c.execute("""
        INSERT INTO version_history (version, title, content, created_at)
        VALUES (?, ?, ?, ?)
    """, (version, title, content, datetime.now().isoformat()))
    conn.commit()
    conn.close()


def get_versions():
    conn = sqlite3.connect(DB_VERSIONS)
    c = conn.cursor()
    c.execute("""
        SELECT id, version, title, content, created_at
        FROM version_history
        ORDER BY id DESC
    """)
    rows = c.fetchall()
    conn.close()
    return rows


def delete_version(version_id: int):
    conn = sqlite3.connect(DB_VERSIONS)
    c = conn.cursor()
    c.execute("DELETE FROM version_history WHERE id = ?", (version_id,))
    conn.commit()
    conn.close()
