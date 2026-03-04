"""
Live Face Scanner Module (Desktop Mode)
Opens webcam, detects faces, matches against stored encodings,
and sends attendance records to the Flask API.

Usage:
    python face_scanner.py                  # Scan all registered faces
    python face_scanner.py --student REG001 # Verify a specific student

Requirements:
    - opencv-python
    - face_recognition (requires dlib, cmake, C++ Build Tools)
    - numpy
    - A running Flask server (app.py) on localhost:5000
"""

import cv2
import numpy as np
import requests
import time
import sys
import os
import argparse

# Try importing face_recognition
try:
    import face_recognition
except ImportError:
    print("=" * 60)
    print("ERROR: 'face_recognition' library is not installed.")
    print()
    print("To install it, you need:")
    print("  1. CMake:  pip install cmake")
    print("  2. Visual Studio C++ Build Tools")
    print("  3. dlib:   pip install dlib")
    print("  4. Then:   pip install face_recognition")
    print("=" * 60)
    sys.exit(1)

# Add parent directory to path for database access
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import database

# ── Configuration ──────────────────────────────────────────────
API_BASE         = "http://localhost:5000/api"
TOLERANCE        = 0.48   # STRICT Threshold per user requirement
FRAME_SKIP       = 3      # Process every Nth frame (performance)
COOLDOWN_SECONDS = 30     # Minimum seconds between marking same student
CONFIDENCE_MIN   = 0.52   # Minimum similarity score (1 - distance)


