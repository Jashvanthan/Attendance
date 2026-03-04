/**
 * AttendAI – Analytics Page Module
 * Charts and analytics using Chart.js
 */

let monthlyChartInstance = null;
let deptCompareChartInstance = null;
let studentRateChartInstance = null;

// Chart.js dark-theme defaults
Chart.defaults.color = '#94a3b8';
Chart.defaults.borderColor = 'rgba(255, 255, 255, 0.04)';
Chart.defaults.font.family = 'Inter';

async function loadAnalyticsPage() {
    try {
        const [analytics, lowData] = await Promise.all([
            apiGet('/analytics'),
            apiGet('/analytics/low-attendance')
        ]);

        // Stat cards
        document.getElementById('analytics-total').textContent = analytics.total_students;
        document.getElementById('analytics-total-worked').textContent = analytics.total_worked_days || 0;
        document.getElementById('analytics-low-count').textContent = lowData.students.length;

        let avgRate = 0;
        if (analytics.student_rates.length > 0) {
            const rates = analytics.student_rates.map(s =>
                s.total_days > 0 ? (s.present_days / s.total_days) * 100 : 0
            );
            avgRate = Math.round(rates.reduce((a, b) => a + b, 0) / rates.length);
        }
        document.getElementById('analytics-avg-rate').textContent = `${avgRate}%`;

        renderMonthlyChart(analytics.monthly, analytics.total_students);
        renderDeptCompareChart(analytics.department_stats);
        renderStudentRateChart(analytics.student_rates);
        renderLowAttendanceTable(lowData.students);

    } catch (err) {
        showToast('Failed to load analytics data', 'error');
    }
}


// ─── Monthly Attendance Trend ───

