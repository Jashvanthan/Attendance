"""
Database module for the Smart Attendance Monitoring System.
Uses SQLite for zero-configuration setup.
"""

import sqlite3
import os
import json
try:
    import numpy as np
    NUMPY_AVAILABLE = True
except ImportError:
    NUMPY_AVAILABLE = False
from datetime import datetime, date, timedelta

DB_PATH = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), 'attendance.db')


def get_db():
    """Get a database connection with row factory."""
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON")
    return conn


def init_db():
    """Initialize database schema."""
    conn = get_db()
    cursor = conn.cursor()

    cursor.executescript('''
        CREATE TABLE IF NOT EXISTS students (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL,
            register_number TEXT UNIQUE NOT NULL,
            department TEXT NOT NULL,
            year INTEGER NOT NULL,
            student_class TEXT DEFAULT 'A',
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );

        CREATE TABLE IF NOT EXISTS face_embeddings (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            student_id INTEGER NOT NULL,
            encoding TEXT NOT NULL,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (student_id) REFERENCES students(id) ON DELETE CASCADE
        );

        CREATE TABLE IF NOT EXISTS attendance (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            student_id INTEGER NOT NULL,
            date DATE NOT NULL,
            time TIME NOT NULL,
            status TEXT NOT NULL DEFAULT 'present',
            method TEXT NOT NULL DEFAULT 'auto',
            FOREIGN KEY (student_id) REFERENCES students(id) ON DELETE CASCADE
        );

        CREATE TABLE IF NOT EXISTS working_days (
            date DATE PRIMARY KEY,
            status TEXT NOT NULL CHECK (status IN ('working', 'holiday')),
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );

        CREATE INDEX IF NOT EXISTS idx_attendance_date ON attendance(date);
        CREATE INDEX IF NOT EXISTS idx_attendance_student ON attendance(student_id);
        CREATE INDEX IF NOT EXISTS idx_students_department ON students(department);
        CREATE INDEX IF NOT EXISTS idx_students_year ON students(year);
        CREATE INDEX IF NOT EXISTS idx_working_days_date ON working_days(date);

        CREATE TABLE IF NOT EXISTS admins (
            admin_id INTEGER PRIMARY KEY AUTOINCREMENT,
            admin_name TEXT UNIQUE NOT NULL,
            password TEXT NOT NULL,
            alt_password TEXT NOT NULL,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );

    ''')

    conn.commit()

    # Schema Migration: Ensure student_class exists if the database was
    # created before this column was added.
    try:
        conn.execute("ALTER TABLE students ADD COLUMN student_class TEXT DEFAULT 'A'")
        conn.commit()
        print("Migrated database: added student_class column to students table.")
    except sqlite3.OperationalError:
        # Ignore if the column already exists
        pass

    conn.close()


# ─── Working Days Operations ───

def get_working_days(month=None, year=None):
    """Get list of working days and holidays."""
    conn = get_db()
    query = "SELECT date, status FROM working_days WHERE 1=1"
    params = []
    
    if month:
        m = month.zfill(2)
        if year:
            query += " AND date LIKE ?"
            params.append(f"{year}-{m}-%")
        else:
            query += " AND date LIKE ?"
            params.append(f"%-${m}-%")
    elif year:
        query += " AND date LIKE ?"
        params.append(f"{year}-%")
        
    query += " ORDER BY date DESC"
    rows = conn.execute(query, params).fetchall()
    conn.close()
    return [dict(r) for r in rows]

def add_working_day(date_str, status):
    """Add a new working day or holiday."""
    conn = get_db()
    try:
        conn.execute(
            "INSERT INTO working_days (date, status) VALUES (?, ?)",
            (date_str, status)
        )
        if status == 'holiday':
            conn.execute("DELETE FROM attendance WHERE date = ?", (date_str,))
        conn.commit()
    except sqlite3.IntegrityError:
        raise ValueError(f"Record for date '{date_str}' already exists.")
    finally:
        conn.close()

def update_working_day(date_str, status):
    """
    Update status of a working day.
    If changed to 'holiday', remove existing attendance records for that date.
    """
    conn = get_db()
    conn.execute(
        "UPDATE working_days SET status = ? WHERE date = ?",
        (status, date_str)
    )
    
    if status == 'holiday':
        # If changed to holiday, records for this date become invalid
        conn.execute("DELETE FROM attendance WHERE date = ?", (date_str,))
        
    conn.commit()
    conn.close()

