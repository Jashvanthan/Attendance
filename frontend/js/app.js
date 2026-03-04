/**
 * AttendAI – Core Application Module
 * SPA router, API utilities, and shared functionality
 */

const API_BASE = '/api';

// ─── SPA Router ───

const pages = ['dashboard', 'registration', 'attendance', 'analytics', 'verification', 'admin'];
let currentPage = 'dashboard';

function navigateTo(page) {
    if (!pages.includes(page)) return;

    // Update nav items
    document.querySelectorAll('.nav-item').forEach(item => {
        item.classList.toggle('active', item.dataset.page === page);
    });

    // Show/hide pages
    document.querySelectorAll('.page').forEach(p => {
        p.classList.remove('active');
    });
    const pageEl = document.getElementById(`page-${page}`);
    if (pageEl) pageEl.classList.add('active');

    // Update title
    const titles = {
        dashboard: 'Dashboard',
        registration: 'Student Registration',
        attendance: 'Attendance Records',
        analytics: 'Attendance Analytics',
        verification: 'ID Verification',
        admin: 'Admin Management'
    };
    document.getElementById('page-title').textContent = titles[page] || page;

    currentPage = page;

    // Auto-close sidebar on mobile after navigation
    const sidebar = document.querySelector('.sidebar');
    if (sidebar && sidebar.classList.contains('open')) {
        sidebar.classList.remove('open');
    }

    // Trigger page-specific loader
    if (page === 'dashboard') loadDashboard();
    else if (page === 'registration') loadRegistrationPage();
    else if (page === 'attendance') loadAttendancePage();
    else if (page === 'analytics') loadAnalyticsPage();
    else if (page === 'verification') loadVerificationPage();
    else if (page === 'admin') {
        if (typeof loadAdminsList === 'function') loadAdminsList();
    }
}

// ─── API Utilities ───

async function apiGet(endpoint) {
    try {
        const res = await fetch(`${API_BASE}${endpoint}`);
        if (!res.ok) {
            const err = await res.json().catch(() => ({}));
            throw new Error(err.error || `HTTP ${res.status}`);
        }
        return await res.json();
    } catch (e) {
        console.error(`API GET ${endpoint}:`, e);
        throw e;
    }
}

async function apiPost(endpoint, data) {
    try {
        const res = await fetch(`${API_BASE}${endpoint}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(data)
        });
        const json = await res.json();
        if (!res.ok) throw new Error(json.error || `HTTP ${res.status}`);
        return json;
    } catch (e) {
        console.error(`API POST ${endpoint}:`, e);
        throw e;
    }
}

async function apiPut(endpoint, data) {
    try {
        const res = await fetch(`${API_BASE}${endpoint}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(data)
        });
        const json = await res.json();
        if (!res.ok) throw new Error(json.error || `HTTP ${res.status}`);
        return json;
    } catch (e) {
        console.error(`API PUT ${endpoint}:`, e);
        throw e;
    }
}

async function apiDelete(endpoint) {
    try {
        const res = await fetch(`${API_BASE}${endpoint}`, { method: 'DELETE' });
        const json = await res.json();
        if (!res.ok) throw new Error(json.error || `HTTP ${res.status}`);
        return json;
    } catch (e) {
        console.error(`API DELETE ${endpoint}:`, e);
        throw e;
    }
}

// ─── Toast Notifications ───

function showToast(message, type = 'info', duration = 4000) {
    const container = document.getElementById('toast-container');
    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;

    const icons = { success: '✓', error: '✗', info: 'ℹ', warning: '⚠' };
    toast.innerHTML = `
        <span style="font-weight:700; font-size:1.1rem;">${icons[type] || 'ℹ'}</span>
        <span>${message}</span>
    `;

    container.appendChild(toast);
    setTimeout(() => {
        toast.classList.add('toast-out');
        setTimeout(() => toast.remove(), 300);
    }, duration);
}

// ─── Utility Functions ───

