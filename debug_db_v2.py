
import sqlite3
import os

DB_PATH = os.path.join(os.getcwd(), 'attendance.db')

def debug_db():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    
    print("--- ATTENDANCE FOR STUDENT 8 ---")
    rows = conn.execute("SELECT * FROM attendance WHERE student_id = 8").fetchall()
    for row in rows:
        print(dict(row))
        
    print("\n--- ATTENDANCE STATUS DISTRIBUTION ---")
    rows = conn.execute("SELECT status, COUNT(*) as count FROM attendance GROUP BY status").fetchall()
    for row in rows:
        print(dict(row))
        
    conn.close()

if __name__ == "__main__":
    debug_db()
