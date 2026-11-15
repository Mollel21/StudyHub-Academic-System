
const pool = require('../config/db');

// CREATE STUDY SESSION
const createStudySession = async (req, res) => {
    try {
        const {
            timer_mode,
            planned_seconds,
            actual_seconds,
            status,
            started_at,
            completed_at
        } = req.body;

        const userId = req.user.id;

        // Validate timer mode
        if (!['countdown', 'stopwatch'].includes(timer_mode)) {
            return res.status(400).json({
                status: 'error',
                message: 'Invalid timer mode.'
            });
        }

        // Validate duration values
        const planned = Number(planned_seconds);
        const actual = Number(actual_seconds);

        if (
            !Number.isInteger(planned) ||
            !Number.isInteger(actual) ||
            planned < 0 ||
            actual < 0 ||
            actual > 31536000 ||
            planned > 31536000
        ) {
            return res.status(400).json({
                status: 'error',
                message: 'Invalid study duration.'
            });
        }

        // Validate session status
        const sessionStatus = status || 'completed';

        if (!['completed', 'cancelled'].includes(sessionStatus)) {
            return res.status(400).json({
                status: 'error',
                message: 'Invalid session status.'
            });
        }

        // Validate optional dates
        const validDate = (value) =>
            value && !Number.isNaN(Date.parse(value));

        if (started_at && !validDate(started_at)) {
            return res.status(400).json({
                status: 'error',
                message: 'Invalid start date.'
            });
        }

        if (completed_at && !validDate(completed_at)) {
            return res.status(400).json({
                status: 'error',
                message: 'Invalid completion date.'
            });
        }

const result = await pool.query(
    `INSERT INTO study_sessions (
        user_id,
        timer_mode,
        planned_seconds,
        actual_seconds,
        status,
        started_at,
        completed_at
    )
    VALUES (
        $1, $2, $3, $4, $5::VARCHAR,
        COALESCE($6::TIMESTAMP, CURRENT_TIMESTAMP),
        CASE
            WHEN $5::VARCHAR = 'completed'
            THEN COALESCE($7::TIMESTAMP, CURRENT_TIMESTAMP)
            ELSE $7::TIMESTAMP
        END
    )
    RETURNING *`,
    [
        userId,
        timer_mode,
        planned,
        actual,
        sessionStatus,
        started_at || null,
        completed_at || null
    ]
);


        return res.status(201).json({
            status: 'success',
            message: 'Study session saved successfully.',
            session: result.rows[0]
        });

    } catch (error) {
        console.error('Create Study Session Error:', error);

        return res.status(500).json({
            status: 'error',
            message: 'Failed to save study session.'
        });
    }
};


// GET STUDY SESSION HISTORY
const getStudySessions = async (req, res) => {
    try {
        const userId = req.user.id;

        const result = await pool.query(
            `SELECT *
             FROM study_sessions
             WHERE user_id = $1
             ORDER BY started_at DESC`,
            [userId]
        );

        return res.status(200).json({
            status: 'success',
            count: result.rows.length,
            sessions: result.rows
        });

    } catch (error) {
        console.error('Get Study Sessions Error:', error);

        return res.status(500).json({
            status: 'error',
            message: 'Failed to retrieve study sessions.'
        });
    }
};


module.exports = {
    createStudySession,
    getStudySessions
};
