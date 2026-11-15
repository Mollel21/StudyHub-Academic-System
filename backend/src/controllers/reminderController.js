
const pool = require('../config/db');


// CREATE A NEW REMINDER
const createReminder = async (req, res) => {
    try {
        const userId = req.user.id;

        const {
            title,
            description,
            reminder_date,
            reminder_time
        } = req.body;

        if (!title || !title.trim()) {
            return res.status(400).json({
                success: false,
                message: 'Reminder title is required.'
            });
        }

        if (!reminder_date || !reminder_time) {
            return res.status(400).json({
                success: false,
                message: 'Reminder date and time are required.'
            });
        }

        const result = await pool.query(
            `INSERT INTO reminders (
                user_id,
                title,
                description,
                reminder_date,
                reminder_time
            )
            VALUES ($1, $2, $3, $4, $5)
            RETURNING *`,
            [
                userId,
                title.trim(),
                description || null,
                reminder_date,
                reminder_time
            ]
        );

        res.status(201).json({
            success: true,
            message: 'Reminder created successfully.',
            reminder: result.rows[0]
        });

    } catch (error) {
        console.error('Create Reminder Error:', error);

        res.status(500).json({
            success: false,
            message: 'Server error while creating reminder.'
        });
    }
};


// GET ALL REMINDERS
const getReminders = async (req, res) => {
    try {
        const userId = req.user.id;

        const result = await pool.query(
            `SELECT *
             FROM reminders
             WHERE user_id = $1
             ORDER BY reminder_date ASC, reminder_time ASC`,
            [userId]
        );

        res.status(200).json({
            success: true,
            count: result.rows.length,
            reminders: result.rows
        });

    } catch (error) {
        console.error('Get Reminders Error:', error);

        res.status(500).json({
            success: false,
            message: 'Server error while retrieving reminders.'
        });
    }
};


// UPDATE A REMINDER
const updateReminder = async (req, res) => {
    try {
        const userId = req.user.id;
        const reminderId = req.params.id;

        const {
            title,
            description,
            reminder_date,
            reminder_time,
            status
        } = req.body;

        if (title !== undefined && (typeof title !== 'string' || !title.trim())) {
            return res.status(400).json({
                success: false,
                message: 'Reminder title cannot be empty.'
            });
        }

        if (
            status !== undefined &&
            !['pending', 'completed', 'cancelled'].includes(status)
        ) {
            return res.status(400).json({
                success: false,
                message: 'Invalid reminder status.'
            });
        }

        const updates = {
            title: title === undefined ? undefined : title.trim(),
            description,
            reminder_date,
            reminder_time,
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

        fields.push('updated_at = CURRENT_TIMESTAMP');

        values.push(reminderId);
        values.push(userId);

        const result = await pool.query(
            `UPDATE reminders
             SET ${fields.join(', ')}
             WHERE id = $${values.length - 1}
             AND user_id = $${values.length}
             RETURNING *`,
            values
        );

        if (result.rows.length === 0) {
            return res.status(404).json({
                success: false,
                message: 'Reminder not found.'
            });
        }

        res.status(200).json({
            success: true,
            message: 'Reminder updated successfully.',
            reminder: result.rows[0]
        });

    } catch (error) {
        console.error('Update Reminder Error:', error);

        res.status(500).json({
            success: false,
            message: 'Server error while updating reminder.'
        });
    }
};


// DELETE A REMINDER
const deleteReminder = async (req, res) => {
    try {
        const userId = req.user.id;
        const reminderId = req.params.id;

        const result = await pool.query(
            `DELETE FROM reminders
             WHERE id = $1 AND user_id = $2
             RETURNING *`,
            [reminderId, userId]
        );

        if (result.rows.length === 0) {
            return res.status(404).json({
                success: false,
                message: 'Reminder not found.'
            });
        }

        res.status(200).json({
            success: true,
            message: 'Reminder deleted successfully.'
        });

    } catch (error) {
        console.error('Delete Reminder Error:', error);

        res.status(500).json({
            success: false,
            message: 'Server error while deleting reminder.'
        });
    }
};


module.exports = {
    createReminder,
    getReminders,
    updateReminder,
    deleteReminder
};
