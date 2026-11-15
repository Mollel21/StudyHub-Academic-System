
const express = require('express');
const router = express.Router();

const { protect } = require('../middleware/authMiddleware');

const {
    createGoal,
    getGoals,
    updateGoal,
    deleteGoal
} = require('../controllers/goalController');

// Protect all goal routes
router.use(protect);

// Create a goal
router.post('/', createGoal);

// Get all goals
router.get('/', getGoals);

// Update a goal
router.put('/:id', updateGoal);

// Delete a goal
router.delete('/:id', deleteGoal);

module.exports = router;