def delete_working_day(date_str):
    """Delete a working day record."""
    conn = get_db()
    conn.execute("DELETE FROM working_days WHERE date = ?", (date_str,))
    conn.commit()
    conn.close()

def is_working_day(date_str):
    """Check if a date is a marked working day."""
    conn = get_db()
    row = conn.execute(
        "SELECT status FROM working_days WHERE date = ?",
        (date_str,)
    ).fetchone()
    conn.close()
    if not row:
        return None # Not defined
    return row['status'] == 'working'


# ─── Student Operations ───

def add_student(name, register_number, department, year, student_class='A'):
    """Add a new student. Returns the new student's ID."""
    conn = get_db()
    try:
        cursor = conn.execute(
            'INSERT INTO students (name, register_number, department, year, student_class) VALUES (?, ?, ?, ?, ?)',
            (name, register_number, department, int(year), student_class)
        )
        conn.commit()
        return cursor.lastrowid
    except sqlite3.IntegrityError:
        raise ValueError(f"Student with register number '{register_number}' already exists.")
    finally:
        conn.close()


def get_students(department=None, year=None, student_class=None, search=None):
    """Get all students with optional filters and attendance stats."""
    conn = get_db()
    
    # Calculate total worked days once
    total_worked_days = conn.execute(
        "SELECT COUNT(*) FROM working_days WHERE status = 'working'"
    ).fetchone()[0]

    query = f'''
        SELECT s.*,
               COUNT(CASE WHEN a.status = 'present' AND a.date IN (SELECT date FROM working_days WHERE status = 'working') THEN 1 END) as present_days,
               {total_worked_days} as total_worked_days
        FROM students s
        LEFT JOIN attendance a ON s.id = a.student_id
        WHERE 1=1
    '''
    params = []

    if department:
        query += ' AND s.department = ?'
        params.append(department)
    if year:
        query += ' AND s.year = ?'
        params.append(int(year))
    if student_class:
        query += ' AND s.student_class = ?'
        params.append(student_class)
    if search:
        query += ' AND (s.name LIKE ? OR s.register_number LIKE ?)'
        params.extend([f'%{search}%', f'%{search}%'])

    query += ' GROUP BY s.id ORDER BY s.name ASC'
    rows = conn.execute(query, params).fetchall()
    conn.close()
    
    result = []
    for r in rows:
        d = dict(r)
        tw = d['total_worked_days']
        p = d['present_days']
        d['attendance_percentage'] = round((p / tw * 100), 1) if tw > 0 else 0
        result.append(d)
        
    return result


def get_student(student_id):
    """Get a single student by ID."""
    conn = get_db()
    row = conn.execute('SELECT * FROM students WHERE id = ?', (student_id,)).fetchone()
    conn.close()
    return dict(row) if row else None


def delete_student(student_id):
    """Delete a student and their associated data."""
    conn = get_db()
    conn.execute('DELETE FROM students WHERE id = ?', (student_id,))
    conn.commit()
    conn.close()


def get_departments():
    """Get a list of distinct departments."""
    conn = get_db()
    rows = conn.execute('SELECT DISTINCT department FROM students ORDER BY department').fetchall()
    conn.close()
    return [r['department'] for r in rows]

def update_student(student_id, name, register_number, department, year, student_class='A'):
    """Update an existing student's details."""
    conn = get_db()
    try:
        conn.execute(
            'UPDATE students SET name = ?, register_number = ?, department = ?, year = ?, student_class = ? WHERE id = ?',
            (name, register_number, department, int(year), student_class, (student_id))
        )
        conn.commit()
    except sqlite3.IntegrityError:
        raise ValueError(f"Student with register number '{register_number}' already exists.")
    finally:
        conn.close()

# ─── Admin Operations ───

def add_admin(admin_name, password, alt_password):
    """Add a new admin."""
    conn = get_db()
    try:
        cursor = conn.execute(
            'INSERT INTO admins (admin_name, password, alt_password) VALUES (?, ?, ?)',
            (admin_name, password, alt_password)
        )
        conn.commit()
        return cursor.lastrowid
    except sqlite3.IntegrityError:
        raise ValueError(f"Admin with name '{admin_name}' already exists.")
    finally:
        conn.close()

