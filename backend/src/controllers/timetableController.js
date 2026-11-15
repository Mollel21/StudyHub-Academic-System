
const pool = require('../config/db');

const VALID_DAYS = [
    'Monday', 'Tuesday', 'Wednesday', 'Thursday',
    'Friday', 'Saturday', 'Sunday'
];

// VALIDATION FUNCTION
const validateTimetable = (data) => {
    const {
        subject_name,
        day_of_week,
        start_time,
        end_time
    } = data;

    if (subject_name !== undefined &&
        (typeof subject_name !== 'string' || !subject_name.trim())) {
        return 'Subject name must be valid';
    }

    if (day_of_week !== undefined &&
        !VALID_DAYS.includes(day_of_week)) {
        return 'Invalid day of the week';
    }

    const timePattern = /^([01]\d|2[0-3]):([0-5]\d)(:[0-5]\d)?$/;

    if (start_time !== undefined && !timePattern.test(start_time)) {
        return 'Invalid start time format. Use HH:MM';
    }

    if (end_time !== undefined && !timePattern.test(end_time)) {
        return 'Invalid end time format. Use HH:MM';
    }

    if (start_time && end_time && start_time >= end_time) {
        return 'End time must be later than start time';
    }

    return null;
};

// CHECK TIME CONFLICT
const checkTimeConflict = async (
    userId, day, startTime, endTime, excludeId = null
) => {
    const result = await pool.query(
        `SELECT id, subject_name, start_time, end_time
         FROM timetable_events
         WHERE user_id = $1
         AND day_of_week = $2
         AND start_time < $4
         AND end_time > $3
         AND ($5::INTEGER IS NULL OR id <> $5)`,
        [userId, day, startTime, endTime, excludeId]
    );

    return result.rows.length > 0;
};

// CREATE TIMETABLE EVENT
const createTimetableEvent = async (req, res) => {
    try {
        const {
            subject_name,
            course_code,
            day_of_week,
            start_time,
            end_time,
            venue,
            lecturer_name,
            notes
        } = req.body;

        const userId = req.user.id;

        if (!subject_name || !day_of_week || !start_time || !end_time) {
            return res.status(400).json({
                status: 'error',
                message: 'Subject, day, start time and end time are required'
            });
        }

        const validationError = validateTimetable(req.body);

        if (validationError) {
            return res.status(400).json({
                status: 'error',
                message: validationError
            });
        }

        const hasConflict = await checkTimeConflict(
            userId, day_of_week, start_time, end_time
        );

        if (hasConflict) {
            return res.status(409).json({
                status: 'error',
                message: 'This timetable conflicts with another event'
            });
        }

        const result = await pool.query(
            `INSERT INTO timetable_events
            (user_id, subject_name, course_code, day_of_week,
             start_time, end_time, venue, lecturer_name, notes)
             VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
             RETURNING *`,
            [
                userId,
                subject_name.trim(),
                course_code || null,
                day_of_week,
                start_time,
                end_time,
                venue || null,
                lecturer_name || null,
                notes || null
            ]
        );

        res.status(201).json({
            status: 'success',
            message: 'Timetable event created successfully',
            event: result.rows[0]
        });

    } catch (error) {
        console.error('Create timetable error:', error.message);
        res.status(500).json({
            status: 'error',
            message: 'Failed to create timetable event'
        });
    }
};

// GET ALL USER TIMETABLE EVENTS
const getTimetableEvents = async (req, res) => {
    try {
        const userId = req.user.id;

        const result = await pool.query(
            `SELECT * FROM timetable_events
             WHERE user_id = $1
             ORDER BY
             CASE day_of_week
                WHEN 'Monday' THEN 1
                WHEN 'Tuesday' THEN 2
                WHEN 'Wednesday' THEN 3
                WHEN 'Thursday' THEN 4
                WHEN 'Friday' THEN 5
                WHEN 'Saturday' THEN 6
                WHEN 'Sunday' THEN 7
             END,
             start_time ASC`,
            [userId]
        );

        res.status(200).json({
            status: 'success',
            count: result.rows.length,
            events: result.rows
        });

    } catch (error) {
        console.error('Get timetable error:', error.message);
        res.status(500).json({
            status: 'error',
            message: 'Failed to retrieve timetable'
        });
    }
};

