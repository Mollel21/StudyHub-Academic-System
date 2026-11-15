
const pool = require('../config/db');

// SEARCH ACROSS STUDYHUB MODULES
const searchAll = async (req, res) => {
    try {
        const userId = req.user.id;
        const query = (req.query.q || '').trim();

        // VALIDATE SEARCH QUERY
        if (!query) {
            return res.status(400).json({
                status: 'error',
                message: 'Please enter a search keyword.'
            });
        }

        if (query.length > 100) {
            return res.status(400).json({
                status: 'error',
                message: 'Search keyword must not exceed 100 characters.'
            });
        }

        const searchTerm = `%${query}%`;

        // SEARCH LIBRARY ITEMS
        const libraryQuery = pool.query(
            `SELECT
                id,
                title,
                original_file_name,
                category,
                description,
                file_extension,
                file_size_bytes,
                created_at
             FROM library_items
             WHERE user_id = $1
             AND deleted_at IS NULL
             AND (
                title ILIKE $2
                OR original_file_name ILIKE $2
                OR category ILIKE $2
                OR description ILIKE $2
             )
             ORDER BY created_at DESC
             LIMIT 10`,
            [userId, searchTerm]
        );

        // SEARCH TASKS
        const tasksQuery = pool.query(
            `SELECT
                id,
                title,
                description,
                due_date,
                priority,
                status,
                created_at
             FROM tasks
             WHERE user_id = $1
             AND (
                title ILIKE $2
                OR description ILIKE $2
             )
             ORDER BY created_at DESC
             LIMIT 10`,
            [userId, searchTerm]
        );

        // SEARCH GOALS
        const goalsQuery = pool.query(
            `SELECT
                id,
                title,
                description,
                target_date,
                priority,
                status,
                created_at
             FROM goals
             WHERE user_id = $1
             AND (
                title ILIKE $2
                OR description ILIKE $2
             )
             ORDER BY created_at DESC
             LIMIT 10`,
            [userId, searchTerm]
        );

        // SEARCH TIMETABLE EVENTS
        const timetableQuery = pool.query(
            `SELECT
                id,
                subject_name,
                course_code,
                day_of_week,
                start_time,
                end_time,
                venue,
                lecturer_name,
                notes
             FROM timetable_events
             WHERE user_id = $1
             AND (
                subject_name ILIKE $2
                OR course_code ILIKE $2
                OR venue ILIKE $2
                OR lecturer_name ILIKE $2
                OR notes ILIKE $2
             )
             ORDER BY day_of_week, start_time
             LIMIT 10`,
            [userId, searchTerm]
        );

        // EXECUTE ALL SEARCHES
        const [
            libraryResult,
            tasksResult,
            goalsResult,
            timetableResult
        ] = await Promise.all([
            libraryQuery,
            tasksQuery,
            goalsQuery,
            timetableQuery
        ]);

        const results = {
            library: libraryResult.rows,
            tasks: tasksResult.rows,
            goals: goalsResult.rows,
            timetable: timetableResult.rows
        };

        const totalResults =
            results.library.length +
            results.tasks.length +
            results.goals.length +
            results.timetable.length;

        return res.status(200).json({
            status: 'success',
            message: 'Search completed successfully.',
            keyword: query,
            totalResults,
            results
        });

    } catch (error) {
        console.error('Search error:', error.message);

        return res.status(500).json({
            status: 'error',
            message: 'Failed to perform search.'
        });
    }
};

module.exports = {
    searchAll
};
