"""
Flask REST API for the Smart Attendance Monitoring System.
Serves both the API endpoints and the frontend static files.
"""

import base64
import os
import sys
if sys.stdout.encoding != 'utf-8':
    sys.stdout.reconfigure(encoding='utf-8')

from datetime import datetime, date
import time
from io import BytesIO

# Core Flask imports
from flask import Flask, jsonify, request, send_from_directory, render_template
from flask_cors import CORS

# Database utility
import database

# Optional imports with fallbacks
try:
    import numpy as np
    NUMPY_AVAILABLE = True
except ImportError:
    NUMPY_AVAILABLE = False

try:
    from deepface import DeepFace
    import cv2
    import numpy as np
    DEEPFACE_AVAILABLE = True
except ImportError:
    DEEPFACE_AVAILABLE = False
    print("[WARNING] deepface not installed. Face encoding from uploaded images will use mock data.")

try:
    from PIL import Image
    PIL_AVAILABLE = True
except ImportError:
    PIL_AVAILABLE = False


# Initialize Flask app
app = Flask(__name__,
            static_folder=os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), 'frontend'),
            static_url_path='')
CORS(app)

# Ensure known_faces directory exists
KNOWN_FACES_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'known_faces')
os.makedirs(KNOWN_FACES_DIR, exist_ok=True)


# ─── Serve Frontend ───

@app.route('/')
def serve_index():
    return send_from_directory(app.static_folder, 'index.html')


@app.route('/<path:path>')
def serve_static(path):
    file_path = os.path.join(app.static_folder, path)
    if os.path.exists(file_path):
        return send_from_directory(app.static_folder, path)
    return send_from_directory(app.static_folder, 'index.html')


@app.route('/known_faces/<path:filename>')
def serve_known_face(filename):
    """Serve registered face images."""
    return send_from_directory(KNOWN_FACES_DIR, filename)


# ─── Student Endpoints ───

@app.route('/api/students', methods=['POST'])
def create_student():
    data = request.json
    required = ['name', 'register_number', 'department', 'year']
    for field in required:
        if field not in data or not data[field]:
            return jsonify({'error': f'Missing required field: {field}'}), 400

    s_class = data.get('student_class', 'A')

    try:
        student_id = database.add_student(
            data['name'], data['register_number'], data['department'], data['year'], s_class
        )
        student = database.get_student(student_id)
        return jsonify({'message': 'Student registered successfully', 'student': student}), 201
    except ValueError as e:
        return jsonify({'error': str(e)}), 409


@app.route('/api/students', methods=['GET'])
def list_students():
    department = request.args.get('department')
    year = request.args.get('year')
    student_class = request.args.get('student_class')
    search = request.args.get('search')
    students = database.get_students(department=department, year=year, student_class=student_class, search=search)

    # Add face_registered flag
    for s in students:
        s['face_registered'] = database.has_face_encoding(s['id'])

    return jsonify({'students': students})


@app.route('/api/students/<int:student_id>', methods=['GET'])
def get_student(student_id):
    student = database.get_student(student_id)
    if not student:
        return jsonify({'error': 'Student not found'}), 404
    student['face_registered'] = database.has_face_encoding(student_id)
    return jsonify({'student': student})


@app.route('/api/students/<int:student_id>', methods=['PUT'])
def update_student(student_id):
    data = request.json
    required = ['name', 'register_number', 'department', 'year']
    for field in required:
        if field not in data or not data[field]:
            return jsonify({'error': f'Missing required field: {field}'}), 400

    s_class = data.get('student_class', 'A')

    student = database.get_student(student_id)
    if not student:
        return jsonify({'error': 'Student not found'}), 404

    try:
        database.update_student(student_id, data['name'], data['register_number'], data['department'], data['year'], s_class)
        updated_student = database.get_student(student_id)
        return jsonify({'message': 'Student updated successfully', 'student': updated_student}), 200
    except ValueError as e:
        return jsonify({'error': str(e)}), 409


@app.route('/api/students/<int:student_id>', methods=['DELETE'])
def delete_student(student_id):
    student = database.get_student(student_id)
    if not student:
        return jsonify({'error': 'Student not found'}), 404

    # Remove face image file if exists
    face_path = os.path.join(KNOWN_FACES_DIR, f'{student_id}.jpg')
    if os.path.exists(face_path):
        os.remove(face_path)

    database.delete_student(student_id)
    return jsonify({'message': 'Student deleted successfully'})


