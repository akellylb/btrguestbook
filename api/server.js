require('dotenv').config();
const express = require('express');
const bodyParser = require('body-parser');
const cors = require('cors');
const path = require('path');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');

const app = express();

app.use(cors());
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));

// Serve static files from public directory
app.use(express.static(path.join(__dirname, '../public')));

const JWT_SECRET = process.env.JWT_SECRET || 'default-secret-change-this';
const ADMIN_USERNAME = process.env.ADMIN_USERNAME || 'admin';
const ADMIN_PASSWORD_HASH = bcrypt.hashSync(process.env.ADMIN_PASSWORD || 'admin123', 10);

// Database setup for Vercel (PostgreSQL only)
let db;

if (process.env.POSTGRES_URL || process.env.POSTGRES_PRISMA_URL) {
    const { Pool } = require('pg');
    const connectionString = process.env.POSTGRES_URL || process.env.DATABASE_URL;
    db = new Pool({
        connectionString,
        ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
    });
    
    console.log('Using PostgreSQL database');
    initDatabase();
}

async function initDatabase() {
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

// Serve main page
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, '../public/index.html'));
});

// Serve admin page
app.get('/admin.html', (req, res) => {
    res.sendFile(path.join(__dirname, '../public/admin.html'));
});

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
        const result = await db.query(
            'INSERT INTO signatures (name, email, newsletter_signup, message) VALUES ($1, $2, $3, $4) RETURNING id',
            [name, email, newsletter_signup || false, message || '']
        );
        res.json({ 
            success: true, 
            id: result.rows[0].id,
            message: 'Thank you for signing the guestbook!' 
        });
    } catch (error) {
        console.error('Error inserting signature:', error);
        res.status(500).json({ error: 'Failed to save signature' });
    }
});

app.get('/api/entries', async (req, res) => {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 20;
    const offset = (page - 1) * limit;
    
    try {
        const countResult = await db.query('SELECT COUNT(*) as count FROM signatures');
        const total = parseInt(countResult.rows[0].count);
        
        const result = await db.query(
            'SELECT id, name, message, timestamp FROM signatures ORDER BY timestamp DESC LIMIT $1 OFFSET $2',
            [limit, offset]
        );
        
        res.json({
            entries: result.rows,
            total: total,
            page: page,
            totalPages: Math.ceil(total / limit)
        });
    } catch (error) {
        console.error('Error fetching entries:', error);
        res.status(500).json({ error: 'Failed to fetch entries' });
    }
});

app.get('/api/stats', async (req, res) => {
    try {
        const result = await db.query(`
            SELECT 
                COUNT(*) as total_signatures,
                SUM(CASE WHEN newsletter_signup = true THEN 1 ELSE 0 END) as newsletter_signups
            FROM signatures
        `);
        res.json({
            total_signatures: parseInt(result.rows[0].total_signatures),
            newsletter_signups: parseInt(result.rows[0].newsletter_signups)
        });
    } catch (error) {
        console.error('Error fetching stats:', error);
        res.status(500).json({ error: 'Failed to fetch statistics' });
    }
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

app.get('/api/admin/dashboard', authenticateToken, async (req, res) => {
    try {
        const today = new Date().toISOString().split('T')[0];
        const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
        
        const [totalResult, newsletterResult, todayResult, weekResult, dailyResult, recentResult] = await Promise.all([
            db.query('SELECT COUNT(*) as total FROM signatures'),
            db.query('SELECT COUNT(*) as newsletter FROM signatures WHERE newsletter_signup = true'),
            db.query('SELECT COUNT(*) as today FROM signatures WHERE DATE(timestamp) = $1', [today]),
            db.query('SELECT COUNT(*) as week FROM signatures WHERE DATE(timestamp) >= $1', [weekAgo]),
            db.query(`SELECT DATE(timestamp) as date, COUNT(*) as count 
                     FROM signatures 
                     WHERE DATE(timestamp) >= $1
                     GROUP BY DATE(timestamp)
                     ORDER BY date`, [weekAgo]),
            db.query('SELECT * FROM signatures ORDER BY timestamp DESC LIMIT 10')
        ]);
        
        res.json({
            stats: {
                total: parseInt(totalResult.rows[0].total),
                newsletter: parseInt(newsletterResult.rows[0].newsletter),
                today: parseInt(todayResult.rows[0].today),
                week: parseInt(weekResult.rows[0].week)
            },
            dailyStats: dailyResult.rows,
            recentEntries: recentResult.rows
        });
    } catch (error) {
        console.error('Error fetching dashboard data:', error);
        res.status(500).json({ error: 'Failed to fetch dashboard data' });
    }
});

app.get('/api/admin/export/all', authenticateToken, async (req, res) => {
    try {
        const result = await db.query('SELECT name, email, newsletter_signup, message, timestamp FROM signatures ORDER BY timestamp DESC');
        const rows = result.rows;
        
        let csv = 'Name,Email,Newsletter Signup,Message,Timestamp\n';
        rows.forEach(row => {
            const newsletterSignup = row.newsletter_signup ? 'Yes' : 'No';
            csv += `"${row.name}","${row.email}","${newsletterSignup}","${row.message || ''}","${row.timestamp}"\n`;
        });
        
        res.setHeader('Content-Type', 'text/csv');
        res.setHeader('Content-Disposition', 'attachment; filename="all_guestbook_entries.csv"');
        res.send(csv);
    } catch (error) {
        console.error('Error exporting data:', error);
        res.status(500).json({ error: 'Failed to export data' });
    }
});

app.get('/api/admin/export/newsletter', authenticateToken, async (req, res) => {
    try {
        const result = await db.query('SELECT email, name, timestamp FROM signatures WHERE newsletter_signup = true ORDER BY timestamp DESC');
        const rows = result.rows;
        
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
    } catch (error) {
        console.error('Error exporting newsletter data:', error);
        res.status(500).json({ error: 'Failed to export data' });
    }
});

app.get('/api/admin/export/range', authenticateToken, async (req, res) => {
    const { start, end } = req.query;
    
    if (!start || !end) {
        return res.status(400).json({ error: 'Start and end dates required' });
    }
    
    try {
        const result = await db.query(
            'SELECT name, email, newsletter_signup, message, timestamp FROM signatures WHERE DATE(timestamp) >= $1 AND DATE(timestamp) <= $2 ORDER BY timestamp DESC',
            [start, end]
        );
        const rows = result.rows;
        
        let csv = 'Name,Email,Newsletter Signup,Message,Timestamp\n';
        rows.forEach(row => {
            const newsletterSignup = row.newsletter_signup ? 'Yes' : 'No';
            csv += `"${row.name}","${row.email}","${newsletterSignup}","${row.message || ''}","${row.timestamp}"\n`;
        });
        
        res.setHeader('Content-Type', 'text/csv');
        res.setHeader('Content-Disposition', `attachment; filename="guestbook_${start}_to_${end}.csv"`);
        res.send(csv);
    } catch (error) {
        console.error('Error exporting data:', error);
        res.status(500).json({ error: 'Failed to export data' });
    }
});

module.exports = app;