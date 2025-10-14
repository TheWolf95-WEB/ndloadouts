from database_bf_settings import get_bf_conn

def cleanup_accessibility():
    with get_bf_conn() as conn:
        conn.execute("DELETE FROM bf_settings WHERE category = 'accessibility'")
    print("🧹 Старые записи категории 'accessibility' удалены.")

if __name__ == "__main__":
    cleanup_accessibility()
