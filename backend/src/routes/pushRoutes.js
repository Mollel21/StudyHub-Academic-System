
const express = require('express');
const router = express.Router();

const { protect } = require('../middleware/authMiddleware');

const {
    getPublicKey,
    subscribe,
    unsubscribe
} = require('../controllers/pushController');

// Public key can be requested by the frontend
router.get('/public-key', getPublicKey);

// Protect subscription management routes
router.use(protect);

router.post('/subscribe', subscribe);
router.post('/unsubscribe', unsubscribe);

module.exports = router;