def get_admins():
    """Get all registered admins."""
    conn = get_db()
    rows = conn.execute('SELECT admin_id, admin_name FROM admins ORDER BY admin_id ASC').fetchall()
    conn.close()
    return [dict(r) for r in rows]

def get_admin_by_name(admin_name):
    """Get admin details by name."""
    conn = get_db()
    row = conn.execute('SELECT * FROM admins WHERE admin_name = ?', (admin_name,)).fetchone()
    conn.close()
    return dict(row) if row else None



# ─── Face Embedding Operations ───

def save_face_encoding(student_id, encoding):
    """Store a face encoding for a student. encoding is a numpy array or list."""
    conn = get_db()
    if NUMPY_AVAILABLE and isinstance(encoding, np.ndarray):
        encoding_list = encoding.tolist()
    elif hasattr(encoding, 'tolist'):
        encoding_list = encoding.tolist()
    else:
        encoding_list = list(encoding) if not isinstance(encoding, list) else encoding
    encoding_json = json.dumps(encoding_list)
    conn.execute(
        'INSERT INTO face_embeddings (student_id, encoding) VALUES (?, ?)',
        (student_id, encoding_json)
    )
    conn.commit()
    conn.close()


def delete_face_encodings(student_id):
    """Delete all face encodings stored for a specific student."""
    conn = get_db()
    conn.execute('DELETE FROM face_embeddings WHERE student_id = ?', (student_id,))
    conn.commit()
    conn.close()


def get_all_face_encodings():
    """Get all face encodings with student info. Returns list of dicts."""
    conn = get_db()
    rows = conn.execute('''
        SELECT fe.student_id, s.name, s.register_number, fe.encoding
        FROM face_embeddings fe
        JOIN students s ON fe.student_id = s.id
    ''').fetchall()
    conn.close()

    results = []
    for r in rows:
        enc_data = json.loads(r['encoding'])
        enc = np.array(enc_data) if NUMPY_AVAILABLE else enc_data
        results.append({
            'student_id': r['student_id'],
            'name': r['name'],
            'register_number': r['register_number'],
            'encoding': enc
        })
    return results


def has_face_encoding(student_id):
    """Check if a student has a face encoding stored."""
    conn = get_db()
    row = conn.execute(
        'SELECT COUNT(*) as cnt FROM face_embeddings WHERE student_id = ?', (student_id,)
    ).fetchone()
    conn.close()
    return row['cnt'] > 0


def get_face_encodings_by_student(student_id):
    """Fetch ALL face encodings for a single student ID."""
    conn = get_db()
    rows = conn.execute('SELECT encoding FROM face_embeddings WHERE student_id = ?', (student_id,)).fetchall()
    conn.close()
    return [json.loads(r['encoding']) for r in rows]


def count_recent_failed_attempts(identifier, minutes=10):
    """Count failed verification attempts in the last X minutes for a specific identifier."""
    # Identifier can be student_id or register_number
    conn = get_db()
    
    # Calculate localized threshold time in Python instead of relying on SQLite UTC
    threshold_time = (datetime.now() - timedelta(minutes=minutes)).strftime('%Y-%m-%d %H:%M:%S')
    
    query = '''
        SELECT COUNT(*) as count 
        FROM verification_log 
        WHERE (student_id = ? OR attempted_register_number = ?)
          AND result = 'failed'
          AND timestamp > ?
    '''
    row = conn.execute(query, (identifier, identifier, threshold_time)).fetchone()
    conn.close()
    return row['count'] if row else 0


def log_verification_attempt(student_id, register_number, result, reason=None):
    """Log a face verification attempt to the database."""
    conn = get_db()
    
    # Force use Local/Indian time directly into the table
    current_time = datetime.now().strftime('%Y-%m-%d %H:%M:%S')
    
    conn.execute(
        '''INSERT INTO verification_log
           (student_id, attempted_register_number, result, reason, timestamp)
           VALUES (?, ?, ?, ?, ?)''',
        (student_id, register_number, result, reason, current_time)
    )
    conn.commit()
    conn.close()