// UPDATE TIMETABLE EVENT
const updateTimetableEvent = async (req, res) => {
    try {
        const userId = req.user.id;
        const eventId = req.params.id;

        if (!/^\d+$/.test(eventId)) {
            return res.status(400).json({
                status: 'error',
                message: 'Invalid timetable event ID'
            });
        }

        const {
            subject_name,
            course_code,
            day_of_week,
            start_time,
            end_time,
            venue,
            lecturer_name,
            notes
        } = req.body;

        const existing = await pool.query(
            `SELECT * FROM timetable_events
             WHERE id = $1 AND user_id = $2`,
            [eventId, userId]
        );

        if (existing.rows.length === 0) {
            return res.status(404).json({
                status: 'error',
                message: 'Timetable event not found'
            });
        }

        const current = existing.rows[0];

        const updated = {
            subject_name: subject_name ?? current.subject_name,
            day_of_week: day_of_week ?? current.day_of_week,
            start_time: start_time ?? current.start_time,
            end_time: end_time ?? current.end_time
        };

        const validationError = validateTimetable(updated);

        if (validationError) {
            return res.status(400).json({
                status: 'error',
                message: validationError
            });
        }

        const hasConflict = await checkTimeConflict(
            userId,
            updated.day_of_week,
            updated.start_time,
            updated.end_time,
            Number(eventId)
        );

        if (hasConflict) {
            return res.status(409).json({
                status: 'error',
                message: 'This timetable conflicts with another event'
            });
        }

        const result = await pool.query(
            `UPDATE timetable_events
             SET subject_name = $1,
                 course_code = $2,
                 day_of_week = $3,
                 start_time = $4,
                 end_time = $5,
                 venue = $6,
                 lecturer_name = $7,
                 notes = $8,
                 updated_at = CURRENT_TIMESTAMP
             WHERE id = $9 AND user_id = $10
             RETURNING *`,
            [
                updated.subject_name.trim(),
                course_code ?? current.course_code,
                updated.day_of_week,
                updated.start_time,
                updated.end_time,
                venue ?? current.venue,
                lecturer_name ?? current.lecturer_name,
                notes ?? current.notes,
                eventId,
                userId
            ]
        );

        res.json({
            status: 'success',
            message: 'Timetable event updated successfully',
            event: result.rows[0]
        });

    } catch (error) {
        console.error('Update timetable error:', error.message);
        res.status(500).json({
            status: 'error',
            message: 'Failed to update timetable event'
        });
    }
};

// DELETE TIMETABLE EVENT
const deleteTimetableEvent = async (req, res) => {
    try {
        const userId = req.user.id;
        const eventId = req.params.id;

        if (!/^\d+$/.test(eventId)) {
            return res.status(400).json({
                status: 'error',
                message: 'Invalid timetable event ID'
            });
        }

        const result = await pool.query(
            `DELETE FROM timetable_events
             WHERE id = $1 AND user_id = $2
             RETURNING id`,
            [eventId, userId]
        );

        if (result.rows.length === 0) {
            return res.status(404).json({
                status: 'error',
                message: 'Timetable event not found'
            });
        }

        res.json({
            status: 'success',
            message: 'Timetable event deleted successfully'
        });

    } catch (error) {
        console.error('Delete timetable error:', error.message);
        res.status(500).json({
            status: 'error',
            message: 'Failed to delete timetable event'
        });
    }
};

module.exports = {
    createTimetableEvent,
    getTimetableEvents,
    updateTimetableEvent,
    deleteTimetableEvent
};
