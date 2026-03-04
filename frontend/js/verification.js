/**
 * AttendAI – Dynamic ID Verification Module
 * Accepts a student ID / register number, captures webcam image,
 * compares against stored encoding, and displays result dashboard.
 */

let verificationStream = null;
let verificationCapturing = false;
let verificationStudents = [];

// ─── Page Loader ───────────────────────────────────────────────────────────────

async function loadVerificationPage() {
  renderVerificationUI();
  await loadStudentsForVerification();
  loadVerificationLogs();
}

// ─── UI Renderer ───────────────────────────────────────────────────────────────

function renderVerificationUI() {
  const page = document.getElementById('page-verification');
  if (!page) return;

  page.innerHTML = `
    <div class="verification-layout">

      <!-- ── Input Panel ── -->
      <div class="card verification-input-card">
        <div class="card-header">
          <h3>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none"
                 stroke="currentColor" stroke-width="2">
              <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/>
              <circle cx="12" cy="7" r="4"/>
            </svg>
            Student Identity Verification
          </h3>
        </div>
        <div class="card-body">

          <!-- Student lookup -->
          <div class="form-group">
            <label for="verify-reg-input">Register Number</label>
            <div style="display:flex; gap:0.5rem;">
              <input type="text" id="verify-reg-input" class="filter-input"
                     placeholder="e.g. REG2024001" autocomplete="off"
                     style="flex:1;" oninput="filterVerificationStudents(this.value)">
              <button class="btn btn-outline btn-sm" onclick="clearVerificationState()">Clear</button>
            </div>
            <ul id="verify-suggestions" class="verify-suggestions" style="display:none;"></ul>
          </div>

          <!-- Or pick from dropdown -->
          <div class="form-group">
            <label for="verify-student-select">Or Select Student</label>
            <select id="verify-student-select" class="filter-input"
                    onchange="onVerifyStudentSelect(this.value)">
              <option value="">-- Choose student --</option>
            </select>
          </div>

          <!-- Selected student preview -->
          <div id="verify-student-preview" class="verify-student-preview" style="display:none;">
            <div class="preview-avatar" id="verify-avatar">?</div>
            <div class="preview-info">
              <strong id="verify-student-name">—</strong>
              <span id="verify-student-meta">—</span>
            </div>
            <span class="badge badge-success" id="verify-face-badge" style="display:none;">✓ Face Registered</span>
            <span class="badge badge-danger"  id="verify-noface-badge" style="display:none;">✗ No Face</span>
          </div>

          <!-- Camera section -->
          <div class="verify-camera-section">
            <div class="camera-preview verify-cam-wrap">
              <video id="verify-video" autoplay playsinline></video>
              <canvas id="verify-canvas" style="display:none;"></canvas>
              <div class="cam-overlay" id="verify-cam-overlay">
                <svg width="80" height="80" viewBox="0 0 24 24" fill="none"
                     stroke="currentColor" stroke-width="1.5" opacity="0.4">
                  <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/>
                  <circle cx="12" cy="13" r="4"/>
                </svg>
                <p>Camera will start when you click Scan</p>
              </div>
            </div>

            <div class="verify-cam-controls">
              <button class="btn btn-primary" id="verify-btn-scan"
                      onclick="startVerificationCamera()">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none"
                     stroke="currentColor" stroke-width="2">
                  <circle cx="12" cy="13" r="4"/>
                  <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/>
                </svg>
                Start Camera
              </button>
              <button class="btn btn-success" id="verify-btn-capture"
                      onclick="captureAndVerify()" style="display:none;">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none"
                     stroke="currentColor" stroke-width="2">
                  <circle cx="12" cy="12" r="10"/><polyline points="12 8 12 12 14 14"/>
                </svg>
                Verify Now
              </button>
              <button class="btn btn-outline" id="verify-btn-stop"
                      onclick="stopVerificationCamera()" style="display:none;">Stop Camera</button>
            </div>
          </div>

          <div id="verify-status-msg" class="verify-status"></div>

        </div>
      </div>

      <!-- ── Result Panel ── -->
      <div id="verify-result-panel" class="verify-result-panel" style="display:none;">
      </div>

    </div>

    <!-- ── Verification Log Table ── -->
    <div class="card" style="margin-top:1.5rem;">
      <div class="card-header">
        <h3>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none"
               stroke="currentColor" stroke-width="2">
            <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
            <polyline points="14 2 14 8 20 8"/>
          </svg>
          Verification Log
        </h3>
        <div style="display:flex; gap:0.5rem; align-items:center;">
          <button class="btn btn-outline btn-sm" onclick="loadVerificationLogs()">Refresh</button>
          <button class="btn btn-sm" style="background:rgba(239,68,68,0.12); color:#f87171; border:1px solid rgba(239,68,68,0.3); display:flex; align-items:center; gap:0.3rem;" onclick="clearVerificationLogs()">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
            Clear Log
          </button>
        </div>
      </div>
      <div class="card-body" style="padding:0;">
        <div class="table-container">
          <table class="data-table">
            <thead>
              <tr>
                <th>#</th>
                <th>Register No.</th>
                <th>Student Name</th>
                <th>Result</th>
                <th>Reason</th>
                <th>Timestamp</th>
              </tr>
            </thead>
            <tbody id="verify-log-table-body">
              <tr><td colspan="6" class="empty-state">Loading logs...</td></tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>
    `;
}

