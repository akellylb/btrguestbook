require('dotenv').config();
const express = require('express');
const bodyParser = require('body-parser');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));
app.use(express.static('public'));

const JWT_SECRET = process.env.JWT_SECRET || 'default-secret-change-this';
const ADMIN_USERNAME = process.env.ADMIN_USERNAME || 'admin';
const ADMIN_PASSWORD_HASH = bcrypt.hashSync(process.env.ADMIN_PASSWORD || 'admin123', 10);

// Database setup - SQLite for local, PostgreSQL for production
let db;
let isPostgres = false;

if (process.env.POSTGRES_URL || process.env.POSTGRES_PRISMA_URL) {
    // Production - PostgreSQL
    const { Pool } = require('pg');
    isPostgres = true;
    
    const connectionString = process.env.POSTGRES_URL || process.env.DATABASE_URL;
    db = new Pool({
        connectionString,
        ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
    });
    
    console.log('Using PostgreSQL database');
    initPostgresDatabase();
} else {
    // Local development - SQLite
    const sqlite3 = require('sqlite3').verbose();
    db = new sqlite3.Database('./guestbook.db', (err) => {
        if (err) {
            console.error('Error opening database:', err);
        } else {
            console.log('Connected to SQLite database');
            initSQLiteDatabase();
        }
    });
}

async function initPostgresDatabase() {
    try {
        await db.query(`
            CREATE TABLE IF NOT EXISTS signatures (
                id SERIAL PRIMARY KEY,
                name TEXT NOT NULL,
                email TEXT NOT NULL,
                newsletter_signup BOOLEAN DEFAULT FALSE,
                message TEXT,
                timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        `);
        console.log('PostgreSQL table ready');
    } catch (err) {
        console.error('Error creating PostgreSQL table:', err);
    }
}

function initSQLiteDatabase() {
    db.run(`CREATE TABLE IF NOT EXISTS signatures (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        email TEXT NOT NULL,
        newsletter_signup BOOLEAN DEFAULT 0,
        message TEXT,
        timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
    )`, (err) => {
        if (err) {
            console.error('Error creating SQLite table:', err);
        } else {
            console.log('SQLite table ready.');
        }
    });
}

function authenticateToken(req, res, next) {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1] || req.query.token;
    
    if (!token) {
        return res.status(401).json({ error: 'Access denied' });
    }
    
    jwt.verify(token, JWT_SECRET, (err, user) => {
        if (err) {
            return res.status(403).json({ error: 'Invalid token' });
        }
        req.user = user;
        next();
    });
}

app.post('/api/sign', async (req, res) => {
    const { name, email, newsletter_signup, message } = req.body;
    
    if (!name || !email) {
        return res.status(400).json({ error: 'Name and email are required' });
    }
    
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
        return res.status(400).json({ error: 'Invalid email format' });
    }
    
    try {
        if (isPostgres) {
            const result = await db.query(
                'INSERT INTO signatures (name, email, newsletter_signup, message) VALUES ($1, $2, $3, $4) RETURNING id',
                [name, email, newsletter_signup || false, message || '']
            );
            res.json({ 
                success: true, 
                id: result.rows[0].id,
                message: 'Thank you for signing the guestbook!' 
            });
        } else {
            const stmt = db.prepare(`INSERT INTO signatures (name, email, newsletter_signup, message) VALUES (?, ?, ?, ?)`);
            stmt.run(name, email, newsletter_signup ? 1 : 0, message || '', function(err) {
                if (err) {
                    console.error('Error inserting signature:', err);
                    res.status(500).json({ error: 'Failed to save signature' });
                } else {
                    res.json({ 
                        success: true, 
                        id: this.lastID,
                        message: 'Thank you for signing the guestbook!' 
                    });
                }
            });
            stmt.finalize();
        }
    } catch (error) {
        console.error('Error inserting signature:', error);
        res.status(500).json({ error: 'Failed to save signature' });
    }
});

app.get('/api/entries', (req, res) => {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 20;
    const offset = (page - 1) * limit;
    
    db.get('SELECT COUNT(*) as total FROM signatures', (err, countRow) => {
        if (err) {
            console.error('Error counting entries:', err);
            return res.status(500).json({ error: 'Failed to fetch entries' });
        }
        
        db.all(`SELECT id, name, message, timestamp 
                FROM signatures 
                ORDER BY timestamp DESC 
                LIMIT ? OFFSET ?`, 
                [limit, offset], 
                (err, rows) => {
            if (err) {
                console.error('Error fetching entries:', err);
                res.status(500).json({ error: 'Failed to fetch entries' });
            } else {
                res.json({
                    entries: rows,
                    total: countRow.total,
                    page: page,
                    totalPages: Math.ceil(countRow.total / limit)
                });
            }
        });
    });
});

app.get('/api/stats', (req, res) => {
    db.get(`SELECT 
            COUNT(*) as total_signatures,
            SUM(CASE WHEN newsletter_signup = 1 THEN 1 ELSE 0 END) as newsletter_signups
            FROM signatures`, (err, row) => {
        if (err) {
            console.error('Error fetching stats:', err);
            res.status(500).json({ error: 'Failed to fetch statistics' });
        } else {
            res.json(row);
        }
    });
});

