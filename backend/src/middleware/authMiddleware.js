
const jwt = require('jsonwebtoken');
const pool = require('../config/db');

const protect = async (req, res, next) => {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return res.status(401).json({
            status: 'error',
            message: 'Access denied. Please login first.'
        });
    }

    const token = authHeader.split(' ')[1];

    try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET);

        req.user = decoded;

        // CHECK CURRENT USER STATUS IN DATABASE
        const result = await pool.query(
            `SELECT id, role, must_change_password, is_active
             FROM users
             WHERE id = $1`,
            [decoded.id]
        );

        if (result.rows.length === 0 || !result.rows[0].is_active) {
            return res.status(401).json({
                status: 'error',
                message: 'Your account is unavailable. Please contact support.'
            });
        }

        const currentUser = result.rows[0];

        req.user.role = currentUser.role;
        req.user.mustChangePassword =
            currentUser.must_change_password;

        // FORCE STUDENT TO CHANGE TEMPORARY PASSWORD
        if (
            currentUser.role === 'student' &&
            currentUser.must_change_password === true &&
            req.path !== '/change-password'
        ) {
            return res.status(403).json({
                status: 'error',
                code: 'PASSWORD_CHANGE_REQUIRED',
                message: 'You must change your temporary password before continuing.'
            });
        }

        next();

    } catch (error) {
        if (error.name === 'JsonWebTokenError' ||
            error.name === 'TokenExpiredError') {
            return res.status(401).json({
                status: 'error',
                message: 'Invalid or expired token.'
            });
        }

        console.error('Authentication middleware error:', error.message);

        return res.status(500).json({
            status: 'error',
            message: 'Unable to verify your account.'
        });
    }
};

const adminOnly = (req, res, next) => {
    if (!req.user || req.user.role !== 'admin') {
        return res.status(403).json({
            status: 'error',
            message: 'Access denied. Administrator privileges required.'
        });
    }

    next();
};

module.exports = { protect, adminOnly };
