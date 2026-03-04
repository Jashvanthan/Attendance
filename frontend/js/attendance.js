/**
 * AttendAI – Attendance Page Module
 * Handles attendance records display, filtering, manual marking, and export.
 */

function loadAttendancePage() {
    loadAttendanceRecords();
    loadWorkingDays();
    loadStudentsForManualMarking();
}

// ─── Working Days Management ───

async function loadWorkingDays() {
    const tbody = document.getElementById('workdays-table-body');
    if (!tbody) return;

    try {
        const data = await apiGet('/working-days');
        const rows = data.working_days || [];

        if (rows.length === 0) {
            tbody.innerHTML = '<tr><td colspan="4" class="empty-state">No working days configured yet.</td></tr>';
            return;
        }

        tbody.innerHTML = rows.map(r => {
            const dateObj = new Date(r.date);
            const dayName = dateObj.toLocaleDateString('en-IN', { weekday: 'long' });
            const statusBadge = r.status === 'working'
                ? '<span class="badge badge-success">Worked Day</span>'
                : '<span class="badge badge-danger">Holiday</span>';

            return `
                <tr>
                    <td>${formatDate(r.date)}</td>
                    <td>${dayName}</td>
                    <td>${statusBadge}</td>
                    <td>
                        <div style="display:flex; gap:0.5rem;">
                            <button class="btn btn-ghost btn-sm" onclick="toggleWorkDateStatus('${r.date}', '${r.status}')" title="Change Status">
                                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                    <path d="M17 2.1l4 4-4 4M3 12.2v-2a4 4 0 0 1 4-4h14M7 21.9l-4-4 4-4M21 11.8v2a4 4 0 0 1-4 4H3"/>
                                </svg>
                            </button>
                            <button class="btn btn-ghost btn-sm" onclick="deleteWorkDate('${r.date}')" title="Delete">
                                <svg width="14" height="14" viewBox="0 0 24 24" stroke="#ef4444" stroke-width="2" fill="none">
                                    <polyline points="3 6 5 6 21 6"></polyline>
                                    <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
                                </svg>
                            </button>
                        </div>
                    </td>
                </tr>
            `;
        }).join('');
    } catch (e) {
        tbody.innerHTML = '<tr><td colspan="4" class="empty-state">Failed to load working days.</td></tr>';
    }
}

async function addWorkingDayRecord() {
    const dateInput = document.getElementById('add-workdate-input');
    const statusSelect = document.getElementById('add-workdate-status');
    const date = dateInput.value;
    const status = statusSelect.value;

    if (!date) {
        showToast('Please select a date', 'error');
        return;
    }

    try {
        // Check if attendance exists for this date if we are setting it to holiday
        if (status === 'holiday') {
            const attData = await apiGet(`/attendance?date=${date}`);
            const hasAttendance = (attData.attendance || []).some(r => r.status === 'present');
            if (hasAttendance) {
                if (!confirm("Attendance records exist for this date. Changing status to Holiday will DELETE all attendance records for this day. Continue?")) return;
            }
        }

        await apiPost('/working-days', { date, status });
        showToast('Date record added!', 'success');
        dateInput.value = '';
        loadWorkingDays();
        // If the added date is current filter date, reload attendance
        if (date === document.getElementById('filter-date').value) loadAttendanceRecords();

        // Refresh stats
        if (typeof loadDashboard === 'function') loadDashboard();
    } catch (e) {
        showToast(e.message || 'Failed to add date', 'error');
    }
}

async function toggleWorkDateStatus(date, currentStatus) {
    const newStatus = currentStatus === 'working' ? 'holiday' : 'working';

    try {
        if (newStatus === 'holiday') {
            const attData = await apiGet(`/attendance?date=${date}`);
            const hasAttendance = (attData.attendance || []).some(r => r.status === 'present');

            let msg = "Change this date to Holiday? This will affect attendance percentage.";
            if (hasAttendance) {
                msg = "Attendance records exist for this date. Changing status to Holiday will DELETE all attendance records for this day. Continue?";
            }
            if (!confirm(msg)) return;
        }

        await apiPut(`/working-days/${date}`, { status: newStatus });
        showToast('Status updated!', 'success');
        loadWorkingDays();
        if (date === document.getElementById('filter-date').value) loadAttendanceRecords();

        // Refresh stats
        if (typeof loadDashboard === 'function') loadDashboard();
    } catch (e) {
        showToast('Update failed', 'error');
    }
}

async function deleteWorkDate(date) {
    try {
        const attData = await apiGet(`/attendance?date=${date}`);
        const hasAttendance = (attData.attendance || []).some(r => r.status === 'present');

        let msg = `Remove configuration for ${date}?`;
        if (hasAttendance) {
            msg = `Attendance records exist for this date (${date}). Deleting this configuration will affect attendance percentage. Continue?`;
        }
        if (!confirm(msg)) return;

        await apiDelete(`/working-days/${date}`);
        showToast('Record deleted', 'info');
        loadWorkingDays();
        if (date === document.getElementById('filter-date').value) loadAttendanceRecords();

        if (typeof loadDashboard === 'function') loadDashboard();
    } catch (e) {
        showToast('Delete failed', 'error');
    }
}

