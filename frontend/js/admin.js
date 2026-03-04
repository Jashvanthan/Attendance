/**
 * AttendAI - Admin Management Module
 */

document.addEventListener('DOMContentLoaded', () => {
    // Admin registration form submit handler
    const adminForm = document.getElementById('admin-registration-form');
    if (adminForm) {
        adminForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const btn = document.getElementById('btn-register-admin');
            btn.disabled = true;
            btn.textContent = 'Registering...';

            const formData = new FormData(adminForm);
            const data = Object.fromEntries(formData);

            try {
                await apiPost('/admins', data);
                showToast(`Admin "${data.admin_name}" registered successfully!`, 'success');
                adminForm.reset();
                loadAdminsList();
            } catch (err) {
                showToast(err.message || 'Failed to register admin', 'error');
            } finally {
                btn.disabled = false;
                btn.textContent = 'Register Admin';
            }
        });
    }
});

async function loadAdminsList() {
    const tbody = document.getElementById('admins-table-body');
    if (!tbody) return;

    tbody.innerHTML = '<tr><td colspan="2" class="empty-state">Loading...</td></tr>';

    try {
        const data = await apiGet('/admins');

        if (!data.admins || data.admins.length === 0) {
            tbody.innerHTML = '<tr><td colspan="2" class="empty-state">No admins registered yet</td></tr>';
            return;
        }

        tbody.innerHTML = data.admins.map(admin => `
            <tr>
                <td>#${admin.id || admin.admin_id}</td>
                <td>
                    <span style="display:flex; align-items:center; gap:0.5rem;">
                        <span class="badge badge-primary">Admin</span>
                        ${admin.admin_name}
                    </span>
                </td>
            </tr>
        `).join('');

    } catch (err) {
        tbody.innerHTML = '<tr><td colspan="2" class="empty-state">Failed to load admins</td></tr>';
        showToast('Failed to load admin list', 'error');
    }
}