@app.route('/api/departments', methods=['GET'])
def list_departments():
    departments = database.get_departments()
    return jsonify({'departments': departments})

# ─── Admin Endpoints ───

@app.route('/api/admins', methods=['POST'])
def register_admin():
    data = request.json
    if not data or not data.get('admin_name') or not data.get('password') or not data.get('alt_password'):
        return jsonify({'error': 'Missing required fields'}), 400
    
    try:
        admin_id = database.add_admin(data['admin_name'], data['password'], data['alt_password'])
        return jsonify({'message': 'Admin registered successfully', 'admin_id': admin_id}), 201
    except ValueError as e:
        return jsonify({'error': str(e)}), 409

@app.route('/api/admins', methods=['GET'])
def list_admins():
    admins = database.get_admins()
    return jsonify({'admins': admins})

@app.route('/api/admins/login', methods=['POST'])
def login_admin():
    data = request.json
    admin_name = data.get('admin_name')
    password = data.get('password')
    
    admin = database.get_admin_by_name(admin_name)
    if admin and (admin['password'] == password or admin['alt_password'] == password):
        return jsonify({'message': 'Login successful', 'admin_name': admin['admin_name']}), 200
    return jsonify({'error': 'Invalid credentials'}), 401



@app.route('/api/students/<int:student_id>/absences', methods=['GET'])
def get_student_absences(student_id):
    student = database.get_student(student_id)
    if not student:
        return jsonify({'error': 'Student not found'}), 404
        
    month = request.args.get('month')
    year = request.args.get('year')
        
    absences = database.get_student_absences(
        student_id, month=month, year=year
    )
    return jsonify({'absences': absences})


@app.route('/api/students/<int:student_id>/stats', methods=['GET'])
def get_student_stats(student_id):
    student = database.get_student(student_id)
    if not student:
        return jsonify({'error': 'Student not found'}), 404
    stats = database.get_student_attendance_stats(student_id)
    return jsonify({'stats': stats})


# ─── Face Encoding Endpoints ───

@app.route('/api/students/<int:student_id>/face', methods=['POST'])
def save_student_face(student_id):
    """Process and save student face encoding. Supports multiple images."""
    data = request.json
    if 'image' not in data:
        return jsonify({'error': 'No image data provided'}), 400

    try:
        image_data = data['image']
        if ',' in image_data:
            image_data = image_data.split(',')[1]
        image_bytes = base64.b64decode(image_data)

        # Ensure directory exists
        os.makedirs(KNOWN_FACES_DIR, exist_ok=True)
        
        # Save raw image for historical tracking / display
        # First image is also saved as the main display image (no suffix)
        main_path = os.path.join(KNOWN_FACES_DIR, f'{student_id}.jpg')
        if not os.path.exists(main_path):
            with open(main_path, 'wb') as f:
                f.write(image_bytes)
        
        # Always save as a unique record too
        timestamp = int(time.time())
        unique_path = os.path.join(KNOWN_FACES_DIR, f'{student_id}_{timestamp}.jpg')
        with open(unique_path, 'wb') as f:
            f.write(image_bytes)

        if not DEEPFACE_AVAILABLE:
            # Simulation Mode Fallback
            database.save_face_encoding(student_id, [0.1] * 128)
            count = len(database.get_face_encodings_by_student(student_id))
            return jsonify({
                'message': 'Face saved successfully (Simulated)',
                'count': count,
                'is_mock': True
            }), 200

        # Real processing
        nparr = np.frombuffer(image_bytes, np.uint8)
        img = cv2.imdecode(nparr, cv2.IMREAD_COLOR)
        try:
            objs = DeepFace.represent(img_path=img, model_name="Facenet", enforce_detection=True)
        except ValueError:
            return jsonify({'error': 'No face detected. Please use a clear front-facing photo.'}), 400
        
        if not objs:
            return jsonify({'error': 'No face detected.'}), 400
        
        if len(objs) > 1:
            return jsonify({'error': 'Multiple faces detected. Please ensure only one person is in the photo.'}), 400
            
        database.save_face_encoding(student_id, objs[0]["embedding"])
        count = len(database.get_face_encodings_by_student(student_id))
        
        return jsonify({
            'message': f'Face image {count} extracted and stored.',
            'count': count
        }), 200
        
    except Exception as e:
        return jsonify({'error': f'Failed to process image: {str(e)}'}), 500