app.post('/api/admin/login', (req, res) => {
    const { username, password } = req.body;
    
    if (username !== ADMIN_USERNAME || !bcrypt.compareSync(password, ADMIN_PASSWORD_HASH)) {
        return res.status(401).json({ error: 'Invalid credentials' });
    }
    
    const token = jwt.sign({ username }, JWT_SECRET, { expiresIn: '24h' });
    res.json({ token });
});

app.get('/api/admin/verify', authenticateToken, (req, res) => {
    res.json({ valid: true });
});

app.get('/api/admin/dashboard', authenticateToken, (req, res) => {
    const today = new Date().toISOString().split('T')[0];
    const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
    
    const stats = {};
    
    db.get(`SELECT COUNT(*) as total FROM signatures`, (err, row) => {
        stats.total = row ? row.total : 0;
        
        db.get(`SELECT COUNT(*) as newsletter FROM signatures WHERE newsletter_signup = 1`, (err, row) => {
            stats.newsletter = row ? row.newsletter : 0;
            
            db.get(`SELECT COUNT(*) as today FROM signatures WHERE date(timestamp) = date('${today}')`, (err, row) => {
                stats.today = row ? row.today : 0;
                
                db.get(`SELECT COUNT(*) as week FROM signatures WHERE date(timestamp) >= date('${weekAgo}')`, (err, row) => {
                    stats.week = row ? row.week : 0;
                    
                    db.all(`SELECT date(timestamp) as date, COUNT(*) as count 
                            FROM signatures 
                            WHERE date(timestamp) >= date('${weekAgo}')
                            GROUP BY date(timestamp)
                            ORDER BY date(timestamp)`, (err, dailyStats) => {
                        
                        db.all(`SELECT * FROM signatures 
                                ORDER BY timestamp DESC 
                                LIMIT 10`, (err, recentEntries) => {
                            
                            res.json({
                                stats,
                                dailyStats: dailyStats || [],
                                recentEntries: recentEntries || []
                            });
                        });
                    });
                });
            });
        });
    });
});

app.get('/api/admin/export/all', authenticateToken, (req, res) => {
    db.all(`SELECT name, email, newsletter_signup, message, timestamp 
            FROM signatures 
            ORDER BY timestamp DESC`, (err, rows) => {
        if (err) {
            console.error('Error exporting data:', err);
            res.status(500).json({ error: 'Failed to export data' });
        } else {
            let csv = 'Name,Email,Newsletter Signup,Message,Timestamp\n';
            rows.forEach(row => {
                csv += `"${row.name}","${row.email}","${row.newsletter_signup ? 'Yes' : 'No'}","${row.message || ''}","${row.timestamp}"\n`;
            });
            
            res.setHeader('Content-Type', 'text/csv');
            res.setHeader('Content-Disposition', 'attachment; filename="all_guestbook_entries.csv"');
            res.send(csv);
        }
    });
});

app.get('/api/admin/export/newsletter', authenticateToken, (req, res) => {
    db.all(`SELECT email, name, timestamp 
            FROM signatures 
            WHERE newsletter_signup = 1
            ORDER BY timestamp DESC`, (err, rows) => {
        if (err) {
            console.error('Error exporting newsletter data:', err);
            res.status(500).json({ error: 'Failed to export data' });
        } else {
            let csv = 'Email Address,First Name,Last Name,Tags,Subscribe Date\n';
            rows.forEach(row => {
                const names = row.name.split(' ');
                const firstName = names[0] || '';
                const lastName = names.slice(1).join(' ') || '';
                const subscribeDate = new Date(row.timestamp).toISOString().split('T')[0];
                csv += `"${row.email}","${firstName}","${lastName}","Born to Run Exhibit","${subscribeDate}"\n`;
            });
            
            res.setHeader('Content-Type', 'text/csv');
            res.setHeader('Content-Disposition', 'attachment; filename="mailchimp_newsletter_subscribers.csv"');
            res.send(csv);
        }
    });
});

app.get('/api/admin/export/range', authenticateToken, (req, res) => {
    const { start, end } = req.query;
    
    if (!start || !end) {
        return res.status(400).json({ error: 'Start and end dates required' });
    }
    
    db.all(`SELECT name, email, newsletter_signup, message, timestamp 
            FROM signatures 
            WHERE date(timestamp) >= date(?) AND date(timestamp) <= date(?)
            ORDER BY timestamp DESC`, [start, end], (err, rows) => {
        if (err) {
            console.error('Error exporting data:', err);
            res.status(500).json({ error: 'Failed to export data' });
        } else {
            let csv = 'Name,Email,Newsletter Signup,Message,Timestamp\n';
            rows.forEach(row => {
                csv += `"${row.name}","${row.email}","${row.newsletter_signup ? 'Yes' : 'No'}","${row.message || ''}","${row.timestamp}"\n`;
            });
            
            res.setHeader('Content-Type', 'text/csv');
            res.setHeader('Content-Disposition', `attachment; filename="guestbook_${start}_to_${end}.csv"`);
            res.send(csv);
        }
    });
});

app.listen(PORT, () => {
    console.log(`Guestbook server running on http://localhost:${PORT}`);
    console.log(`Admin panel at http://localhost:${PORT}/admin.html`);
    console.log(`Default admin credentials: ${ADMIN_USERNAME} / ${process.env.ADMIN_PASSWORD || 'admin123'}`);
});

process.on('SIGINT', () => {
    console.log('\nShutting down gracefully...');
    db.close((err) => {
        if (err) {
            console.error(err.message);
        }
        console.log('Database connection closed.');
        process.exit(0);
    });
});