function formatDate(dateStr) {
    if (!dateStr) return '—';
    const d = new Date(dateStr + 'T00:00:00');
    return d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
}

function formatTime(timeStr) {
    if (!timeStr || timeStr === '--:--:--') return '—';
    const parts = timeStr.split(':');
    const h = parseInt(parts[0]);
    const m = parts[1];
    const ampm = h >= 12 ? 'PM' : 'AM';
    const h12 = h % 12 || 12;
    return `${h12}:${m} ${ampm}`;
}

function getStatusBadge(status) {
    if (status === 'present') return `<span class="badge badge-success">Present</span>`;
    if (status === 'absent') return `<span class="badge badge-danger">Absent</span>`;
    return `<span class="badge badge-muted">${status}</span>`;
}

function getMethodBadge(method) {
    switch (method) {
        case 'auto':
        case 'face_recognition': return `<span class="badge badge-primary">AI Face</span>`;
        case 'simulated_face': return `<span class="badge badge-warning">Simulated</span>`;
        case 'manual': return `<span class="badge badge-warning">Manual</span>`;
        default: return `<span class="badge badge-muted">${method || '—'}</span>`;
    }
}

// ─── Dashboard ───

let deptChartInstance = null;

async function loadDashboard() {
    try {
        const [analyticsData, todayData, lowData] = await Promise.all([
            apiGet('/analytics'),
            apiGet('/attendance/today'),
            apiGet('/analytics/low-attendance')
        ]);

        // Stat cards
        document.getElementById('stat-total-students').textContent = analyticsData.total_students;
        document.getElementById('stat-total-worked').textContent = analyticsData.total_worked_days || 0;
        document.getElementById('stat-today-present').textContent = todayData.present_count;

        const rate = analyticsData.total_students > 0
            ? Math.round((todayData.present_count / analyticsData.total_students) * 100)
            : 0;
        document.getElementById('stat-attendance-rate').textContent = `${rate}%`;
        document.getElementById('stat-low-attendance').textContent = lowData.students.length;
        document.getElementById('today-count').textContent = todayData.present_count;

        // Today's attendance table
        const tbody = document.getElementById('dashboard-attendance-body');
        if (!todayData.is_working_day) {
            tbody.innerHTML = '<tr><td colspan="5" class="empty-state">Today is not a Working Day. Add it in Attendance tab to start marking.</td></tr>';
        } else if (todayData.attendance.length === 0) {
            tbody.innerHTML = '<tr><td colspan="5" class="empty-state">No attendance records for today</td></tr>';
        } else {
            tbody.innerHTML = todayData.attendance.slice(0, 15).map(r => `
                <tr>
                    <td>${r.name}</td>
                    <td>${r.register_number}</td>
                    <td>${r.department}</td>
                    <td>${formatTime(r.time)}</td>
                    <td>${getStatusBadge(r.status)}</td>
                </tr>
            `).join('');
        }

        renderDeptChart(analyticsData.department_stats);

    } catch (e) {
        showToast('Failed to load dashboard data', 'error');
    }
}