@app.route('/api/students/<int:student_id>/face', methods=['DELETE'])
def reset_student_face(student_id):
    """Delete all stored faces and encodings for a student."""
    try:
        # Delete from database
        database.delete_face_encodings(student_id)
        
        # Delete files from disk
        main_path = os.path.join(KNOWN_FACES_DIR, f'{student_id}.jpg')
        if os.path.exists(main_path):
            os.remove(main_path)
            
        import glob
        pattern = os.path.join(KNOWN_FACES_DIR, f'{student_id}_*.jpg')
        for f in glob.glob(pattern):
            os.remove(f)
            
        return jsonify({'message': 'Face data reset successfully'}), 200
    except Exception as e:
        return jsonify({'error': f'Failed to reset face data: {str(e)}'}), 500


@app.route('/api/scanner/verify', methods=['POST'])
def verify_face():
    """
    STRICT VERIFICATION LOGIC (DeepFace + Cosine Similarity)
    Case 1: No Face Detected -> FAILED
    Case 2: Similarity < 0.50 -> FAILED (Not Registered)
    Case 3: Similarity 0.50-0.65 -> RETRY (Mid-range)
    Case 4: Similarity > 0.65 -> VERIFIED (Success)
    """
    data = request.json or {}
    
    # Thresholds
    UPPER_THRESHOLD = 0.65    # Verified
    LOWER_THRESHOLD = 0.50    # Not Registered

    if 'image' not in data:
        return jsonify({'status': 'ERROR', 'error': 'No image data provided'}), 400

    # 1. IDENTIFICATION
    student_id = data.get('student_id')
    reg_no = data.get('register_number', '').strip()

    if not student_id and not reg_no:
        return jsonify({'status': 'ERROR', 'error': 'Student identity (Register Number) is required.'}), 400

    # Resolve student
    actual_student_id = student_id
    if not actual_student_id:
        students = database.get_students(search=reg_no)
        exact = [s for s in students if s['register_number'] == reg_no]
        if not exact:
            # CASE 2: Not Registered
            return jsonify({
                'status': 'FAILED',
                'error': 'Verification Failed – Not Registered',
                'message': 'Student ID not found. Please register first.'
            }), 404
        actual_student_id = exact[0]['id']

    student = database.get_student(actual_student_id)
    if not student:
        return jsonify({
            'status': 'FAILED',
            'error': 'Verification Failed – Not Registered',
            'message': 'Student ID not found.'
        }), 404
    
    actual_reg_no = student['register_number']

    # SECURITY CHECK: Rate Limiting
    failed_attempts = database.count_recent_failed_attempts(actual_student_id, minutes=10)
    if failed_attempts >= 3:
        return jsonify({
            'status': 'ERROR',
            'error': 'Too many failed attempts. Verification blocked for 10 minutes.'
        }), 429

    # FETCH ALL ENCODINGS (Multi-image enrollment)
    stored_encodings = database.get_face_encodings_by_student(actual_student_id)
    if not stored_encodings:
        return jsonify({
            'status': 'ERROR',
            'error': 'No face registered for this student. Please register first.'
        }), 404

    try:
        image_data = data['image']
        if ',' in image_data:
            image_data = image_data.split(',')[1]
        image_bytes = base64.b64decode(image_data)

        # 2. FACE DETECTION VALIDATION
        if not DEEPFACE_AVAILABLE:
            # --- Simulation Mode Logic ---
            mock_best_score = 0.85 if len(image_data) % 2 == 0 else 0.40
            if len(image_data) % 7 == 0: mock_best_score = 0.55 # Mock retry
            best_score = mock_best_score
            enc_count = 1
        else:
            # --- Real Logic ---
            nparr = np.frombuffer(image_bytes, np.uint8)
            img = cv2.imdecode(nparr, cv2.IMREAD_COLOR)
            try:
                objs = DeepFace.represent(img_path=img, model_name="Facenet", enforce_detection=True)
                live_embedding = objs[0]["embedding"]
                enc_count = len(objs)
            except ValueError:
                enc_count = 0

        # CASE 1: No Face Detected
        if enc_count == 0:
            return jsonify({
                'status': 'FAILED',
                'error': 'Verification Failed – No Face Detected'
            }), 400

        if enc_count > 1:
            return jsonify({
                'status': 'ERROR',
                'error': 'Multiple faces detected. Only one face is allowed.'
            }), 400

        # 3. FACE ENCODING COMPARISON
        if DEEPFACE_AVAILABLE:
            def cosine_similarity(a, b):
                return np.dot(a, b) / (np.linalg.norm(a) * np.linalg.norm(b))

            best_score = -1.0
            for e in stored_encodings:
                score = cosine_similarity(live_embedding, e)
                if score > best_score:
                    best_score = float(score)

        final_percent = round(best_score * 100, 1)
        timestamp = datetime.now().strftime("%H:%M:%S")

        # 4. 3-TIER DECISION RULE (Cosine Similarity)
        if best_score > UPPER_THRESHOLD:
            # ✅ CASE 4: Successful Match (Verified)
            database.record_attendance(actual_student_id, method='face_recognition' if DEEPFACE_AVAILABLE else 'simulated')
            database.log_verification_attempt(actual_student_id, actual_reg_no, 'success', f'VERIFIED! Score: {final_percent}%')
            
            stats = database.get_student_attendance_stats(actual_student_id)
            face_url = f'/known_faces/{actual_student_id}.jpg'
            
            return jsonify({
                'status': 'VERIFIED',
                'score': final_percent,
                'time': timestamp,
                'student': {
                    'name': student['name'],
                    'register_number': student['register_number'],
                    'department': student['department'],
                    'attendance_percentage': stats['attendance_percentage'],
                    'total_absent_days': stats['total_absent_days'],
                    'profile_image': face_url if os.path.exists(os.path.join(KNOWN_FACES_DIR, f'{actual_student_id}.jpg')) else None
                }
            }), 200

        elif best_score > LOWER_THRESHOLD:
            # ⚠️ CASE 3: Mid-range Match (Retry)
            database.log_verification_attempt(actual_student_id, actual_reg_no, 'failed', f'RETRY. Score: {final_percent}%')
            return jsonify({
                'status': 'RETRY',
                'error': 'Face Not Matched – Try Again',
                'score': final_percent
            }), 401
        
        else:
            # ❌ CASE 2: Hard Mismatch (Not Registered)
            database.log_verification_attempt(actual_student_id, actual_reg_no, 'failed', f'NOT REGISTERED. Score: {final_percent}%')
            return jsonify({
                'status': 'FAILED',
                'error': 'Verification Failed – Not Registered',
                'score': final_percent
            }), 401

    except Exception as e:
        database.log_verification_attempt(student_id if 'student_id' in locals() else None, reg_no, 'error', str(e))
        return jsonify({'status': 'ERROR', 'error': f'System Error: {str(e)}'}), 500


