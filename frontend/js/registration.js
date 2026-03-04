/**
 * AttendAI – Registration Page Module
 * Handles student registration form, face capture, and student list
 */

let currentNewStudentId = null;
let cameraStream = null;

function loadRegistrationPage() {
    loadStudentsList();
}

// ─── Student Registration Form ───

document.addEventListener('DOMContentLoaded', () => {
    const form = document.getElementById('registration-form');
    form.addEventListener('submit', async (e) => {
        e.preventDefault();
        const btn = document.getElementById('btn-register');
        btn.disabled = true;
        btn.innerHTML = '<span class="spinner"></span> Registering...';

        const formData = new FormData(form);
        const data = Object.fromEntries(formData);

        try {
            const result = await apiPost('/students', data);
            showToast(`${data.name} registered successfully!`, 'success');
            form.reset();

            currentNewStudentId = result.student.id;

            // Show face capture card
            const faceCard = document.getElementById('face-capture-card');
            faceCard.style.display = 'block';
            document.getElementById('face-capture-status').textContent =
                `Capture face for ${data.name}`;

            loadStudentsList();
        } catch (err) {
            showToast(err.message || 'Registration failed', 'error');
        } finally {
            btn.disabled = false;
            btn.innerHTML = `
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><line x1="19" y1="8" x2="19" y2="14"/><line x1="22" y1="11" x2="16" y2="11"/></svg>
                Register Student`;
        }
    });

    // Face capture: Camera
    document.getElementById('btn-capture-face').addEventListener('click', async () => {
        if (!cameraStream) {
            await startCamera();
        } else {
            capturePhoto();
        }
    });

    // Face capture: Upload
    document.getElementById('btn-upload-face').addEventListener('click', () => {
        document.getElementById('face-file-input').click();
    });

    document.getElementById('face-file-input').addEventListener('change', (e) => {
        const file = e.target.files[0];
        if (file) {
            uploadFaceImage(file);
        }
    });

    // Close camera
    document.getElementById('btn-close-camera').addEventListener('click', () => {
        closeFaceCapture();
    });

    // Profile Modal
    document.getElementById('btn-close-profile').addEventListener('click', () => {
        document.getElementById('profile-modal').style.display = 'none';
    });

    ['profile-filter-month', 'profile-filter-year'].forEach(id => {
        document.getElementById(id).addEventListener('change', () => {
            if (activeProfileId) loadAbsenceHistory(activeProfileId);
        });
    });

    // Student search
    document.getElementById('student-search').addEventListener('input', debounce(() => {
        loadStudentsList();
    }, 300));
});

let activeProfileId = null;


// ─── Camera Functions ───

async function startCamera() {
    try {
        const video = document.getElementById('camera-video');
        cameraStream = await navigator.mediaDevices.getUserMedia({
            video: { facingMode: 'user', width: 640, height: 480 }
        });
        video.srcObject = cameraStream;
        document.getElementById('btn-capture-face').innerHTML = `
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="3"/></svg>
            Take Photo`;
        document.getElementById('face-capture-status').textContent = 'Camera active – Click "Take Photo" to capture';
    } catch (err) {
        showToast('Camera access denied. You can upload a photo instead.', 'error');
    }
}

function capturePhoto() {
    const video = document.getElementById('camera-video');
    const canvas = document.getElementById('camera-canvas');
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext('2d');
    ctx.drawImage(video, 0, 0);

    canvas.toBlob(async (blob) => {
        const reader = new FileReader();
        reader.onloadend = async () => {
            await sendFaceImage(reader.result);
        };
        reader.readAsDataURL(blob);
    }, 'image/jpeg', 0.9);
}

async function uploadFaceImage(file) {
    const reader = new FileReader();
    reader.onloadend = async () => {
        await sendFaceImage(reader.result);
    };
    reader.readAsDataURL(file);
}

async function sendFaceImage(base64Data) {
    if (!currentNewStudentId) {
        showToast('No student selected for face capture', 'error');
        return;
    }

    const statusEl = document.getElementById('face-capture-status');
    statusEl.innerHTML = '<span class="spinner"></span> Processing face...';

    try {
        const response = await apiPost(`/students/${currentNewStudentId}/face`, { image: base64Data });
        const count = response.count || 0;

        if (count < 3) {
            showToast(`Image ${count}/3 captured! Need ${3 - count} more.`, 'info');
            statusEl.innerHTML = `Captured <b>${count}/3</b>. Please move slightly and take another photo.`;
        } else {
            showToast('Face registration complete (3+ images stored)!', 'success');
            statusEl.textContent = 'Registration complete!';
            setTimeout(() => {
                closeFaceCapture();
                loadStudentsList();
            }, 1000);
        }
    } catch (err) {
        showToast(err.message || 'Face registration failed', 'error');
        statusEl.textContent = 'Failed – try again';
    }
}

function closeFaceCapture() {
    if (cameraStream) {
        cameraStream.getTracks().forEach(track => track.stop());
        cameraStream = null;
    }
    document.getElementById('face-capture-card').style.display = 'none';
    document.getElementById('btn-capture-face').innerHTML = `
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="3"/></svg>
        Capture Photo`;
    currentNewStudentId = null;
}