// ─── Student Lookup ─────────────────────────────────────────────────────────────

async function loadStudentsForVerification() {
  try {
    const data = await apiGet('/students');
    verificationStudents = data.students || [];

    const select = document.getElementById('verify-student-select');
    if (!select) return;
    select.innerHTML = '<option value="">-- Choose student --</option>';
    verificationStudents.forEach(s => {
      const opt = document.createElement('option');
      opt.value = s.id;
      opt.textContent = `${s.name} (${s.register_number})`;
      select.appendChild(opt);
    });
  } catch (e) {
    // Will retry when needed
  }
}

function filterVerificationStudents(query) {
  const list = document.getElementById('verify-suggestions');
  if (!list) return;
  if (!query || query.length < 2) { list.style.display = 'none'; return; }

  const q = query.toLowerCase();
  const matches = verificationStudents.filter(s =>
    s.register_number.toLowerCase().includes(q) ||
    s.name.toLowerCase().includes(q)
  ).slice(0, 6);

  if (!matches.length) { list.style.display = 'none'; return; }
  list.innerHTML = matches.map(s => `
        <li onclick="selectVerifyStudent(${s.id}, '${s.register_number}',
                     '${s.name.replace(/'/g, "\\'")}')">
            <strong>${s.register_number}</strong> — ${s.name}
            <small style="color:var(--text-muted);">${s.department}, Year ${s.year}</small>
        </li>
    `).join('');
  list.style.display = 'block';
}

function onVerifyStudentSelect(studentId) {
  if (!studentId) return;
  const s = verificationStudents.find(x => x.id == studentId);
  if (s) selectVerifyStudent(s.id, s.register_number, s.name, s.department, s.year, s.face_registered);
}

function selectVerifyStudent(id, regNo, name, dept, year, faceRegistered) {
  // Fill the text input
  const inp = document.getElementById('verify-reg-input');
  if (inp) inp.value = regNo;
  const list = document.getElementById('verify-suggestions');
  if (list) list.style.display = 'none';

  // Update select
  const sel = document.getElementById('verify-student-select');
  if (sel) sel.value = id;

  // Show preview
  const preview = document.getElementById('verify-student-preview');
  if (preview) preview.style.display = 'flex';

  const s = verificationStudents.find(x => x.id == id) || {};
  document.getElementById('verify-avatar').textContent = (name || '?')[0].toUpperCase();
  document.getElementById('verify-student-name').textContent = name || '—';
  document.getElementById('verify-student-meta').textContent =
    `${dept || s.department || ''} · Year ${year || s.year || ''} · ${regNo}`;

  const hasFace = faceRegistered !== undefined ? faceRegistered : s.face_registered;
  document.getElementById('verify-face-badge').style.display = hasFace ? 'inline-flex' : 'none';
  document.getElementById('verify-noface-badge').style.display = !hasFace ? 'inline-flex' : 'none';

  // Store for capture
  window._verifyStudentId = id;
  window._verifyRegNo = regNo;

  setVerifyStatus('');
  hideResultPanel();
}

