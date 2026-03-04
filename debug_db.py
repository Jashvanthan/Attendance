
import sqlite3
import os

DB_PATH = os.path.join(os.getcwd(), 'attendance.db')

def debug_db():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    
    print("--- ALL ATTENDANCE RECORDS ---")
    rows = conn.execute("SELECT * FROM attendance").fetchall()
    for row in rows:
        print(dict(row))
        
    print("\n--- STUDENTS ---")
    rows = conn.execute("SELECT id, name, register_number FROM students").fetchall()
    for row in rows:
        print(dict(row))
        
    conn.close()

if __name__ == "__main__":
    debug_db()
