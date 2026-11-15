
const express = require('express');
const router = express.Router();

const { protect, adminOnly } = require('../middleware/authMiddleware');

const {
    getAdminSummary,
    getAllUsers,
    updateUserStatus,
    adminResetStudentPassword,
    getAdminAuditLogs,
    getAdminReports,
    getPlatformSettings,
    updatePlatformSetting
} = require('../controllers/adminController');

// Test Admin Access
router.get('/test', protect, adminOnly, (req, res) => {
    res.status(200).json({
        status: 'success',
        message: 'Administrator access granted.',
        admin: req.user
    });
});

// GET ADMIN DASHBOARD SUMMARY
router.get('/summary', protect, adminOnly, getAdminSummary);

// GET ALL USERS
router.get('/users', protect, adminOnly, getAllUsers);

// ACTIVATE OR DEACTIVATE USER ACCOUNT
router.patch('/users/:id/status', protect, adminOnly, updateUserStatus);

router.patch(
    '/users/:id/reset-password',
    protect,
    adminOnly,
    adminResetStudentPassword
);

// GET ADMIN AUDIT LOGS
router.get('/audit-logs', protect, adminOnly, getAdminAuditLogs);

// GET ADMIN SYSTEM REPORTS
router.get('/reports', protect, adminOnly, getAdminReports);

// GET PLATFORM SETTINGS
router.get('/settings', protect, adminOnly, getPlatformSettings);

// UPDATE PLATFORM SETTING
router.patch('/settings/:id', protect, adminOnly, updatePlatformSetting);

module.exports = router;
