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
        version TEXT NOT NULL UNIQUE,
        title TEXT NOT NULL,
        content TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'draft',
        created_at TEXT NOT NULL,
        updated_at TEXT
    )
    """)
    conn.commit()
    conn.close()


def add_version(version: str, title: str, content: str, status: str = "draft"):
    conn = sqlite3.connect(DB_VERSIONS)
    c = conn.cursor()
    c.execute("""
        INSERT INTO version_history (version, title, content, status, created_at)
        VALUES (?, ?, ?, ?, ?)
    """, (version, title, content, status, datetime.now().isoformat()))
    conn.commit()
    conn.close()


def update_version(version_id: int, version: str, title: str, content: str):
    conn = sqlite3.connect(DB_VERSIONS)
    c = conn.cursor()
    c.execute("""
        UPDATE version_history
        SET version = ?, title = ?, content = ?, updated_at = ?
        WHERE id = ?
    """, (version, title, content, datetime.now().isoformat(), version_id))
    conn.commit()
    conn.close()


def set_version_status(version_id: int, status: str):
    conn = sqlite3.connect(DB_VERSIONS)
    c = conn.cursor()
    c.execute("""
        UPDATE version_history
        SET status = ?, updated_at = ?
        WHERE id = ?
    """, (status, datetime.now().isoformat(), version_id))
    conn.commit()
    conn.close()


def get_versions(published_only=True):
    conn = sqlite3.connect(DB_VERSIONS)
    c = conn.cursor()
    if published_only:
        c.execute("SELECT * FROM version_history WHERE status='published' ORDER BY id DESC")
    else:
        c.execute("SELECT * FROM version_history ORDER BY id DESC")
    rows = c.fetchall()
    conn.close()
    return rows


def delete_version(version_id: int):
    conn = sqlite3.connect(DB_VERSIONS)
    c = conn.cursor()
    c.execute("DELETE FROM version_history WHERE id = ?", (version_id,))
    conn.commit()
    conn.close()