// ─── Student List ───

async function loadStudentsList() {
    const search = document.getElementById('student-search').value;
    const tbody = document.getElementById('students-table-body');

    try {
        let endpoint = '/students';
        if (search) endpoint += `?search=${encodeURIComponent(search)}`;

        const data = await apiGet(endpoint);

        if (data.students.length === 0) {
            tbody.innerHTML = '<tr><td colspan="6" class="empty-state">No students found</td></tr>';
            return;
        }

        tbody.innerHTML = data.students.map(s => `
            <tr>
                <td>${s.name}</td>
                <td>${s.register_number}</td>
                <td>${s.department} / Sector ${s.student_class}</td>
                <td>Year ${s.year}</td>
                <td>
                    <span class="badge ${s.attendance_percentage >= 75 ? 'badge-success' : 'badge-danger'}">
                        ${s.attendance_percentage}%
                    </span>
                </td>
                <td>
                    ${s.face_registered
                ? `<div style="display: flex; gap: 0.4rem; align-items:center;">
                               <span class="badge badge-success">✓ Captured</span>
                               <button class="btn btn-ghost btn-sm" onclick="viewStudentFace(${s.id}, '${s.name.replace(/'/g, "\\'")}')" title="View Captured Face">View</button>
                               <button class="btn btn-outline btn-sm" style="border-color:var(--accent-primary); color:var(--accent-primary);" onclick="openFaceCaptureFor(${s.id}, '${s.name.replace(/'/g, "\\'")}', true)">Retry</button>
                           </div>`
                : `<button class="btn btn-outline btn-sm" onclick="openFaceCaptureFor(${s.id}, '${s.name.replace(/'/g, "\\'")}')">Capture</button>`
            }
                </td>
                <td>
                    <div style="display: flex; gap: 0.35rem; flex-wrap: wrap; align-items: center;">
                        <button class="btn btn-sm" style="background: rgba(99,102,241,0.15); color: #818cf8; border: 1px solid rgba(99,102,241,0.3); display:flex; align-items:center; gap:0.3rem; padding: 0.2rem 0.5rem; font-size: 0.75rem;" onclick="editStudentForId(${s.id})" title="Modify Student Details">
                            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"/></svg>
                            Modify
                        </button>
                        <button class="btn btn-ghost btn-sm" onclick="viewStudentProfile(${s.id}, '${s.name.replace(/'/g, "\\'")}', '${s.register_number}')" title="View Absence History">
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 8v4l3 3"/><circle cx="12" cy="12" r="9"/></svg>
                        </button>
                        <button class="btn btn-ghost btn-sm" onclick="deleteStudent(${s.id}, '${s.name.replace(/'/g, "\\'")}')" title="Delete" style="color: #f87171;">
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
                        </button>
                    </div>
                </td>
            </tr>
        `).join('');

    } catch (err) {
        tbody.innerHTML = '<tr><td colspan="6" class="empty-state">Failed to load students</td></tr>';
    }
}

async function openFaceCaptureFor(studentId, name, isRetry = false) {
    if (isRetry) {
        try {
            await apiDelete(`/students/${studentId}/face`);
            console.log("Existing face data cleared for update");
        } catch (e) {
            console.warn("Could not clear existing face data", e);
        }
    }
    currentNewStudentId = studentId;
    const faceCard = document.getElementById('face-capture-card');
    faceCard.style.display = 'block';
    document.getElementById('face-capture-status').textContent = isRetry ? `Updating face for ${name}...` : `Capture face for ${name}`;
    faceCard.scrollIntoView({ behavior: 'smooth', block: 'center' });
}

async function deleteStudent(id, name) {
    if (!confirm(`Are you sure you want to delete ${name}? This will also remove their attendance records.`)) return;

    try {
        await apiDelete(`/students/${id}`);
        showToast(`${name} deleted`, 'info');
        loadStudentsList();
    } catch (err) {
        showToast(err.message || 'Delete failed', 'error');
    }
}

async function viewStudentProfile(id, name, regNo) {
    activeProfileId = id;
    document.getElementById('profile-name').textContent = "Absence History";
    document.getElementById('profile-reg-no').textContent = `Student: ${name} (${regNo})`;
    document.getElementById('profile-modal').style.display = 'flex';

    // Reset filters
    document.getElementById('profile-filter-month').value = "";
    document.getElementById('profile-filter-year').value = new Date().getFullYear().toString();

    loadAbsenceHistory(id);
    loadStudentStats(id);
}

async function loadStudentStats(id) {
    try {
        const { stats } = await apiGet(`/students/${id}/stats`);
        document.getElementById('profile-worked-count').textContent = stats.total_worked_days;
        document.getElementById('profile-present-count').textContent = stats.total_present_days;
        document.getElementById('profile-absent-count').textContent = stats.total_absent_days;
        document.getElementById('profile-percentage').textContent = `${stats.attendance_percentage}%`;
    } catch (e) {
        console.error("Failed to load student stats", e);
    }
}

async function loadAbsenceHistory(id) {
    const month = document.getElementById('profile-filter-month').value;
    const year = document.getElementById('profile-filter-year').value;

    const params = new URLSearchParams();
    if (month) params.append('month', month);
    if (year) params.append('year', year);

    try {
        const data = await apiGet(`/students/${id}/absences?${params.toString()}`);
        if (!data || !data.absences) return;

        document.getElementById('profile-absent-count').textContent = data.absences.total_absent_days;

        const tbody = document.getElementById('profile-absence-table');
        if (!data.absences.absent_dates || data.absences.absent_dates.length === 0) {
            tbody.innerHTML = '<tr><td colspan="2" class="empty-state">No absence records found</td></tr>';
            return;
        }

        tbody.innerHTML = data.absences.absent_dates.map(dateStr => {
            const d = new Date(dateStr + 'T00:00:00');
            const dayName = d.toLocaleDateString('en-IN', { weekday: 'long' });
            return `
                <tr>
                    <td>${formatDate(dateStr)}</td>
                    <td>${dayName}</td>
                </tr>
            `;
        }).join('');

    } catch (err) {
        console.error(err);
        showToast('Failed to load absence history', 'error');
    }
}

function viewStudentFace(studentId, name) {
    const faceUrl = `/known_faces/${studentId}.jpg`;

    // Remove existing modal if any
    const existingModal = document.getElementById('face-view-modal');
    if (existingModal) existingModal.remove();

    const errorImgFallback = `onerror="this.src='https://ui-avatars.com/api/?name=${encodeURIComponent(name)}&background=10b981&color=fff'"`;

    const html = `
        <div class="modal-overlay" id="face-view-modal">
            <div class="modal" style="max-width: 400px; animation: modalIn 0.3s ease-out;">
                <div class="modal-header">
                    <h3>${name}'s Registered Face</h3>
                    <button class="btn btn-ghost btn-sm" onclick="document.getElementById('face-view-modal').remove()">✕</button>
                </div>
                <div class="modal-body" style="display: flex; justify-content: center; padding: 2rem;">
                    <div style="width: 250px; height: 250px; border-radius: 20px; border: 4px solid var(--accent-success); overflow: hidden; box-shadow: 0 10px 25px rgba(0,0,0,0.3);">
                        <img src="${faceUrl}?t=${new Date().getTime()}" alt="${name}" style="width: 100%; height: 100%; object-fit: cover;" ${errorImgFallback}>
                    </div>
                </div>
                <div class="modal-footer" style="justify-content: center; padding-top: 0;">
                    <p style="color:var(--text-muted); font-size:0.85rem;">This is the primary image used for verification.</p>
                </div>
            </div>
        </div>
    `;

    document.body.insertAdjacentHTML('beforeend', html);

    // Close on overlay click
    document.getElementById('face-view-modal').addEventListener('click', e => {
        if (e.target === e.currentTarget) e.currentTarget.remove();
    });
}

// ─── Utility ───

function debounce(fn, delay) {
    let timer;
    return (...args) => {
        clearTimeout(timer);
        timer = setTimeout(() => fn(...args), delay);
    };
}

// ─── Modify Student Logic ───

let currentEditStudentData = null;

async function editStudentForId(studentId) {
    try {
        const data = await apiGet(`/students/${studentId}`);
        const s = data.student;
        if (!s) return;

        // Fill form fields
        document.getElementById('mod-student-id').value = s.id;
        document.getElementById('mod-name').value = s.name;
        document.getElementById('mod-register-number').value = s.register_number;
        document.getElementById('mod-department').value = s.department;
        document.getElementById('mod-class').value = s.student_class || '';
        document.getElementById('mod-year').value = s.year;

        document.getElementById('modify-student-modal').style.display = 'flex';
    } catch (err) {
        showToast('Failed to load student for editing', 'error');
    }
}

document.addEventListener('DOMContentLoaded', () => {
    // Modify close actions
    document.getElementById('btn-close-modify')?.addEventListener('click', () => {
        document.getElementById('modify-student-modal').style.display = 'none';
    });
    document.getElementById('btn-cancel-modify')?.addEventListener('click', () => {
        document.getElementById('modify-student-modal').style.display = 'none';
    });

    // Modify Submit Action
    const modForm = document.getElementById('modify-form');
    if (modForm) {
        modForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const btn = document.getElementById('btn-save-modify');
            btn.innerHTML = '<span class="spinner"></span> Saving...';
            btn.disabled = true;

            const studentId = document.getElementById('mod-student-id').value;
            const formData = new FormData(modForm);
            const data = Object.fromEntries(formData);

            try {
                await apiPut(`/students/${studentId}`, data);
                showToast(`Student #${studentId} Details Modified Successfully!`, 'success');
                document.getElementById('modify-student-modal').style.display = 'none';
                loadStudentsList();
            } catch (err) {
                showToast(err.message || 'Failed to modify student', 'error');
            } finally {
                btn.innerHTML = 'Save Changes';
                btn.disabled = false;
            }
        });
    }
});