def get_verification_logs(limit=50):
    """Get recent verification log entries."""
    conn = get_db()
    rows = conn.execute(
        '''SELECT vl.id, vl.attempted_register_number, vl.result, vl.reason,
                  vl.timestamp, s.name
             FROM verification_log vl
             LEFT JOIN students s ON vl.student_id = s.id
             ORDER BY vl.timestamp DESC
             LIMIT ?''',
        (limit,)
    ).fetchall()
    conn.close()
    return [dict(r) for r in rows]


def clear_verification_logs():
    """Delete all verification log entries."""
    conn = get_db()
    conn.execute('DELETE FROM verification_log')
    conn.commit()
    conn.close()


def record_attendance(student_id, method='auto', custom_date=None, status='present'):
    """Record attendance for a student. Updates if exists."""
    target_date = custom_date if custom_date else date.today().isoformat()
    
    # ─── PREVENT MARKING ON EXPLICIT HOLIDAYS ───
    work_status = is_working_day(target_date)
    if work_status is False:
        raise ValueError("This is not a Worked Date. Attendance cannot be marked.")
    elif work_status is None:
        # Implicitly treat as a working day, add record to work log dynamically
        try:
            add_working_day(target_date, 'working')
        except ValueError:
            pass

    now = datetime.now().strftime('%H:%M:%S')

    conn = get_db()
    existing = conn.execute(
        'SELECT id FROM attendance WHERE student_id = ? AND date = ?',
        (student_id, target_date)
    ).fetchone()

    if existing:
        conn.execute('UPDATE attendance SET status = ?, method = ? WHERE id = ?', (status, method, existing['id']))
        conn.commit()
        conn.close()
        return existing['id']

    cursor = conn.execute(
        'INSERT INTO attendance (student_id, date, time, status, method) VALUES (?, ?, ?, ?, ?)',
        (student_id, target_date, now, status, method)
    )
    conn.commit()
    aid = cursor.lastrowid
    conn.close()
    return aid


def update_attendance(attendance_id, status):
    """Update attendance status (present/absent)."""
    conn = get_db()
    conn.execute(
        'UPDATE attendance SET status = ?, method = ? WHERE id = ?',
        (status, 'manual', attendance_id)
    )
    conn.commit()
    conn.close()


def get_attendance(date_filter=None, department=None, year=None, search=None, status_filter=None, student_class=None):
    """Get attendance records with optional filters."""
    conn = get_db()
    
    if date_filter:
        query = '''
            SELECT a.id, s.id as student_id, s.name, s.register_number, s.department, s.year, s.student_class,
                   ? as date, 
                   COALESCE(a.time, '--:--:--') as time, 
                   COALESCE(a.status, 'absent') as status, 
                   COALESCE(a.method, 'none') as method
            FROM students s
            LEFT JOIN attendance a ON s.id = a.student_id AND a.date = ?
            WHERE 1=1
        '''
        params = [date_filter, date_filter]
    else:
        query = '''
            SELECT a.id, a.student_id, s.name, s.register_number, s.department, s.year, s.student_class,
                   a.date, a.time, a.status, a.method
            FROM attendance a
            JOIN students s ON a.student_id = s.id
            JOIN working_days w ON a.date = w.date
            WHERE w.status = 'working'
        '''
        params = []

    if department:
        query += ' AND s.department = ?'
        params.append(department)
    if year:
        query += ' AND s.year = ?'
        params.append(int(year))
    if student_class:
        query += ' AND s.student_class = ?'
        params.append(student_class)
    if search:
        query += ' AND (s.name LIKE ? OR s.register_number LIKE ?)'
        params.extend([f'%{search}%', f'%{search}%'])

    if status_filter:
        if date_filter:
             query += " AND COALESCE(a.status, 'absent') = ?"
        else:
             query += " AND a.status = ?"
        params.append(status_filter)

    if date_filter:
        query += ' ORDER BY CASE WHEN COALESCE(a.status, "absent") = "present" THEN 1 ELSE 2 END, s.name ASC'
    else:
        query += ' ORDER BY a.date DESC, a.time DESC'
        
    rows = conn.execute(query, params).fetchall()
    conn.close()
    return [dict(r) for r in rows]