function renderDeptChart(deptStats) {
    const canvas = document.getElementById('dashboard-dept-chart');
    if (!canvas) return;
    if (deptChartInstance) deptChartInstance.destroy();

    const labels = deptStats.map(d => d.department);
    const counts = deptStats.map(d => d.total_students);
    const colors = [
        'rgba(99, 102, 241, 0.8)',
        'rgba(16, 185, 129, 0.8)',
        'rgba(245, 158, 11, 0.8)',
        'rgba(239, 68,  68,  0.8)',
        'rgba(59, 130, 246,  0.8)',
        'rgba(168, 85, 247,  0.8)'
    ];

    deptChartInstance = new Chart(canvas, {
        type: 'doughnut',
        data: {
            labels,
            datasets: [{
                data: counts,
                backgroundColor: colors,
                borderColor: 'rgba(10, 14, 23, 0.8)',
                borderWidth: 3,
                hoverOffset: 8
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: {
                    position: 'bottom',
                    labels: { color: '#94a3b8', padding: 16, font: { family: 'Inter', size: 12 } }
                }
            }
        }
    });
}

// ─── Initialize ───

document.addEventListener('DOMContentLoaded', () => {
    // Live clock in topbar
    function updateClock() {
        const now = new Date();
        const el = document.getElementById('topbar-date');
        if (el) {
            el.textContent = now.toLocaleDateString('en-IN', {
                weekday: 'long', day: 'numeric', month: 'long', year: 'numeric'
            }) + '  ' + now.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' });
        }
    }
    updateClock();
    setInterval(updateClock, 60000);

    // ─── Date Controls ───
    const now = new Date();
    const todayStr = new Date(now.getTime() - (now.getTimezoneOffset() * 60000)).toISOString().split('T')[0];
    const dateInputs = document.querySelectorAll('input[type="date"]');

    dateInputs.forEach(input => {
        input.max = todayStr;
        if (!input.value) input.value = todayStr;

        input.addEventListener('change', (e) => {
            if (e.target.value > todayStr) {
                showToast('Future date access not allowed', 'error');
                e.target.value = todayStr;
                // If it's the attendance filter, reload
                if (input.id === 'filter-date' && currentPage === 'attendance') {
                    loadAttendanceRecords();
                }
            }
        });
    });

    // Nav link clicks
    document.querySelectorAll('.nav-item').forEach(item => {
        item.addEventListener('click', e => {
            if (item.dataset.page) {
                e.preventDefault();
                navigateTo(item.dataset.page);
            }
        });
    });

    // Keyboard shortcuts: Alt+1..6
    document.addEventListener('keydown', e => {
        if (e.altKey) {
            const map = { '1': 'dashboard', '2': 'registration', '3': 'attendance', '4': 'analytics', '5': 'verification', '6': 'admin' };
            if (map[e.key]) { e.preventDefault(); navigateTo(map[e.key]); }
        }
    });

    // Mobile sidebar toggle
    const menuToggle = document.getElementById('menu-toggle');
    const sidebar = document.querySelectorAll('.sidebar')[0];
    if (menuToggle && sidebar) {
        menuToggle.addEventListener('click', (e) => {
            e.stopPropagation();
            sidebar.classList.toggle('open');
        });
    }
    const mainContent = document.getElementById('main-content');
    if (mainContent && sidebar) {
        mainContent.addEventListener('click', () => {
            sidebar.classList.remove('open');
        });
    }

    // Refresh button
    const btnRef = document.getElementById('btn-refresh');
    if (btnRef) {
        btnRef.addEventListener('click', () => {
            navigateTo(currentPage);
            showToast('Data refreshed', 'info');
        });
    }

    // Scanner status indicator
    checkScannerStatus();

    // Check URL param ?page= to allow deep-linking from other pages (e.g. AI Assistant)
    const urlParams = new URLSearchParams(window.location.search);
    const targetPage = urlParams.get('page');
    if (targetPage && pages.includes(targetPage)) {
        // Clear the URL param without reloading
        window.history.replaceState({}, '', '/');
        navigateTo(targetPage);
    } else {
        // Load initial data only if no redirect
        loadDashboard();
    }

    loadDepartments();
});

async function checkScannerStatus() {
    try {
        const data = await apiGet('/scanner/status');
        const dot = document.querySelector('.status-dot');
        const text = document.querySelector('.scanner-status span');
        if (data.face_recognition_available) {
            dot.classList.add('active');
            text.textContent = 'AI Ready';
        } else {
            text.textContent = 'Simulation Mode';
        }
    } catch (e) {
        // Server not reachable yet
    }
}

async function loadDepartments() {
    try {
        const data = await apiGet('/departments');
        const select = document.getElementById('filter-department');
        if (select && data.departments) {
            data.departments.forEach(dept => {
                const opt = document.createElement('option');
                opt.value = dept;
                opt.textContent = dept;
                select.appendChild(opt);
            });
        }
    } catch (e) {
        // Will load when server starts
    }
}