@app.route('/api/scanner/logs', methods=['GET'])
def get_verification_logs():
    """Retrieve recent face verification attempt logs."""
    limit = request.args.get('limit', 50, type=int)
    logs = database.get_verification_logs(limit=limit)
    return jsonify({'logs': logs})


@app.route('/api/scanner/logs', methods=['DELETE'])
def clear_verification_logs():
    """Clear all verification logs."""
    try:
        database.clear_verification_logs()
        return jsonify({'message': 'Verification logs cleared successfully'}), 200
    except Exception as e:
        return jsonify({'error': str(e)}), 500




# ─── Attendance Endpoints ───

@app.route('/api/attendance', methods=['POST'])
def mark_attendance():
    data = request.json
    if 'student_id' not in data:
        return jsonify({'error': 'Missing student_id'}), 400

    # ─── WORKING DAY CHECK ───
    today_str = date.today().isoformat()
    work_status = database.is_working_day(today_str)
    if work_status is False or work_status is None:
        return jsonify({'error': 'This is not a Worked Date. Attendance cannot be marked.'}), 403

    method = data.get('method', 'auto')
    att_id = database.record_attendance(data['student_id'], method=method)
    return jsonify({'message': 'Attendance marked', 'attendance_id': att_id}), 201


@app.route('/api/attendance', methods=['GET'])
def list_attendance():
    date_filter = request.args.get('date')
    
    # ─── DATE VALIDATION ───
    if date_filter:
        try:
            if date.fromisoformat(date_filter) > date.today():
                return jsonify({'error': 'Future date access not allowed'}), 400
        except ValueError:
            pass
            
        # Check if it's a holiday
        work_status = database.is_working_day(date_filter)
        if work_status is False or work_status is None:
            # For APIs we can just return empty attendance with an error property or just empty list
            # We return 200 so frontend doesn't throw a generic "failed to load" exception
            return jsonify({'attendance': [], 'error': 'Selected date is not a Worked Date. No attendance available.', 'is_holiday': True})
            
    department = request.args.get('department')
    year = request.args.get('year')
    search = request.args.get('search')
    status = request.args.get('status')
    student_class = request.args.get('student_class')
    
    records = database.get_attendance(
        date_filter=date_filter, department=department, year=year, search=search, status_filter=status, student_class=student_class
    )
    return jsonify({'attendance': records})


