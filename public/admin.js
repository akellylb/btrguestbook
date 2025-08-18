document.addEventListener('DOMContentLoaded', function() {
    const loginSection = document.getElementById('login-section');
    const dashboardSection = document.getElementById('dashboard-section');
    const loginForm = document.getElementById('login-form');
    const loginError = document.getElementById('login-error');
    const logoutBtn = document.getElementById('logout-btn');
    
    checkAuth();

    loginForm.addEventListener('submit', async function(e) {
        e.preventDefault();
        
        const username = document.getElementById('username').value;
        const password = document.getElementById('password').value;
        
        try {
            const response = await fetch('/api/admin/login', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ username, password })
            });
            
            const data = await response.json();
            
            if (response.ok) {
                localStorage.setItem('adminToken', data.token);
                showDashboard();
            } else {
                loginError.textContent = data.error || 'Invalid credentials';
                loginError.style.display = 'block';
            }
        } catch (error) {
            loginError.textContent = 'Connection error';
            loginError.style.display = 'block';
        }
    });

    logoutBtn.addEventListener('click', function() {
        localStorage.removeItem('adminToken');
        showLogin();
    });

    function checkAuth() {
        const token = localStorage.getItem('adminToken');
        if (token) {
            verifyToken(token);
        } else {
            showLogin();
        }
    }

    async function verifyToken(token) {
        try {
            const response = await fetch('/api/admin/verify', {
                headers: {
                    'Authorization': `Bearer ${token}`
                }
            });
            
            if (response.ok) {
                showDashboard();
            } else {
                localStorage.removeItem('adminToken');
                showLogin();
            }
        } catch (error) {
            showLogin();
        }
    }

    function showLogin() {
        loginSection.style.display = 'block';
        dashboardSection.style.display = 'none';
    }

    function showDashboard() {
        loginSection.style.display = 'none';
        dashboardSection.style.display = 'block';
        loadDashboardData();
    }

    async function loadDashboardData() {
        const token = localStorage.getItem('adminToken');
        
        try {
            const response = await fetch('/api/admin/dashboard', {
                headers: {
                    'Authorization': `Bearer ${token}`
                }
            });
            
            const data = await response.json();
            
            if (response.ok) {
                updateStats(data.stats);
                updateDailyChart(data.dailyStats);
                updateRecentEntries(data.recentEntries);
            }
        } catch (error) {
            console.error('Error loading dashboard:', error);
        }
    }

    function updateStats(stats) {
        document.getElementById('total-signatures').textContent = stats.total || 0;
        document.getElementById('newsletter-signups').textContent = stats.newsletter || 0;
        document.getElementById('today-signatures').textContent = stats.today || 0;
        document.getElementById('week-signatures').textContent = stats.week || 0;
    }

    function updateDailyChart(dailyStats) {
        const ctx = document.getElementById('dailyChart');
        if (!ctx) return;
        
        const labels = dailyStats.map(d => {
            const date = new Date(d.date);
            return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
        });
        
        const data = dailyStats.map(d => d.count);
        
        new Chart(ctx, {
            type: 'line',
            data: {
                labels: labels,
                datasets: [{
                    label: 'Daily Signatures',
                    data: data,
                    borderColor: '#d4af37',
                    backgroundColor: 'rgba(212, 175, 55, 0.1)',
                    tension: 0.4,
                    fill: true
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: {
                        labels: {
                            color: '#f5f5f5'
                        }
                    }
                },
                scales: {
                    y: {
                        beginAtZero: true,
                        ticks: {
                            color: '#f5f5f5',
                            stepSize: 1
                        },
                        grid: {
                            color: 'rgba(255, 255, 255, 0.1)'
                        }
                    },
                    x: {
                        ticks: {
                            color: '#f5f5f5'
                        },
                        grid: {
                            color: 'rgba(255, 255, 255, 0.1)'
                        }
                    }
                }
            }
        });
    }

    function updateRecentEntries(entries) {
        const tbody = document.getElementById('entries-tbody');
        if (!tbody || !entries) return;
        
        tbody.innerHTML = entries.map(entry => {
            const date = new Date(entry.timestamp);
            const formattedDate = date.toLocaleDateString('en-US', {
                month: 'short',
                day: 'numeric',
                hour: '2-digit',
                minute: '2-digit'
            });
            
            return `
                <tr>
                    <td>${formattedDate}</td>
                    <td>${escapeHtml(entry.name)}</td>
                    <td>${escapeHtml(entry.email)}</td>
                    <td class="${entry.newsletter_signup ? 'newsletter-yes' : 'newsletter-no'}">
                        ${entry.newsletter_signup ? 'Yes' : 'No'}
                    </td>
                    <td>${entry.message ? escapeHtml(entry.message) : '-'}</td>
                </tr>
            `;
        }).join('');
    }

    document.getElementById('export-all-btn').addEventListener('click', function() {
        const token = localStorage.getItem('adminToken');
        window.location.href = `/api/admin/export/all?token=${token}`;
    });

    document.getElementById('export-newsletter-btn').addEventListener('click', function() {
        const token = localStorage.getItem('adminToken');
        window.location.href = `/api/admin/export/newsletter?token=${token}`;
    });

    document.getElementById('export-date-range-btn').addEventListener('click', function() {
        const picker = document.getElementById('date-range-picker');
        picker.style.display = picker.style.display === 'none' ? 'block' : 'none';
    });

    document.getElementById('export-range-confirm').addEventListener('click', function() {
        const startDate = document.getElementById('start-date').value;
        const endDate = document.getElementById('end-date').value;
        
        if (!startDate || !endDate) {
            alert('Please select both start and end dates');
            return;
        }
        
        const token = localStorage.getItem('adminToken');
        window.location.href = `/api/admin/export/range?token=${token}&start=${startDate}&end=${endDate}`;
    });

    function escapeHtml(text) {
        const map = {
            '&': '&amp;',
            '<': '&lt;',
            '>': '&gt;',
            '"': '&quot;',
            "'": '&#039;'
        };
        return text.replace(/[&<>"']/g, m => map[m]);
    }

    setInterval(() => {
        if (dashboardSection.style.display !== 'none') {
            loadDashboardData();
        }
    }, 30000);
});