
const express = require('express');
const router = express.Router();

const { protect } = require('../middleware/authMiddleware');

const {
    createReminder,
    getReminders,
    updateReminder,
    deleteReminder
} = require('../controllers/reminderController');

// Protect all reminder routes
router.use(protect);

// Create a reminder
router.post('/', createReminder);

// Get all reminders
router.get('/', getReminders);

// Update a reminder
router.put('/:id', updateReminder);

// Delete a reminder
router.delete('/:id', deleteReminder);

module.exports = router;