function setVerifyStatus(message, type = '') {
  const statusEl = document.getElementById('verify-status-msg');
  if (!statusEl) return;

  if (!message) {
    statusEl.style.display = 'none';
    statusEl.innerHTML = '';
    return;
  }

  statusEl.style.display = 'block';
  let color = 'var(--text-light)';
  if (type === 'error') color = 'var(--danger)';
  else if (type === 'success') color = 'var(--success)';
  else if (type === 'warning') color = 'var(--warning)';
  else if (type === 'info') color = 'var(--primary)';

  statusEl.innerHTML = `<span style="color: ${color};">${message}</span>`;
}

function hideResultPanel() {
  const panel = document.getElementById('verify-result-panel');
  if (panel) {
    panel.style.display = 'none';
    panel.innerHTML = '';
  }
}

function clearVerificationState() {
  const inp = document.getElementById('verify-reg-input');
  if (inp) inp.value = '';
  const sel = document.getElementById('verify-student-select');
  if (sel) sel.value = '';
  const preview = document.getElementById('verify-student-preview');
  if (preview) preview.style.display = 'none';
  const list = document.getElementById('verify-suggestions');
  if (list) list.style.display = 'none';
  window._verifyStudentId = null;
  window._verifyRegNo = null;
  if (typeof setVerifyStatus === 'function') setVerifyStatus('');
  if (typeof hideResultPanel === 'function') hideResultPanel();
  stopVerificationCamera();
}

// ─── Camera Controls ────────────────────────────────────────────────────────────


async function startVerificationCamera() {
  if (!window._verifyStudentId) {
    setVerifyStatus('⚠️ Please select a student first.', 'warning');
    return;
  }
  try {
    const video = document.getElementById('verify-video');
    verificationStream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: 'user', width: 640, height: 480 }
    });
    video.srcObject = verificationStream;

    document.getElementById('verify-cam-overlay').style.display = 'none';
    document.getElementById('verify-btn-scan').style.display = 'none';
    document.getElementById('verify-btn-capture').style.display = 'inline-flex';
    document.getElementById('verify-btn-stop').style.display = 'inline-flex';
    setVerifyStatus('📷 Camera active — look at the camera and click "Verify Now"', 'info');
  } catch (err) {
    setVerifyStatus('❌ Camera access denied. ' + err.message, 'error');
  }
}

function stopVerificationCamera() {
  if (verificationStream) {
    verificationStream.getTracks().forEach(t => t.stop());
    verificationStream = null;
  }
  const video = document.getElementById('verify-video');
  if (video) video.srcObject = null;

  const overlay = document.getElementById('verify-cam-overlay');
  if (overlay) overlay.style.display = 'flex';

  const btnScan = document.getElementById('verify-btn-scan');
  const btnCapture = document.getElementById('verify-btn-capture');
  const btnStop = document.getElementById('verify-btn-stop');
  if (btnScan) btnScan.style.display = 'inline-flex';
  if (btnCapture) btnCapture.style.display = 'none';
  if (btnStop) btnStop.style.display = 'none';
}

// ─── Capture & Verify ───────────────────────────────────────────────────────────

// ─── Capture & Verify ───────────────────────────────────────────

async function captureAndVerify() {
  if (verificationCapturing) return;
  if (!window._verifyStudentId && !document.getElementById('verify-reg-input').value) {
    setVerifyStatus('⚠️ Please select a student or enter a Register Number.', 'warning');
    return;
  }

  const video = document.getElementById('verify-video');
  const canvas = document.getElementById('verify-canvas');
  if (!video || !canvas) return;

  verificationCapturing = true;
  setVerifyStatus('🔍 Capturing and verifying...', 'info');

  try {
    canvas.width = video.videoWidth || 640;
    canvas.height = video.videoHeight || 480;
    canvas.getContext('2d').drawImage(video, 0, 0);
    const imageData = canvas.toDataURL('image/jpeg', 0.85);

    // Use fetch directly to gracefully handle 401/400 and preserve JSON payload (e.g. score)
    const res = await fetch('/api/scanner/verify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        image: imageData,
        student_id: window._verifyStudentId || null,
        register_number: document.getElementById('verify-reg-input').value
      })
    });

    const result = await res.json();
    stopVerificationCamera();

    if (res.ok && (result.status === 'SUCCESS' || result.status === 'VERIFIED')) {
      showVerificationSuccess(result);
      setVerifyStatus('✅ Verification successful!', 'success');
    } else {
      showVerificationFailure({
        status: result.status || 'FAILED',
        error: result.error || 'Verification failed',
        score: result.score,
        time: result.time
      });
    }

  } catch (err) {
    stopVerificationCamera();
    showVerificationFailure({
      status: 'ERROR',
      error: err.message || 'Verification failed'
    });
    setVerifyStatus('❌ ' + (err.message || 'Error'), 'error');
  } finally {
    verificationCapturing = false;
    loadVerificationLogs();
  }
}

