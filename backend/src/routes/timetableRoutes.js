
const express = require('express');
const router = express.Router();

const { protect } = require('../middleware/authMiddleware');

const {
    createTimetableEvent,
    getTimetableEvents,
    updateTimetableEvent,
    deleteTimetableEvent
} = require('../controllers/timetableController');

// All timetable routes require authentication
router.use(protect);

// GET all timetable events
router.get('/', getTimetableEvents);

// CREATE timetable event
router.post('/', createTimetableEvent);

// UPDATE timetable event
router.put('/:id', updateTimetableEvent);

// DELETE timetable event
router.delete('/:id', deleteTimetableEvent);

module.exports = router;