// ─── Attendance Records ───

async function loadAttendanceRecords() {
    const dateVal = document.getElementById('filter-date').value;
    const deptVal = document.getElementById('filter-department').value;
    const yearVal = document.getElementById('filter-year').value;
    const searchVal = document.getElementById('filter-search').value;
    const statusVal = document.getElementById('filter-status').value;

    const params = new URLSearchParams();
    if (dateVal) params.append('date', dateVal);
    if (deptVal) params.append('department', deptVal);
    if (yearVal) params.append('year', yearVal);
    if (searchVal) params.append('search', searchVal);
    if (statusVal) params.append('status', statusVal);

    const classVal = document.getElementById('filter-class').value;
    if (classVal) params.append('student_class', classVal);

    const tbody = document.getElementById('attendance-table-body');
    tbody.innerHTML = '<tr><td colspan="9" class="empty-state">Loading…</td></tr>';

    try {
        const data = await apiGet(`/attendance?${params.toString()}`);

        // ─── Holiday Check ───
        const alertEl = document.getElementById('holiday-alert');
        const manualBtn = document.getElementById('btn-mark-manual-open');
        let isHoliday = false;

        if (dateVal) {
            // Check if this date is marked as holiday in working_days
            const wdData = await apiGet('/working-days');
            const dayRecord = (wdData.working_days || []).find(d => d.date === dateVal);
            if (!dayRecord || dayRecord.status !== 'working') {
                isHoliday = true;
            }
        }

        if (alertEl) alertEl.style.display = isHoliday ? 'flex' : 'none';
        if (manualBtn) manualBtn.disabled = isHoliday;

        // Update Header Badge
        const headerTitle = document.querySelector('#page-attendance .card-header h3');
        if (headerTitle) {
            let statusHtml = 'Attendance Records';
            if (dateVal) {
                statusHtml += isHoliday
                    ? ' <span class="badge badge-danger" style="margin-left:1rem;">Holiday</span>'
                    : ' <span class="badge badge-success" style="margin-left:1rem;">Worked Day</span>';
            }
            headerTitle.innerHTML = statusHtml;
        }

        const rows = data.attendance || [];
        const statsEl = document.getElementById('attendance-daily-stats');

        if (dateVal && rows.length > 0) {
            statsEl.style.display = 'grid';
            const total = rows.length;
            const present = rows.filter(r => r.status === 'present').length;
            const absent = total - present;
            const percent = total > 0 ? Math.round((present / total) * 100) : 0;

            document.getElementById('daily-stat-total').textContent = total;
            document.getElementById('daily-stat-present').textContent = present;
            document.getElementById('daily-stat-absent').textContent = absent;
            document.getElementById('daily-stat-percent').textContent = `${percent}%`;
        } else {
            if (statsEl) statsEl.style.display = 'none';
        }

        if (rows.length === 0) {
            tbody.innerHTML = `<tr><td colspan="9" class="empty-state">${isHoliday ? 'Selected date is not a Worked Date. No attendance available.' : (dateVal ? 'No students match filters for this date' : 'Enter criteria to view records')}</td></tr>`;
            return;
        }

        tbody.innerHTML = rows.map(r => {
            const now = new Date();
            const todayStr = new Date(now.getTime() - (now.getTimezoneOffset() * 60000)).toISOString().split('T')[0];
            const isToday = r.date === todayStr;
            const canModify = isToday && !isHoliday;

            const toggleIcon = r.status === 'present'
                ? `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#ef4444" stroke-width="2">
                       <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
                   </svg>`
                : `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#10b981" stroke-width="2">
                       <polyline points="20 6 9 17 4 12"/>
                   </svg>`;

            const toggleTitle = isToday
                ? (r.status === 'present' ? 'Mark Absent' : 'Mark Present')
                : 'Cannot modify past records';

            return `
            <tr>
                <td>${r.name}</td>
                <td>${r.register_number}</td>
                <td>${r.department} / Sector ${r.student_class || 'A'}</td>
                <td>Year ${r.year}</td>
                <td>${formatDate(r.date)}</td>
                <td>${formatTime(r.time)}</td>
                <td>${getStatusBadge(r.status)}</td>
                <td>${getMethodBadge(r.method)}</td>
                <td>
                    <button class="btn btn-ghost btn-sm"
                            ${canModify ? '' : 'disabled style="opacity:0.5; cursor:not-allowed;"'}
                            onclick="toggleAttendance('${r.id || ''}', ${r.student_id}, '${r.status}', '${r.date}')"
                            title="${canModify ? toggleTitle : (isHoliday ? 'Holiday' : 'Past Record')}">
                        ${toggleIcon}
                    </button>
                </td>
            </tr>`;
        }).join('');

    } catch (err) {
        tbody.innerHTML = '<tr><td colspan="9" class="empty-state">Failed to load attendance records</td></tr>';
    }
}