// ─── Result Panels ──────────────────────────────────────────────────────────────

/**
 * Verification Dashboard: CASE 4 (Successful Match)
 */
function showVerificationSuccess(result) {
  const s = result.student;
  const panel = document.getElementById('verify-result-panel');
  if (!panel) return;

  panel.style.display = 'block';
  panel.className = 'verify-result-panel visible';

  panel.innerHTML = `
    <div class="card verification-success-card">
        <div class="result-header">
            <div class="status-icon success-icon">
                <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
                    <polyline points="20 6 9 17 4 12"></polyline>
                </svg>
            </div>
            <div>
                <h2 style="color:var(--success)">Status: VERIFIED</h2>
                <div style="display: flex; gap: 0.8rem; margin-top: 0.3rem;">
                    <span class="badge badge-success">Confidence: ${result.score}%</span>
                    <span class="badge badge-outline">Time: ${result.time || new Date().toLocaleTimeString()}</span>
                </div>
            </div>
        </div>

        <div class="verify-student-dashboard">
            <div class="student-profile-side">
                <div class="verify-profile-pic">
                    <img src="${s.profile_image || 'img/avatar.png'}" 
                         alt="Registered Profile Image" 
                         onerror="this.src='https://ui-avatars.com/api/?name=${encodeURIComponent(s.name)}&background=10b981&color=fff'">
                </div>
                <div class="attendance-ring">
                    <div class="ring-value">${s.attendance_percentage}%</div>
                    <div class="ring-label">Attendance Percentage</div>
                </div>
            </div>
            <div class="student-info-grid">
                <div class="info-item">
                    <label>Student Name</label>
                    <div class="value">${s.name}</div>
                </div>
                <div class="info-item">
                    <label>Student ID</label>
                    <div class="value">${s.register_number}</div>
                </div>
                <div class="info-item">
                    <label>Profile Status</label>
                    <div class="value" style="color:var(--success)">Active / Verified</span></div>
                </div>
                <div class="info-item">
                    <label>Total Absent Days</label>
                    <div class="value" style="color:var(--danger)">${s.total_absent_days}</div>
                </div>
            </div>
        </div>
        
        <div style="margin-top:1.5rem; text-align:center; padding:1rem; background:rgba(16,185,129,0.1); border-radius:12px; border:1px solid rgba(16,185,129,0.2);">
            <p style="color:var(--success); font-weight:600; margin:0; font-size:1.1rem;">
                Message: "Face verified successfully."
            </p>
            <button class="btn btn-primary" onclick="resetVerificationUI()" style="margin-top:1rem;">Verify Another</button>
        </div>
    </div>
  `;

  showToast('Verification Successful!', 'success');
}

/**
 * Verification Dashboard: CASE 2 (Face Mismatched) & CASE 3 (Not Registered)
 * Displays failure status and matching logic results (hiding details).
 */
/**
 * Verification Dashboard Failures: Case 1, 2, 3
 */
