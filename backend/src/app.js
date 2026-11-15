
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');

const pool = require('./config/db');

const app = express();

// Import routes
const authRoutes = require('./routes/authRoutes');
const universityRoutes = require('./routes/universityRoutes');
const libraryRoutes = require('./routes/libraryRoutes');
const timetableRoutes = require('./routes/timetableRoutes');
const studySessionRoutes = require('./routes/studySessionRoutes');
const goalRoutes = require('./routes/goalRoutes');
const taskRoutes = require('./routes/taskRoutes');
const reminderRoutes = require('./routes/reminderRouter');
const pushRoutes = require('./routes/pushRoutes');
const progressRoutes = require('./routes/progressRoutes');
const searchRoutes = require('./routes/searchRoutes');
const adminRoutes = require('./routes/adminRoutes');

// Security and middleware
app.use(helmet());
app.use(cors());
app.use(express.json());

// API routes
app.use('/api/auth', authRoutes);
app.use('/api/universities', universityRoutes);
app.use('/api/library', libraryRoutes);
app.use('/api/timetable', timetableRoutes);
app.use('/api/study-sessions', studySessionRoutes);
app.use('/api/goals', goalRoutes);
app.use('/api/tasks', taskRoutes);
app.use('/api/reminders', reminderRoutes);
app.use('/api/push', pushRoutes);
app.use('/api/progress', progressRoutes);
app.use('/api/search', searchRoutes);
app.use('/api/admin', adminRoutes);

// Welcome route
app.get('/', (req, res) => {
    res.json({
        message: 'Welcome to StudyHub API',
        status: 'Running'
    });
});

// API health check
app.get('/api/health', (req, res) => {
    res.json({
        status: 'success',
        message: 'StudyHub API is working'
    });
});

// Database health check
app.get('/api/db-health', async (req, res) => {
    try {
        const result = await pool.query('SELECT NOW() AS server_time');

        res.json({
            status: 'success',
            message: 'Database connected successfully',
            serverTime: result.rows[0].server_time
        });
    } catch (error) {
        console.error('Database connection error:', error.message);

        res.status(500).json({
            status: 'error',
            message: 'Database connection failed'
        });
    }
});

module.exports = app;