function renderMonthlyChart(monthlyData, totalStudents) {
    const canvas = document.getElementById('chart-monthly');
    if (!canvas) return;
    if (monthlyChartInstance) monthlyChartInstance.destroy();

    const labels = monthlyData.map(d => {
        const [year, month] = d.month.split('-');
        return new Date(year, month - 1).toLocaleDateString('en-IN', { month: 'short', year: '2-digit' });
    });
    const values = monthlyData.map(d => d.present_count);

    // Compute max possible (students * working days) for percentage reference
    const maxVal = totalStudents > 0 ? totalStudents : 1;

    monthlyChartInstance = new Chart(canvas, {
        type: 'line',
        data: {
            labels,
            datasets: [{
                label: 'Students Present',
                data: values,
                borderColor: '#6366f1',
                backgroundColor: 'rgba(99, 102, 241, 0.12)',
                borderWidth: 2.5,
                fill: true,
                tension: 0.4,
                pointRadius: 4,
                pointBackgroundColor: '#6366f1',
                pointBorderColor: '#0a0e17',
                pointBorderWidth: 2,
                pointHoverRadius: 7
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: { display: false },
                tooltip: {
                    backgroundColor: '#1e293b',
                    titleColor: '#f1f5f9',
                    bodyColor: '#94a3b8',
                    borderColor: 'rgba(99, 102, 241, 0.4)',
                    borderWidth: 1,
                    padding: 12,
                    cornerRadius: 8,
                    callbacks: {
                        afterLabel: ctx => `Avg/day: ${ctx.parsed.y} of ${maxVal} students`
                    }
                }
            },
            scales: {
                x: { grid: { display: false }, ticks: { font: { size: 11 } } },
                y: {
                    beginAtZero: true,
                    grid: { color: 'rgba(255,255,255,0.03)' },
                    ticks: { font: { size: 11 } }
                }
            }
        }
    });
}


// ─── Department Attendance Rates ───

function renderDeptCompareChart(deptStats) {
    const canvas = document.getElementById('chart-departments');
    if (!canvas) return;
    if (deptCompareChartInstance) deptCompareChartInstance.destroy();

    const labels = deptStats.map(d => d.department);
    const attendanceRates = deptStats.map(d => {
        if (!d.total_students || !d.total_days) return 0;
        return Math.round((d.present_count / (d.total_students * d.total_days)) * 100);
    });
    const colors = attendanceRates.map(rate =>
        rate >= 75 ? 'rgba(16,185,129,0.75)' :
            rate >= 50 ? 'rgba(245,158,11,0.75)' :
                'rgba(239,68,68,0.75)'
    );

    deptCompareChartInstance = new Chart(canvas, {
        type: 'bar',
        data: {
            labels,
            datasets: [{
                label: 'Attendance Rate (%)',
                data: attendanceRates,
                backgroundColor: colors,
                borderColor: colors.map(c => c.replace('0.75', '1')),
                borderWidth: 1,
                borderRadius: 6,
                barPercentage: 0.6
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            indexAxis: 'y',
            plugins: {
                legend: { display: false },
                tooltip: {
                    backgroundColor: '#1e293b',
                    titleColor: '#f1f5f9',
                    bodyColor: '#94a3b8',
                    borderColor: 'rgba(255,255,255,0.1)',
                    borderWidth: 1,
                    padding: 12,
                    cornerRadius: 8,
                    callbacks: {
                        label: ctx => `${ctx.parsed.x}% attendance rate`
                    }
                }
            },
            scales: {
                x: {
                    beginAtZero: true, max: 100,
                    grid: { color: 'rgba(255,255,255,0.03)' },
                    ticks: { callback: v => v + '%', font: { size: 11 } }
                },
                y: { grid: { display: false }, ticks: { font: { size: 11 } } }
            }
        }
    });
}


// ─── Student Attendance Rates ───

function renderStudentRateChart(studentRates) {
    const canvas = document.getElementById('chart-students');
    if (!canvas) return;
    if (studentRateChartInstance) studentRateChartInstance.destroy();

    const sorted = studentRates.map(s => ({
        ...s,
        rate: s.total_days > 0 ? Math.round((s.present_days / s.total_days) * 100) : 0
    })).sort((a, b) => a.rate - b.rate).slice(0, 25);

    const labels = sorted.map(s => s.name.split(' ')[0]);
    const rates = sorted.map(s => s.rate);
    const colors = rates.map(r =>
        r >= 75 ? 'rgba(16,185,129,0.75)' :
            r >= 50 ? 'rgba(245,158,11,0.75)' :
                'rgba(239,68,68,0.75)'
    );

    studentRateChartInstance = new Chart(canvas, {
        type: 'bar',
        data: {
            labels,
            datasets: [{
                label: 'Attendance %',
                data: rates,
                backgroundColor: colors,
                borderColor: colors.map(c => c.replace('0.75', '1')),
                borderWidth: 1,
                borderRadius: 4,
                barPercentage: 0.7
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: { display: false },
                tooltip: {
                    backgroundColor: '#1e293b',
                    titleColor: '#f1f5f9',
                    bodyColor: '#94a3b8',
                    padding: 12,
                    cornerRadius: 8,
                    callbacks: {
                        title: items => sorted[items[0].dataIndex].name,
                        label: ctx => {
                            const s = sorted[ctx.dataIndex];
                            return [
                                `Attendance: ${ctx.parsed.y}%`,
                                `Present: ${s.present_days} / ${s.total_days} days`,
                                `Dept: ${s.department}`
                            ];
                        }
                    }
                }
            },
            scales: {
                x: { grid: { display: false }, ticks: { font: { size: 10 }, maxRotation: 45 } },
                y: {
                    beginAtZero: true, max: 100,
                    grid: { color: 'rgba(255,255,255,0.03)' },
                    ticks: { callback: v => v + '%', font: { size: 11 } }
                }
            }
        }
    });
}


// ─── Low Attendance Table ───

function renderLowAttendanceTable(students) {
    const tbody = document.getElementById('low-attendance-body');
    if (!tbody) return;

    if (students.length === 0) {
        tbody.innerHTML = '<tr><td colspan="7" class="empty-state">🎉 All students are above 75% attendance!</td></tr>';
        return;
    }

    tbody.innerHTML = students.map(s => {
        const rate = s.total_days > 0 ? Math.round((s.present_days / s.total_days) * 100) : 0;
        const rateClass = rate < 50 ? 'badge-danger' : 'badge-warning';
        const absences = s.total_days - s.present_days;
        return `
            <tr>
                <td>${s.name}</td>
                <td>${s.register_number}</td>
                <td>${s.department}</td>
                <td>Year ${s.year}</td>
                <td>${s.present_days}</td>
                <td><span style="color:var(--accent-danger);">${absences}</span> / ${s.total_days}</td>
                <td><span class="badge ${rateClass}">${rate}%</span></td>
            </tr>
        `;
    }).join('');
}
