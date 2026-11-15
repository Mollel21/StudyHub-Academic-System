
const express = require('express');
const router = express.Router();

const { protect } = require('../middleware/authMiddleware');

const {
    createStudySession,
    getStudySessions
} = require('../controllers/studySessionController');

// Protect all study session routes
router.use(protect);

// Save a study session
router.post('/', createStudySession);

// Get logged-in student's study history
router.get('/', getStudySessions);

module.exports = router;
