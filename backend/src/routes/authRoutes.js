
const express = require('express');
const router = express.Router();

const {
    registerStudent,
    loginStudent,
    getCurrentStudent,
    updateStudentProfile,
    changeStudentPassword,
    getStudentPreferences,
    updateStudentPreferences,
    requestAccountDeletion,
    getAccountDeletionStatus
} = require('../controllers/authController');

const {
    requestPasswordReset,
    verifyPasswordResetOTP,
    resetStudentPassword
} = require('../controllers/passwordResetController');

const { protect } = require('../middleware/authMiddleware');

// Student registration
router.post('/register', registerStudent);

// Student login
router.post('/login', loginStudent);

// Get currently logged-in student
router.get('/me', protect, getCurrentStudent);

// Update student profile
router.put('/profile', protect, updateStudentProfile);

// Change student password
router.put('/change-password', protect, changeStudentPassword);

// Get student preferences
router.get('/preferences', protect, getStudentPreferences);

// Update student preferences
router.put('/preferences', protect, updateStudentPreferences);

// Request account deletion
router.post('/request-deletion', protect, requestAccountDeletion);

// Get account deletion status
router.get('/deletion-status', protect, getAccountDeletionStatus);

// Request password reset OTP
router.post('/forgot-password', requestPasswordReset);

router.post('/verify-reset-otp', verifyPasswordResetOTP);

router.post('/reset-password', resetStudentPassword);

module.exports = router;
