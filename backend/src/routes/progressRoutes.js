
const express = require('express');
const router = express.Router();

const { protect } = require('../middleware/authMiddleware');

const {
    getProgress
} = require('../controllers/progressController');

// Protect all progress routes
router.use(protect);

// GET student progress
router.get('/', getProgress);

module.exports = router;