async function toggleAttendance(id, studentId, currentStatus, recordDate) {
    const newStatus = currentStatus === 'present' ? 'absent' : 'present';
    try {
        if (id && id !== 'null' && id !== '') {
            await apiPut(`/attendance/${id}`, { status: newStatus });
        } else {
            // Student was implicitly absent — create a new record
            await apiPost('/attendance/mark-manual', {
                student_id: studentId,
                date: recordDate,
                status: newStatus
            });
        }
        showToast(`Status updated to ${newStatus}`, 'success');
        loadAttendanceRecords();
        if (typeof loadDashboard === 'function') loadDashboard();
    } catch (err) {
        showToast('Failed to update attendance', 'error');
    }
}


// ─── Filters & Event Listeners ───

document.addEventListener('DOMContentLoaded', () => {
    // Filter change listeners
    ['filter-date', 'filter-department', 'filter-year', 'filter-status'].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.addEventListener('change', () => {
            if (currentPage === 'attendance') loadAttendanceRecords();
        });
    });

    // Search with debounce
    const searchFilter = document.getElementById('filter-search');
    if (searchFilter) {
        let searchTimer;
        searchFilter.addEventListener('input', () => {
            clearTimeout(searchTimer);
            searchTimer = setTimeout(() => {
                if (currentPage === 'attendance') loadAttendanceRecords();
            }, 350);
        });
    }

    // Clear filters – reset to today
    const btnClear = document.getElementById('btn-clear-filters');
    if (btnClear) {
        btnClear.addEventListener('click', () => {
            const now = new Date();
            const localToday = new Date(now.getTime() - (now.getTimezoneOffset() * 60000)).toISOString().split('T')[0];
            document.getElementById('filter-date').value = localToday;
            document.getElementById('filter-department').value = '';
            document.getElementById('filter-year').value = '';
            document.getElementById('filter-search').value = '';
            document.getElementById('filter-status').value = '';
            loadAttendanceRecords();
        });
    }

    // ── Manual Attendance Modal ──
    const openBtn = document.getElementById('btn-mark-manual-open');
    const closeBtn = document.getElementById('btn-close-manual');
    const cancelBtn = document.getElementById('btn-cancel-manual');
    const modal = document.getElementById('manual-modal');

    if (openBtn) openBtn.addEventListener('click', () => { modal.style.display = 'flex'; });
    if (closeBtn) closeBtn.addEventListener('click', () => { modal.style.display = 'none'; });
    if (cancelBtn) cancelBtn.addEventListener('click', () => { modal.style.display = 'none'; });

    // Close on overlay click
    if (modal) {
        modal.addEventListener('click', e => {
            if (e.target === e.currentTarget) e.currentTarget.style.display = 'none';
        });
    }

    // Submit manual attendance
    const confirmBtn = document.getElementById('btn-confirm-manual');
    if (confirmBtn) {
        confirmBtn.addEventListener('click', async () => {
            const studentId = document.getElementById('manual-student-select').value;
            const dateInput = document.getElementById('manual-date');
            const manualDate = dateInput ? dateInput.value : null;

            if (!studentId) {
                showToast('Please select a student', 'error');
                return;
            }

            try {
                const payload = { student_id: parseInt(studentId) };
                if (manualDate) payload.date = manualDate;

                await apiPost('/attendance/mark-manual', payload);
                showToast('Manual attendance marked!', 'success');
                modal.style.display = 'none';
                loadAttendanceRecords();
                if (typeof loadDashboard === 'function') loadDashboard();
            } catch (err) {
                showToast(err.message || 'Failed to mark attendance', 'error');
            }
        });
    }

    // ── Working Days Actions ──
    const btnAddWorkDate = document.getElementById('btn-add-workdate');
    if (btnAddWorkDate) btnAddWorkDate.addEventListener('click', addWorkingDayRecord);
});


// ─── Load Students for Manual Dropdown ───

async function loadStudentsForManualMarking() {
    try {
        const data = await apiGet('/students');
        const select = document.getElementById('manual-student-select');
        if (!select) return;

        // Remove all options except the placeholder
        while (select.options.length > 1) select.remove(1);

        (data.students || []).forEach(s => {
            const opt = document.createElement('option');
            opt.value = s.id;
            opt.textContent = `${s.name} (${s.register_number}) — ${s.department}`;
            select.appendChild(opt);
        });
    } catch (err) {
        // Will load when server is available
    }
}
