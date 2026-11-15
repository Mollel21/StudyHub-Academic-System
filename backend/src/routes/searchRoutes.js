
const express = require('express');
const router = express.Router();

const { protect } = require('../middleware/authMiddleware');

const {
    searchAll
} = require('../controllers/searchController');

// Protect all search routes
router.use(protect);

// GET search results
router.get('/', searchAll);

module.exports = router;