class FaceScanner:
    def __init__(self, target_student_id=None):
        """
        Args:
            target_student_id: If given, verify only this student.
                               If None, recognize and mark all registered students.
        """
        self.known_encodings    = []
        self.known_metadata     = []
        self.last_marked        = {}   # student_id -> timestamp
        self.frame_count        = 0
        self.target_student_id  = target_student_id

    def load_known_faces(self):
        """Load face encodings from database (all or just target student)."""
        database.init_db()

        if self.target_student_id:
            # Load only the target student
            student = database.get_student(self.target_student_id)
            if not student:
                print(f"❌  No student found with ID {self.target_student_id}")
                sys.exit(1)

            enc = database.get_face_encoding_by_student(self.target_student_id)
            if enc is None:
                print(f"❌  Student '{student['name']}' has no registered face.")
                sys.exit(1)

            self.known_encodings = [enc]
            self.known_metadata  = [{
                'student_id':      self.target_student_id,
                'name':            student['name'],
                'register_number': student['register_number']
            }]
            print(f"📂  Loaded face for: {student['name']} ({student['register_number']})")
        else:
            # Load all registered faces
            print("📂  Loading all known face encodings...")
            data = database.get_all_face_encodings()
            self.known_encodings = [d['encoding'] for d in data]
            self.known_metadata  = [{
                'student_id':      d['student_id'],
                'name':            d['name'],
                'register_number': d['register_number']
            } for d in data]
            print(f"   Loaded {len(self.known_encodings)} face(s)")

    def mark_attendance_api(self, student_id, name):
        """Send attendance record to the Flask API with cooldown check."""
        now = time.time()
        last = self.last_marked.get(student_id, 0.0)
        if now - last < COOLDOWN_SECONDS:
            return False

        try:
            response = requests.post(
                f"{API_BASE}/attendance",
                json={'student_id': student_id, 'method': 'face_recognition'},
                timeout=5
            )
            if response.status_code in [200, 201]:
                self.last_marked[student_id] = now
                print(f"   ✅  Attendance marked: {name} (ID {student_id})")
                # Also log in verification_log
                database.log_verification_attempt(
                    student_id, name, 'success', 'Desktop scanner'
                )
                return True
            else:
                print(f"   ⚠️   API responded {response.status_code}: {response.text[:80]}")
                return False
        except requests.exceptions.ConnectionError:
            print("   ❌  Cannot connect to API. Is app.py running on port 5000?")
            return False

    def run(self):
        """Main scanning loop."""
        self.load_known_faces()

        if not self.known_encodings:
            print("\n⚠️   No face encodings found. Register students and capture faces first.")
            print("     The scanner will still display the webcam feed.\n")

        print("\n🎥  Starting webcam…")
        cap = cv2.VideoCapture(0)
        if not cap.isOpened():
            print("❌  Could not open webcam. Check camera connection.")
            sys.exit(1)

        mode_label = (
            f"Verifying: {self.known_metadata[0]['name']}"
            if self.target_student_id else
            f"Recognizing {len(self.known_encodings)} student(s)"
        )
        print(f"📸  Scanner active — {mode_label}")
        print("     Press  Q  to quit,  R  to reload faces\n")

        while True:
            ret, frame = cap.read()
            if not ret:
                print("❌  Failed to grab frame.")
                break

            self.frame_count += 1
            recognized_this_frame = {}

            if self.frame_count % FRAME_SKIP == 0 and self.known_encodings:
                small  = cv2.resize(frame, (0, 0), fx=0.25, fy=0.25)
                rgb_sm = cv2.cvtColor(small, cv2.COLOR_BGR2RGB)

                face_locs  = face_recognition.face_locations(rgb_sm)
                face_encs  = face_recognition.face_encodings(rgb_sm, face_locs)

                for (top, right, bottom, left), enc in zip(face_locs, face_encs):
                    # Scale back up
                    top, right, bottom, left = (
                        top * 4, right * 4, bottom * 4, left * 4
                    )

                    distances = face_recognition.face_distance(self.known_encodings, enc)
                    matches   = face_recognition.compare_faces(
                        self.known_encodings, enc, tolerance=TOLERANCE
                    )

                    label = "Unknown"
                    color = (0, 0, 220)  # Red = unknown

                    if True in matches:
                        best_idx    = int(np.argmin(distances))
                        confidence  = 1.0 - float(distances[best_idx])

                        if matches[best_idx] and confidence >= CONFIDENCE_MIN:
                            meta  = self.known_metadata[best_idx]
                            label = f"{meta['name']} ({confidence * 100:.0f}%)"
                            color = (0, 200, 80)   # Green = recognized
                            recognized_this_frame[meta['student_id']] = meta['name']
                            self.mark_attendance_api(meta['student_id'], meta['name'])

                    # Draw box and label
                    cv2.rectangle(frame, (left, top), (right, bottom), color, 2)
                    cv2.rectangle(frame, (left, bottom - 32), (right, bottom), color, cv2.FILLED)
                    cv2.putText(
                        frame, label, (left + 5, bottom - 8),
                        cv2.FONT_HERSHEY_DUPLEX, 0.55, (255, 255, 255), 1
                    )

            # Status bar
            status = (
                f"AttendAI Scanner  |  Known: {len(self.known_encodings)}  "
                f"|  Frame: {self.frame_count}  |  Q=Quit  R=Reload"
            )
            cv2.rectangle(frame, (0, 0), (frame.shape[1], 38), (20, 20, 30), cv2.FILLED)
            cv2.putText(frame, status, (8, 26),
                        cv2.FONT_HERSHEY_SIMPLEX, 0.55, (180, 180, 200), 1)

            cv2.imshow('AttendAI – Face Scanner', frame)

            key = cv2.waitKey(1) & 0xFF
            if key in (ord('q'), ord('Q')):
                break
            elif key in (ord('r'), ord('R')):
                self.load_known_faces()
                print("🔄  Reloaded known faces")

        cap.release()
        cv2.destroyAllWindows()
        print("\n👋  Scanner stopped.")


# ── Entry point ────────────────────────────────────────────────

if __name__ == '__main__':
    parser = argparse.ArgumentParser(description='AttendAI Face Scanner')
    parser.add_argument(
        '--student', metavar='STUDENT_ID', type=int, default=None,
        help='Verify a specific student by their database ID (optional)'
    )
    args = parser.parse_args()

    scanner = FaceScanner(target_student_id=args.student)
    scanner.run()