def get_student_absences(student_id, month=None, year=None):
    """Get list of dates a student was marked absent (implicit and explicit)."""
    conn = get_db()
    
    # 1. Get all dates marked as working days (School Days)
    date_query = "SELECT date FROM working_days WHERE status = 'working'"
    date_params = []
    
    if month:
        m = month.zfill(2)
        if year:
            date_query += " AND date LIKE ?"
            date_params.append(f"{year}-{m}-%")
        else:
            date_query += " AND date LIKE ?"
            date_params.append(f"%-{m}-%")
    elif year:
        date_query += " AND date LIKE ?"
        date_params.append(f"{year}-%")
        
    date_query += " ORDER BY date DESC"
    school_dates = [r['date'] for r in conn.execute(date_query, date_params).fetchall()]
    
    # 2. Get dates where THIS student was marked present
    present_query = "SELECT date FROM attendance WHERE student_id = ? AND status = ?"
    present_rows = conn.execute(present_query, (student_id, 'present')).fetchall()
    present_dates = {r['date'] for r in present_rows}
    
    # 3. Absences = School dates where student was NOT present
    absent_dates = [d for d in school_dates if d not in present_dates]
    
    conn.close()
    
    return {
        'total_absent_days': len(absent_dates),
        'absent_dates': absent_dates
    }


def get_today_attendance():
    """Get today's attendance records."""
    return get_attendance(date_filter=date.today().isoformat())


def get_student_attendance_stats(student_id):
    """Calculate attendance percentage and total absent days based on 'working' days in working_days table."""
    conn = get_db()
    
    # Total Worked Days = Count of entries in working_days where status = 'working'
    total_days_row = conn.execute(
        "SELECT COUNT(*) as cnt FROM working_days WHERE status = 'working'"
    ).fetchone()
    total_worked_days = total_days_row['cnt'] if total_days_row else 0
    
    # Days THIS student was present on working days
    present_days_row = conn.execute(
        "SELECT COUNT(*) as cnt FROM attendance WHERE student_id = ? AND status = 'present' AND date IN (SELECT date FROM working_days WHERE status = 'working')",
        (student_id,)
    ).fetchone()
    present_days = present_days_row['cnt'] if present_days_row else 0
    
    conn.close()
    
    absent_days = total_worked_days - present_days
    percent = (present_days / total_worked_days * 100) if total_worked_days > 0 else 0
    
    return {
        'attendance_percentage': round(percent, 1),
        'total_present_days': present_days,
        'total_worked_days': total_worked_days,
        'total_absent_days': max(0, absent_days)
    }


# ─── Analytics Operations ───

def get_analytics_data():
    """Get comprehensive analytics data with dynamic worked days calculation."""
    conn = get_db()

    # Total students
    total_students = conn.execute('SELECT COUNT(*) as cnt FROM students').fetchone()['cnt']
    
    # Total Worked Days
    total_worked_days = conn.execute(
        "SELECT COUNT(*) FROM working_days WHERE status = 'working'"
    ).fetchone()[0]

    # Today's present count
    today = date.today().isoformat()
    today_present = conn.execute(
        "SELECT COUNT(*) as cnt FROM attendance a JOIN working_days w ON a.date = w.date WHERE a.date = ? AND a.status = 'present' AND w.status = 'working'",
        (today,)
    ).fetchone()['cnt']

    # Monthly attendance data (last 6 months)
    monthly = conn.execute('''
        SELECT strftime('%Y-%m', a.date) as month,
               COUNT(DISTINCT a.student_id) as present_count
        FROM attendance a
        JOIN working_days w ON a.date = w.date
        WHERE a.status = 'present' AND w.status = 'working'
        AND a.date >= date('now', '-6 months')
        GROUP BY month
        ORDER BY month
    ''').fetchall()

    # Student-wise attendance rate (Dynamic calculation)
    student_rates = conn.execute('''
        SELECT s.id, s.name, s.register_number, s.department, s.year,
               COUNT(CASE WHEN a.status = 'present' AND a.date IN (SELECT date FROM working_days WHERE status = 'working') THEN 1 END) as present_days,
               (SELECT COUNT(*) FROM working_days WHERE status = 'working') as total_days
        FROM students s
        LEFT JOIN attendance a ON s.id = a.student_id
        GROUP BY s.id
        ORDER BY s.name
    ''').fetchall()

    # Department-wise attendance
    dept_stats = conn.execute('''
        SELECT s.department,
               COUNT(DISTINCT s.id) as total_students,
               COUNT(CASE WHEN a.status = 'present' AND a.date IN (SELECT date FROM working_days WHERE status = 'working') THEN 1 END) as present_count,
               (SELECT COUNT(*) FROM working_days WHERE status = 'working') as total_days
        FROM students s
        LEFT JOIN attendance a ON s.id = a.student_id
        GROUP BY s.department
        ORDER BY s.department
    ''').fetchall()

    conn.close()

    return {
        'total_students': total_students,
        'total_worked_days': total_worked_days,
        'today_present': today_present,
        'monthly': [dict(r) for r in monthly],
        'student_rates': [dict(r) for r in student_rates],
        'department_stats': [dict(r) for r in dept_stats]
    }