@app.route('/api/attendance/today', methods=['GET'])
def today_attendance():
    work_status = database.is_working_day(date.today().isoformat())
    if work_status is False or work_status is None:
        records = []
        is_working_day = False
    else:
        records = database.get_today_attendance()
        is_working_day = True
        
    total_students = len(database.get_students())
    return jsonify({
        'attendance': records,
        'total_students': total_students,
        'present_count': len([r for r in records if r['status'] == 'present']),
        'date': date.today().isoformat(),
        'is_working_day': is_working_day
    })


@app.route('/api/attendance/<int:attendance_id>', methods=['PUT'])
def update_attendance(attendance_id):
    data = request.json
    if 'status' not in data:
        return jsonify({'error': 'Missing status field'}), 400

    if data['status'] not in ['present', 'absent']:
        return jsonify({'error': 'Status must be "present" or "absent"'}), 400

    database.update_attendance(attendance_id, data['status'])
    return jsonify({'message': 'Attendance updated'})


@app.route('/api/attendance/mark-manual', methods=['POST'])
def mark_manual_attendance():
    """Mark attendance manually for a student by register number or ID."""
    data = request.json
    student_id = data.get('student_id')
    custom_date = data.get('date')
    
    # ─── DATE VALIDATION ───
    if custom_date:
        try:
            if date.fromisoformat(custom_date) > date.today():
                return jsonify({'error': 'Future date access not allowed'}), 400
        except ValueError:
            return jsonify({'error': 'Invalid date format'}), 400
            
    status = data.get('status', 'present')

    if not student_id:
        return jsonify({'error': 'Missing student_id'}), 400

    student = database.get_student(student_id)
    if not student:
        return jsonify({'error': 'Student not found'}), 404

    # ─── WORKING DAY CHECK ───
    target_date = custom_date if custom_date else date.today().isoformat()
    work_status = database.is_working_day(target_date)
    if work_status is False or work_status is None:
        return jsonify({'error': 'This is not a Worked Date. Attendance cannot be marked.'}), 403

    att_id = database.record_attendance(student_id, method='manual', custom_date=custom_date, status=status)
    return jsonify({'message': f'Attendance marked manually for {student["name"]}', 'attendance_id': att_id}), 201


# ─── Working Days Endpoints ───

@app.route('/api/working-days', methods=['GET'])
def list_working_days():
    month = request.args.get('month')
    year = request.args.get('year')
    days = database.get_working_days(month=month, year=year)
    return jsonify({'working_days': days})


@app.route('/api/working-days', methods=['POST'])
def add_working_day():
    data = request.json
    if not data or 'date' not in data or 'status' not in data:
        return jsonify({'error': 'Missing date or status'}), 400
    
    # ─── FUTURE DATE CHECK ───
    if date.fromisoformat(data['date']) > date.today():
        return jsonify({'error': 'Future dates cannot be marked.'}), 400

    try:
        database.add_working_day(data['date'], data['status'])
        return jsonify({'message': 'Day record added'}), 201
    except ValueError as e:
        return jsonify({'error': str(e)}), 400


@app.route('/api/working-days/<date_str>', methods=['PUT'])
def update_working_day(date_str):
    data = request.json
    if not data or 'status' not in data:
        return jsonify({'error': 'Missing status'}), 400
    
    database.update_working_day(date_str, data['status'])
    return jsonify({'message': 'Day record updated'})


@app.route('/api/working-days/<date_str>', methods=['DELETE'])
def delete_working_day(date_str):
    database.delete_working_day(date_str)
    return jsonify({'message': 'Day record deleted'})


# ─── Analytics Endpoints ───

