
const pool = require('../config/db');

// CREATE A NEW GOAL
const createGoal = async (req, res) => {
    try {
        const userId = req.user.id;

        const {
            title,
            description,
            target_date,
            priority
        } = req.body;

        if (!title || !title.trim()) {
            return res.status(400).json({
                success: false,
                message: 'Goal title is required.'
            });
        }

        const validPriorities = ['low', 'medium', 'high'];

        const selectedPriority = priority || 'medium';

        if (!validPriorities.includes(selectedPriority)) {
            return res.status(400).json({
                success: false,
                message: 'Invalid priority value.'
            });
        }

        const result = await pool.query(
            `INSERT INTO goals (
                user_id,
                title,
                description,
                target_date,
                priority
            )
            VALUES ($1, $2, $3, $4, $5)
            RETURNING *`,
            [
                userId,
                title.trim(),
                description || null,
                target_date || null,
                selectedPriority
            ]
        );

        res.status(201).json({
            success: true,
            message: 'Goal created successfully.',
            goal: result.rows[0]
        });

    } catch (error) {
        console.error('Create Goal Error:', error);

        res.status(500).json({
            success: false,
            message: 'Server error while creating goal.'
        });
    }
};


// GET ALL GOALS FOR LOGGED-IN USER
const getGoals = async (req, res) => {
    try {
        const userId = req.user.id;

        const result = await pool.query(
            `SELECT *
             FROM goals
             WHERE user_id = $1
             ORDER BY created_at DESC`,
            [userId]
        );

        res.status(200).json({
            success: true,
            count: result.rows.length,
            goals: result.rows
        });

    } catch (error) {
        console.error('Get Goals Error:', error);

        res.status(500).json({
            success: false,
            message: 'Server error while retrieving goals.'
        });
    }
};


// UPDATE A GOAL
const updateGoal = async (req, res) => {
    try {
        const userId = req.user.id;
        const goalId = req.params.id;

        const {
            title,
            description,
            target_date,
            priority,
            status
        } = req.body;

        const allowedPriorities = ['low', 'medium', 'high'];
        const allowedStatuses = ['active', 'completed', 'cancelled'];

        if (priority !== undefined &&
            !allowedPriorities.includes(priority)) {
            return res.status(400).json({
                success: false,
                message: 'Invalid priority value.'
            });
        }

        if (status !== undefined &&
            !allowedStatuses.includes(status)) {
            return res.status(400).json({
                success: false,
                message: 'Invalid goal status.'
            });
        }

        if (title !== undefined && !title.trim()) {
            return res.status(400).json({
                success: false,
                message: 'Goal title cannot be empty.'
            });
        }

        const fields = [];
        const values = [];

        const updates = {
            title: title === undefined ? undefined : title.trim(),
            description,
            target_date,
            priority,
            status
        };

        for (const [field, value] of Object.entries(updates)) {
            if (value !== undefined) {
                values.push(value);
                fields.push(`${field} = $${values.length}`);
            }
        }

        if (fields.length === 0) {
            return res.status(400).json({
                success: false,
                message: 'Provide at least one field to update.'
            });
        }

        fields.push('updated_at = CURRENT_TIMESTAMP');

        values.push(goalId);
        values.push(userId);

        const result = await pool.query(
            `UPDATE goals
             SET ${fields.join(', ')}
             WHERE id = $${values.length - 1}
             AND user_id = $${values.length}
             RETURNING *`,
            values
        );

        if (result.rows.length === 0) {
            return res.status(404).json({
                success: false,
                message: 'Goal not found.'
            });
        }

        res.status(200).json({
            success: true,
            message: 'Goal updated successfully.',
            goal: result.rows[0]
        });

    } catch (error) {
        console.error('Update Goal Error:', error);

        res.status(500).json({
            success: false,
            message: 'Server error while updating goal.'
        });
    }
};


// DELETE A GOAL
const deleteGoal = async (req, res) => {
    try {
        const userId = req.user.id;
        const goalId = req.params.id;

        const result = await pool.query(
            `DELETE FROM goals
             WHERE id = $1 AND user_id = $2
             RETURNING *`,
            [goalId, userId]
        );

        if (result.rows.length === 0) {
            return res.status(404).json({
                success: false,
                message: 'Goal not found.'
            });
        }

        res.status(200).json({
            success: true,
            message: 'Goal deleted successfully.'
        });

    } catch (error) {
        console.error('Delete Goal Error:', error);

        res.status(500).json({
            success: false,
            message: 'Server error while deleting goal.'
        });
    }
};


module.exports = {
    createGoal,
    getGoals,
    updateGoal,
    deleteGoal
};