def get_low_attendance(threshold=75):
    """Get students with attendance below threshold percentage."""
    conn = get_db()
    rows = conn.execute('''
        SELECT s.id, s.name, s.register_number, s.department, s.year,
               COUNT(CASE WHEN a.status = 'present' AND a.date IN (SELECT date FROM working_days WHERE status = 'working') THEN 1 END) as present_days,
               (SELECT COUNT(*) FROM working_days WHERE status = 'working') as total_days
        FROM students s
        LEFT JOIN attendance a ON s.id = a.student_id
        GROUP BY s.id
        HAVING total_days > 0
        AND (CAST(present_days AS FLOAT) / total_days * 100) < ?
        ORDER BY (CAST(present_days AS FLOAT) / total_days * 100) ASC
    ''', (threshold,)).fetchall()
    conn.close()
    return [dict(r) for r in rows]



def seed_sample_data():
    """Seed the database with sample data for demonstration."""
    import random

    departments = ['Computer Science', 'Electronics', 'Mechanical', 'Civil', 'Electrical']
    first_names = ['Aarav', 'Vivaan', 'Aditya', 'Vihaan', 'Arjun', 'Sai', 'Reyansh',
                   'Ananya', 'Diya', 'Isha', 'Kavya', 'Meera', 'Priya', 'Riya', 'Shreya',
                   'Neha', 'Pooja', 'Rahul', 'Amit', 'Deepak', 'Kiran', 'Lakshmi',
                   'Manish', 'Nithya', 'Rohit', 'Suresh', 'Tanvi', 'Uma', 'Varun', 'Zara']
    last_names = ['Sharma', 'Patel', 'Kumar', 'Singh', 'Reddy', 'Nair', 'Iyer',
                  'Gupta', 'Joshi', 'Rao', 'Verma', 'Mishra', 'Pandey', 'Bhat', 'Das']

    conn = get_db()
    existing = conn.execute('SELECT COUNT(*) as cnt FROM students').fetchone()['cnt']
    if existing > 0:
        conn.close()
        return

    students_data = []
    for i in range(30):
        name = f"{first_names[i]} {random.choice(last_names)}"
        reg = f"REG{2024000 + i + 1}"
        dept = random.choice(departments)
        year = random.randint(1, 4)
        s_class = random.choice(['A', 'B', 'C', 'D'])
        students_data.append((name, reg, dept, year, s_class))

    for s in students_data:
        conn.execute(
            'INSERT INTO students (name, register_number, department, year, student_class) VALUES (?, ?, ?, ?, ?)', s
        )

    conn.commit()

    # Generate attendance records for the last 30 days
    student_ids = [r['id'] for r in conn.execute('SELECT id FROM students').fetchall()]
    from datetime import timedelta
    base_date = date.today()

    for day_offset in range(30):
        d = (base_date - timedelta(days=day_offset)).isoformat()
        # Skip weekends
        dt = base_date - timedelta(days=day_offset)
        if dt.weekday() >= 5:
            continue

        for sid in student_ids:
            if random.random() < 0.82:
                t = f"{random.randint(8, 10):02d}:{random.randint(0, 59):02d}:00"
                conn.execute(
                    'INSERT INTO attendance (student_id, date, time, status, method) VALUES (?, ?, ?, ?, ?)',
                    (sid, d, t, 'present', 'auto')
                )

    conn.commit()
    conn.close()


if __name__ == '__main__':
    init_db()
    seed_sample_data()
    print("Database initialized and seeded with sample data.")