@app.route('/api/analytics', methods=['GET'])
def get_analytics():
    data = database.get_analytics_data()
    return jsonify(data)


@app.route('/api/analytics/low-attendance', methods=['GET'])
def low_attendance():
    threshold = request.args.get('threshold', 75, type=float)
    students = database.get_low_attendance(threshold=threshold)
    return jsonify({'students': students, 'threshold': threshold})


# ─── Scanner Status ───

@app.route('/api/scanner/status', methods=['GET'])
def scanner_status():
    return jsonify({
        'face_recognition_available': DEEPFACE_AVAILABLE,
        'message': 'Face recognition is available' if DEEPFACE_AVAILABLE
                   else 'deepface library not installed. Install it for full functionality.'
    })


# ─── Initialize and Run ───

# ─── Secure AI Assistant Option ───

import spacy
from datetime import date
try:
    nlp = spacy.load("en_core_web_sm")
except:
    nlp = None

def get_student_db_match(person_name, reg_number):
    try:
        conn = database.get_db()
        student = None
        if person_name:
            student = conn.execute("SELECT * FROM students WHERE LOWER(name) LIKE ?", ('%' + person_name.lower() + '%',)).fetchone()
        elif reg_number:
            student = conn.execute("SELECT * FROM students WHERE register_number = ?", (reg_number,)).fetchone()
        
        if student:
            # We strictly convert SQLite Row to a standard Python dictionary so it's fully readable
            result = dict(student)
            conn.close()
            return result
            
        conn.close()
        return None
    except Exception as e:
        print("Database error in AI Assistant:", e)
        return None

@app.route('/assistant')
def assistant():
    return render_template("assistant.html")

