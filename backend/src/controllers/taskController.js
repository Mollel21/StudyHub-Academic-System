
const pool = require('../config/db');

// CREATE A NEW TASK
const createTask = async (req, res) => {
    try {
        const userId = req.user.id;

        const {
            goal_id,
            title,
            description,
            due_date,
            priority
        } = req.body;

        if (!title || !title.trim()) {
            return res.status(400).json({
                success: false,
                message: 'Task title is required.'
            });
        }

        const selectedPriority = priority || 'medium';

        if (!['low', 'medium', 'high'].includes(selectedPriority)) {
            return res.status(400).json({
                success: false,
                message: 'Invalid priority value.'
            });
        }

        // Check whether the selected goal belongs to this user
        if (goal_id !== undefined && goal_id !== null) {
            const goal = await pool.query(
                `SELECT id FROM goals
                 WHERE id = $1 AND user_id = $2`,
                [goal_id, userId]
            );

            if (goal.rows.length === 0) {
                return res.status(404).json({
                    success: false,
                    message: 'Goal not found.'
                });
            }
        }

        const result = await pool.query(
            `INSERT INTO tasks (
                user_id,
                goal_id,
                title,
                description,
                due_date,
                priority
            )
            VALUES ($1, $2, $3, $4, $5, $6)
            RETURNING *`,
            [
                userId,
                goal_id || null,
                title.trim(),
                description || null,
                due_date || null,
                selectedPriority
            ]
        );

        res.status(201).json({
            success: true,
            message: 'Task created successfully.',
            task: result.rows[0]
        });

    } catch (error) {
        console.error('Create Task Error:', error);

        res.status(500).json({
            success: false,
            message: 'Server error while creating task.'
        });
    }
};


// GET ALL TASKS
const getTasks = async (req, res) => {
    try {
        const userId = req.user.id;

        const result = await pool.query(
            `SELECT
                tasks.*,
                goals.title AS goal_title
             FROM tasks
             LEFT JOIN goals ON tasks.goal_id = goals.id
             WHERE tasks.user_id = $1
             ORDER BY tasks.created_at DESC`,
            [userId]
        );

        res.status(200).json({
            success: true,
            count: result.rows.length,
            tasks: result.rows
        });

    } catch (error) {
        console.error('Get Tasks Error:', error);

        res.status(500).json({
            success: false,
            message: 'Server error while retrieving tasks.'
        });
    }
};


// UPDATE A TASK
const updateTask = async (req, res) => {
    try {
        const userId = req.user.id;
        const taskId = req.params.id;

        const {
            goal_id,
            title,
            description,
            due_date,
            priority,
            status
        } = req.body;

        if (title !== undefined && !title.trim()) {
            return res.status(400).json({
                success: false,
                message: 'Task title cannot be empty.'
            });
        }

        if (
            priority !== undefined &&
            !['low', 'medium', 'high'].includes(priority)
        ) {
            return res.status(400).json({
                success: false,
                message: 'Invalid priority value.'
            });
        }

        if (
            status !== undefined &&
            !['pending', 'in_progress', 'completed'].includes(status)
        ) {
            return res.status(400).json({
                success: false,
                message: 'Invalid task status.'
            });
        }

        // Check goal ownership when assigning a goal
        if (goal_id !== undefined && goal_id !== null) {
            const goal = await pool.query(
                `SELECT id FROM goals
                 WHERE id = $1 AND user_id = $2`,
                [goal_id, userId]
            );

            if (goal.rows.length === 0) {
                return res.status(404).json({
                    success: false,
                    message: 'Goal not found.'
                });
            }
        }

        const updates = {
            goal_id,
            title: title === undefined ? undefined : title.trim(),
            description,
            due_date,
            priority,
            status
        };

        const fields = [];
        const values = [];

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

        if (status === 'completed') {
            fields.push('completed_at = CURRENT_TIMESTAMP');
        } else if (status !== undefined) {
            fields.push('completed_at = NULL');
        }

        fields.push('updated_at = CURRENT_TIMESTAMP');

        values.push(taskId);
        values.push(userId);

        const result = await pool.query(
            `UPDATE tasks
             SET ${fields.join(', ')}
             WHERE id = $${values.length - 1}
             AND user_id = $${values.length}
             RETURNING *`,
            values
        );

        if (result.rows.length === 0) {
            return res.status(404).json({
                success: false,
                message: 'Task not found.'
            });
        }

        res.status(200).json({
            success: true,
            message: 'Task updated successfully.',
            task: result.rows[0]
        });

    } catch (error) {
        console.error('Update Task Error:', error);

        res.status(500).json({
            success: false,
            message: 'Server error while updating task.'
        });
    }
};


// DELETE A TASK
const deleteTask = async (req, res) => {
    try {
        const userId = req.user.id;
        const taskId = req.params.id;

        const result = await pool.query(
            `DELETE FROM tasks
             WHERE id = $1 AND user_id = $2
             RETURNING *`,
            [taskId, userId]
        );

        if (result.rows.length === 0) {
            return res.status(404).json({
                success: false,
                message: 'Task not found.'
            });
        }

        res.status(200).json({
            success: true,
            message: 'Task deleted successfully.'
        });

    } catch (error) {
        console.error('Delete Task Error:', error);

        res.status(500).json({
            success: false,
            message: 'Server error while deleting task.'
        });
    }
};


module.exports = {
    createTask,
    getTasks,
    updateTask,
    deleteTask
};