function showVerificationFailure(result) {
  const panel = document.getElementById('verify-result-panel');
  if (!panel) return;

  panel.style.display = 'block';
  panel.className = 'verify-result-panel visible';

  const isRetry = result.status === 'RETRY';
  const isFailed = result.status === 'FAILED' || result.status === 'ERROR';
  const errorMsg = result.error || 'Identity could not be confirmed';
  const scoreText = (result.score || result.score === 0) ? `<span class="badge ${isRetry ? 'badge-warning' : 'badge-danger'}">Confidence: ${result.score}%</span>` : '';
  const timeText = result.time ? `<span class="badge badge-outline">Time: ${result.time}</span>` : '';

  let color = isRetry ? 'var(--accent-warning, #f59e0b)' : 'var(--danger)';
  let headerText = isRetry ? 'Status: RETRY' : 'Status: FAILED';
  let iconHtml = isRetry ? `
    <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" style="color:#f59e0b">
        <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/>
    </svg>` : `
    <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
        <line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line>
    </svg>`;

  panel.innerHTML = `
    <div class="card verification-error-card" style="border-top: 4px solid ${color}">
        <div class="result-header">
            <div class="status-icon ${isRetry ? 'warning-icon' : 'error-icon'}" style="background: ${isRetry ? 'rgba(245, 158, 11, 0.1)' : ''}">
                ${iconHtml}
            </div>
            <div>
                <h2 style="color:${color}">${headerText}</h2>
                <div style="display: flex; gap: 0.8rem; margin-top: 0.3rem;">
                    ${scoreText}
                    ${timeText}
                </div>
            </div>
        </div>
        <div style="margin-top:1.5rem; padding:1.5rem; background: ${isRetry ? 'rgba(245,158,11,0.05)' : 'rgba(239,68,68,0.05)'}; border-radius:12px; border:1px solid ${isRetry ? 'rgba(245,158,11,0.2)' : 'rgba(239,68,68,0.2)'}; text-align:center;">
            <p style="color:var(--text-primary); font-size:1.15rem; line-height:1.6; margin-bottom: 1.5rem; font-weight: 600;">
                Message: "${errorMsg}"
            </p>
            <button class="btn ${isRetry ? 'btn-primary' : 'btn-outline'}" 
                    onclick="${isRetry ? 'retryVerificationScan()' : 'resetVerificationUI()'}">
                ${isRetry ? 'Click here to Try Again' : 'Try Again'}
            </button>
        </div>
    </div>
  `;

  showToast(errorMsg, isRetry ? 'info' : 'error');
}

function resetVerificationUI() {
  const panel = document.getElementById('verify-result-panel');
  if (panel) {
    panel.style.display = 'none';
    panel.innerHTML = '';
  }
  clearVerificationState();
}

/**
 * Automatically restarts scanner for 'RETRY' cases
 */
async function retryVerificationScan() {
  resetVerificationUI();

  // Set status and focus
  setVerifyStatus('🔄 Preparing for retry...', 'info');

  // Wait a moment for UI to clear
  setTimeout(() => {
    startVerificationCamera();
  }, 300);
}


/**
 * Verification Logs
 */
async function loadVerificationLogs() {
  const tbody = document.getElementById('verify-log-table-body');
  if (!tbody) return;
  try {
    const data = await apiGet('/scanner/logs?limit=30');
    const logs = data.logs || [];
    if (!logs.length) {
      tbody.innerHTML = '<tr><td colspan="6" class="empty-state">No verification attempts yet</td></tr>';
      return;
    }
    tbody.innerHTML = logs.map((log, i) => {
      const badgeClass = log.result === 'success' ? 'badge-success' : 'badge-danger';
      const ts = new Date(log.timestamp).toLocaleString('en-IN');
      return `
                <tr>
                    <td>${i + 1}</td>
                    <td>${log.attempted_register_number || '—'}</td>
                    <td>${log.name || '—'}</td>
                    <td><span class="badge ${badgeClass}">${log.result.toUpperCase()}</span></td>
                    <td style="font-size:0.8rem; color:var(--text-muted);">${log.reason || '—'}</td>
                    <td style="font-size:0.85rem;">${ts}</td>
                </tr>
            `;
    }).join('');
  } catch (err) {
    if (tbody) tbody.innerHTML = '<tr><td colspan="6" class="empty-state">Failed to load logs</td></tr>';
  }
}

async function clearVerificationLogs() {
  if (!confirm('Are you sure you want to clear all verification logs? This cannot be undone.')) return;

  try {
    const res = await fetch('/api/scanner/logs', { method: 'DELETE' });
    const json = await res.json();
    if (!res.ok) throw new Error(json.error || 'Failed to clear logs');
    showToast('Verification logs cleared successfully', 'success');
    loadVerificationLogs();
  } catch (err) {
    showToast(err.message || 'Failed to clear logs', 'error');
  }
}