@app.route('/ask', methods=['POST'])
def ask():
    question_raw = request.form.get('question', '')
    
    if not nlp:
        return render_template("assistant.html", response="NLP Engine Error. SpaCy model not loaded.")
        
    doc = nlp(question_raw)

    reg_number = None
    person_name = None

    # Step 1: Precise Entity & Number Extraction
    for ent in doc.ents:
        if ent.label_ == "PERSON":
            person_name = ent.text

    for token in doc:
        # Register Numbers must have at least one digit in them, don't accidentally grab the english word "reg"
        if any(char.isdigit() for char in token.text):
            reg_number = token.text

    # Fallback to searching Proper Nouns if standard Entity detection failed
    if not person_name:
        propns = [token.text for token in doc if token.pos_ == "PROPN" or (token.text.istitle() and token.text.lower() not in ["get", "show", "the", "detail", "summary", "record", "reg", "register", "number", "absent", "present", "last", "of", "for", "student"])]
        if propns:
            person_name = " ".join(propns)
            
    if not person_name and not reg_number:
         return render_template("assistant.html", response="NLP Parsing Failed: Please provide a clear student name or Register Number.")
    
    # Pre-fetch Database student
    student = get_student_db_match(person_name, reg_number)
    
    if not student:
        error_ident = person_name if person_name else reg_number
        return render_template("assistant.html", response=f"Record Not Found for extracted entity: '{error_ident}'.")

    # Connect to DB for further sub-queries
    conn = database.get_db()
    q = question_raw.lower()

    # ─────────────────────────────────────────────────────────
    # INTENT: Attendance Percentage
    # e.g. "what is Arjun's attendance percentage"
    # ─────────────────────────────────────────────────────────
    if any(kw in q for kw in ["percentage", "percent", "attendance rate", "attendance %", "how many percent"]):
        student_id = student["id"]
        total_worked = conn.execute(
            "SELECT COUNT(*) FROM working_days WHERE status = 'working'"
        ).fetchone()[0]
        present_days = conn.execute(
            "SELECT COUNT(*) FROM attendance WHERE student_id=? AND status='present' "
            "AND date IN (SELECT date FROM working_days WHERE status = 'working')",
            (student_id,)
        ).fetchone()[0]
        conn.close()

        percentage = round((present_days / total_worked) * 100, 1) if total_worked > 0 else 0.0
        status_emoji = "✅" if percentage >= 75 else "⚠️"
        response = (
            f"{status_emoji} Attendance Percentage for {student['name']}:\n\n"
            f"📊 Attendance : {percentage}%\n"
            f"📅 Present Days : {present_days} / {total_worked} working days\n"
            f"{'✅ Attendance is Good.' if percentage >= 75 else '⚠️ Attendance is LOW (below 75%).'}"
        )
        return render_template("assistant.html", response=response)

    # ─────────────────────────────────────────────────────────
    # INTENT: Student Class / Section
    # e.g. "what class is Arjun in", "show section of Priya"
    # ─────────────────────────────────────────────────────────
    elif any(kw in q for kw in ["class", "section", "which class", "which section", "batch"]):
        conn.close()
        s_class = student.get("student_class", "N/A")
        dept = student.get("department", "N/A")
        year_names = {1: "1st Year", 2: "2nd Year", 3: "3rd Year", 4: "4th Year"}
        year_str = year_names.get(student.get("year"), str(student.get("year", "")))
        response = (
            f"🏫 Class Details for {student['name']}:\n\n"
            f"📚 Class / Section : {s_class}\n"
            f"🏛️  Department      : {dept}\n"
            f"📅 Year             : {year_str}"
        )
        return render_template("assistant.html", response=response)

    # ─────────────────────────────────────────────────────────
    # INTENT: How Many Days Present (Count)
    # e.g. "how many days Arjun present", "total present count"
    # ─────────────────────────────────────────────────────────
    elif ("how many" in q or "total" in q or "count" in q) and "present" in q and "absent" not in q:
        student_id = student["id"]
        total_worked = conn.execute(
            "SELECT COUNT(*) FROM working_days WHERE status = 'working'"
        ).fetchone()[0]
        present_days = conn.execute(
            "SELECT COUNT(*) FROM attendance WHERE student_id=? AND status='present' "
            "AND date IN (SELECT date FROM working_days WHERE status = 'working')",
            (student_id,)
        ).fetchone()[0]

        # Also get the last 5 present dates
        recent = conn.execute(
            "SELECT date FROM attendance WHERE student_id=? AND status='present' "
            "ORDER BY date DESC LIMIT 5",
            (student_id,)
        ).fetchall()
        conn.close()

        recent_dates = ", ".join([r["date"] for r in recent]) if recent else "None"
        response = (
            f"✅ Present Record for {student['name']}:\n\n"
            f"📅 Total Present Days : {present_days} out of {total_worked} working days\n"
            f"🕒 Recent Present Dates : {recent_dates}"
        )
        return render_template("assistant.html", response=response)

    # ─────────────────────────────────────────────────────────
    # INTENT: How Many Days Absent (Count + Dates)
    # e.g. "how many times Arjun absent", "total absent days"
    # ─────────────────────────────────────────────────────────
    elif ("how many" in q or "total" in q or "count" in q or "dates" in q) and "absent" in q:
        conn.close()
        absences_data = database.get_student_absences(student["id"])
        absent_dates = absences_data.get('absent_dates', [])
        total_absent = len(absent_dates)

        if absent_dates:
            dates_str = "\n  → " + "\n  → ".join(absent_dates)
            response = (
                f"❌ Absent Record for {student['name']}:\n\n"
                f"📅 Total Absent Days : {total_absent}\n"
                f"📋 Absent Dates :{dates_str}"
            )
        else:
            response = f"✅ {student['name']} has NO recorded absent days!"
        return render_template("assistant.html", response=response)

    # ─────────────────────────────────────────────────────────
    # INTENT: Is Student Present Today
    # e.g. "is Arjun present today"
    # ─────────────────────────────────────────────────────────
    elif "present" in q and "last" not in q:
        today = date.today().isoformat()
        attendance = conn.execute(
            "SELECT status, time FROM attendance WHERE student_id=? AND date=?",
            (student["id"], today)
        ).fetchone()
        conn.close()

        if attendance and attendance['status'] == 'present':
            response = f"✅ {student['name']} is PRESENT today.\n🕒 Time Marked: {attendance['time']}"
        else:
            response = f"❌ {student['name']} is NOT PRESENT today."
        return render_template("assistant.html", response=response)

    # ─────────────────────────────────────────────────────────
    # INTENT: Get Register Number
    # ─────────────────────────────────────────────────────────
    elif "reg" in q or "register" in q:
        conn.close()
        response = f"🆔 {student['name']}'s Register Number is {student['register_number']}."
        return render_template("assistant.html", response=response)

    # ─────────────────────────────────────────────────────────
    # INTENT: Absent Dates (without count keyword)
    # e.g. "show absent dates of Arjun"
    # ─────────────────────────────────────────────────────────
    elif "absent" in q:
        conn.close()
        absences_data = database.get_student_absences(student["id"])
        dates = absences_data.get('absent_dates', [])

        if dates:
            dates_str = ", ".join(dates)
            response = (
                f"📅 Absent Dates for {student['name']} "
                f"(Total: {len(dates)}):\n{dates_str}"
            )
        else:
            response = f"✅ No absent records found for {student['name']}."
        return render_template("assistant.html", response=response)

    # ─────────────────────────────────────────────────────────
    # INTENT: Last Present Date
    # ─────────────────────────────────────────────────────────
    elif "last" in q and "present" in q:
        record = conn.execute(
            "SELECT date, time FROM attendance WHERE student_id=? AND status='present' "
            "ORDER BY date DESC LIMIT 1",
            (student["id"],)
        ).fetchone()
        conn.close()

        if record:
            response = f"🕒 Last Present Date for {student['name']}:\n{record['date']} at {record['time']}"
        else:
            response = f"❌ No present record found for {student['name']}."
        return render_template("assistant.html", response=response)

    # ─────────────────────────────────────────────────────────
    # INTENT: Full Summary / Details
    # ─────────────────────────────────────────────────────────
    elif any(kw in q for kw in ["summary", "detail", "all", "record", "info", "profile"]):
        student_id = student["id"]
        total_worked = conn.execute(
            "SELECT COUNT(*) FROM working_days WHERE status = 'working'"
        ).fetchone()[0]
        present_days = conn.execute(
            "SELECT COUNT(*) FROM attendance WHERE student_id=? AND status='present' "
            "AND date IN (SELECT date FROM working_days WHERE status = 'working')",
            (student_id,)
        ).fetchone()[0]

        percentage = round((present_days / total_worked) * 100, 1) if total_worked > 0 else 0.0
        absences_data = database.get_student_absences(student_id)
        absent_dates = absences_data.get('absent_dates', [])
        last_present = conn.execute(
            "SELECT date FROM attendance WHERE student_id=? AND status='present' ORDER BY date DESC LIMIT 1",
            (student_id,)
        ).fetchone()
        conn.close()

        year_names = {1: "1st Year", 2: "2nd Year", 3: "3rd Year", 4: "4th Year"}
        year_str = year_names.get(student.get("year"), str(student.get("year", "")))
        absent_text = ", ".join(absent_dates) if absent_dates else "None"
        last_present_str = last_present["date"] if last_present else "No record"
        s_class = student.get("student_class", "N/A")

        response_text = f"""----- STUDENT PROFILE -----

👤 Name              : {student['name']}
🆔 Register ID       : {student['register_number']}
🏛️  Department       : {student['department']}
🏫 Class / Section  : {s_class}
📅 Year              : {year_str}

📊 Attendance %      : {percentage}%
✅ Present Days      : {present_days} / {total_worked}
❌ Absent Days       : {len(absent_dates)}
🕒 Last Present      : {last_present_str}
📋 Absent Dates      : {absent_text}"""

        return render_template("assistant.html", response=response_text)

    # ─────────────────────────────────────────────────────────
    # FALLBACK
    # ─────────────────────────────────────────────────────────
    else:
        conn.close()
        response = (
            f"Found {student['name']}, but I didn't understand the request.\n\n"
            f"Try asking:\n"
            f"  • What is {student['name']}'s attendance percentage?\n"
            f"  • What class is {student['name']} in?\n"
            f"  • How many days is {student['name']} absent?\n"
            f"  • How many days is {student['name']} present?\n"
            f"  • Is {student['name']} present today?\n"
            f"  • Show absent dates of {student['name']}\n"
            f"  • Get last present date of {student['name']}\n"
            f"  • Show summary of {student['name']}"
        )
        return render_template("assistant.html", response=response)





if __name__ == '__main__':
    database.init_db()
    database.seed_sample_data()
    print("\n[INFO] Smart Attendance Monitoring System")
    print("-" * 40)
    print(f"[Link] Dashboard:  http://localhost:5000")
    print(f"[Link] API:        http://localhost:5000/api")
    print(f"[Status] Face Rec: {'[OK] Available' if DEEPFACE_AVAILABLE else '[WARN] Not installed'}")
    print("-" * 40)
    print()
    app.run(debug=False, host='0.0.0.0', port=5000)
