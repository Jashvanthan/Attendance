# 🎓 AttendAI – Smart Attendance Monitoring System

A web-based automated attendance system using face recognition, real-time analytics, and a student registration portal.

---

## 🏗️ System Architecture

```
attendence/
├── backend/
│   ├── app.py              # Flask API server (all REST endpoints)
│   ├── database.py         # SQLite database layer
│   ├── face_scanner.py     # Desktop live-camera scanner (optional)
│   ├── requirements.txt    # Python dependencies
│   └── known_faces/        # Stored student face images
├── frontend/
│   ├── index.html          # Single-page application shell
│   ├── css/style.css       # Complete dark-mode UI stylesheet
│   └── js/
│       ├── app.js          # SPA router, API utilities, dashboard
│       ├── registration.js # Student registration & absence history
│       ├── attendance.js   # Attendance records & manual marking
│       ├── analytics.js    # Chart.js analytics page
│       └── verification.js # Dynamic ID verification module
├── attendance.db           # SQLite database (auto-created)
└── README.md
```

---

## 🚀 Quick Start

### 1. Install Python Dependencies
```bash
cd backend
pip install flask flask-cors pillow
```

### 2. Start the Server
```bash
cd backend
python app.py
```

### 3. Open the App
Navigate to **[http://localhost:5000](http://localhost:5000)** in your browser.

---

## 📋 Features

### Dashboard
- Live attendance stats (total students, present today, attendance rate, low attendance count)
- Today's attendance table
- Department distribution doughnut chart

### Registration
- Register new students (name, register number, department, year)
- Capture face via webcam or upload a photo
- View student list with search
- **View Absence History** per student: shows all absent dates with day name, filterable by month/year

### Attendance Records
- Full attendance history with date/time/method filters
- Toggle present/absent per record
- Manual attendance marking via modal

### Analytics
- Monthly attendance trend (line chart)
- Department attendance rate comparison (horizontal bar chart)
- Individual student attendance rates (bar chart, bottom 25 highlighted)
- Low attendance alert table (students below 75%)

### ID Verification (Dynamic)
- Enter student register number or select from dropdown
- Autocomplete search suggestions
- Shows student preview (name, dept, face registration status)
- Live webcam capture for face comparison
- **Verifies against that specific student's stored face only** (1-to-1 matching)
- Success dashboard: shows name, register number, confidence %, attendance marked
- Failure panel with error reason
- Full verification attempt log table

---

## 🔒 Face Verification Flow

```
User enters Register Number
         │
         ▼
   Fetch student from DB
         │
         ▼
   Check face encoding exists?
      ├── No  → Error: "No face registered"
      └── Yes ▼
         Capture webcam image
         │
         ▼
   Extract face encoding
      ├── No face detected  → Error
      ├── Multiple faces    → Error
      └── 1 face found ▼
         Compare vs stored encoding
         distance <= 0.5 threshold?
            ├── Yes → Mark attendance + Log success
            └── No  → Log failure + Show error
```

---

## 🛠️ API Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/students` | List all students |
| POST | `/api/students` | Register new student |
| GET | `/api/students/<id>` | Get student details |
| DELETE | `/api/students/<id>` | Delete student |
| POST | `/api/students/<id>/face` | Upload face encoding |
| GET | `/api/students/<id>/absences` | Get student absence history |
| GET | `/api/attendance` | List attendance records (filterable) |
| GET | `/api/attendance/today` | Today's attendance |
| POST | `/api/attendance/mark-manual` | Mark attendance manually |
| PUT | `/api/attendance/<id>` | Update attendance status |
| POST | `/api/scanner/verify` | **Dynamic face verification** |
| GET | `/api/scanner/logs` | Verification attempt logs |
| GET | `/api/scanner/status` | Face recognition library status |
| GET | `/api/analytics` | Full analytics data |
| GET | `/api/analytics/low-attendance` | Students below 75% threshold |
| GET | `/api/departments` | List all departments |

---

## 🤖 Face Recognition (Optional)

The system runs in **Simulation Mode** when `face_recognition` is not installed.
All features work; real biometric comparison is skipped.

To enable real face recognition:

```bash
pip install cmake
pip install dlib
pip install face_recognition
pip install opencv-python
```

> ⚠️ Requires Visual Studio C++ Build Tools on Windows.

### Desktop Scanner (Optional)
Run the live camera scanner independently:

```bash
# Scan all registered students
cd backend
python face_scanner.py

# Verify a specific student (ID = 3)
python face_scanner.py --student 3
```

---

## 🗄️ Database Schema

| Table | Purpose |
|-------|---------|
| `students` | Student records (name, register number, dept, year) |
| `face_embeddings` | Stored face encodings per student |
| `attendance` | Attendance records (date, time, status, method) |
| `verification_log` | Face verification attempt audit log |

---

## 📦 Tech Stack

- **Backend**: Python 3, Flask, SQLite
- **Frontend**: Vanilla HTML/CSS/JS (no framework), Chart.js
- **Face Recognition**: `face_recognition` library (optional, dlib-based)
- **Styling**: Custom dark-mode CSS with glassmorphism effects
