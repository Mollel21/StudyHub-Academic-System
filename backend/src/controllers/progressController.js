
const pool = require('../config/db');

// GET STUDENT PROGRESS
const getProgress = async (req, res) => {
    try {
        const userId = req.user.id;
        const period = req.query.period || 'all';

        // Validate period
        if (!['week', 'month', 'all'].includes(period)) {
            return res.status(400).json({
                status: 'error',
                message: 'Invalid period. Use week, month or all.'
            });
        }

        // Date filter for selected period
        const dateCondition = `
            (
                $2 = 'all'
                OR created_at >= CASE
                    WHEN $2 = 'week'
                        THEN CURRENT_DATE - INTERVAL '6 days'
                    WHEN $2 = 'month'
                        THEN DATE_TRUNC('month', CURRENT_DATE)
                END
            )
        `;

        // TASK PROGRESS
        const taskResult = await pool.query(
            `SELECT
                COUNT(*)::INTEGER AS total_tasks,
                COUNT(*) FILTER (
                    WHERE status = 'completed'
                )::INTEGER AS completed_tasks,
                COUNT(*) FILTER (
                    WHERE status = 'pending'
                )::INTEGER AS pending_tasks,
                COUNT(*) FILTER (
                    WHERE status = 'in_progress'
                )::INTEGER AS in_progress_tasks
             FROM tasks
             WHERE user_id = $1
             AND ${dateCondition}`,
            [userId, period]
        );

        // GOAL PROGRESS
        const goalResult = await pool.query(
            `SELECT
                COUNT(*)::INTEGER AS total_goals,
                COUNT(*) FILTER (
                    WHERE status = 'completed'
                )::INTEGER AS completed_goals,
                COUNT(*) FILTER (
                    WHERE status = 'active'
                )::INTEGER AS active_goals
             FROM goals
             WHERE user_id = $1
             AND ${dateCondition}`,
            [userId, period]
        );

        // STUDY SESSION SUMMARY
        const studyResult = await pool.query(
            `SELECT
                COUNT(*)::INTEGER AS total_sessions,
                COALESCE(SUM(actual_seconds), 0)::BIGINT
                    AS total_study_seconds,
                COALESCE(AVG(actual_seconds), 0)::INTEGER
                    AS average_session_seconds
             FROM study_sessions
             WHERE user_id = $1
             AND status = 'completed'
             AND (
                $2 = 'all'
                OR started_at >= CASE
                    WHEN $2 = 'week'
                        THEN CURRENT_DATE - INTERVAL '6 days'
                    WHEN $2 = 'month'
                        THEN DATE_TRUNC('month', CURRENT_DATE)
                END
             )`,
            [userId, period]
        );

        // DAILY STUDY ACTIVITY FOR THE LAST 7 DAYS
        const weeklyResult = await pool.query(
            `SELECT
                days.study_date::DATE AS study_date,
                TO_CHAR(days.study_date, 'Dy') AS day_name,
                COALESCE(SUM(s.actual_seconds), 0)::BIGINT
                    AS study_seconds,
                COUNT(s.id)::INTEGER AS sessions_count
             FROM GENERATE_SERIES(
                CURRENT_DATE - INTERVAL '6 days',
                CURRENT_DATE,
                INTERVAL '1 day'
             ) AS days(study_date)
             LEFT JOIN study_sessions s
                ON s.user_id = $1
                AND s.status = 'completed'
                AND s.started_at::DATE = days.study_date::DATE
             GROUP BY days.study_date
             ORDER BY days.study_date`,
            [userId]
        );

        // CONVERT DATABASE RESULTS
        const tasks = taskResult.rows[0];
        const goals = goalResult.rows[0];
        const study = studyResult.rows[0];

        const totalGoals = Number(goals.total_goals);
        const completedGoals = Number(goals.completed_goals);

        const totalTasks = Number(tasks.total_tasks);
        const completedTasks = Number(tasks.completed_tasks);

        // CALCULATE COMPLETION RATES
        const taskCompletionRate = totalTasks > 0
            ? Math.round((completedTasks / totalTasks) * 100)
            : 0;

        const goalCompletionRate = totalGoals > 0
            ? Math.round((completedGoals / totalGoals) * 100)
            : 0;

        const totalStudySeconds = Number(study.total_study_seconds);

        res.status(200).json({
            status: 'success',
            message: 'Progress retrieved successfully',

            period,

            taskProgress: {
                total: totalTasks,
                completed: completedTasks,
                pending: Number(tasks.pending_tasks),
                in_progress: Number(tasks.in_progress_tasks),
                completion_rate: taskCompletionRate
            },

            goalProgress: {
                total: totalGoals,
                completed: completedGoals,
                active: Number(goals.active_goals),
                completion_rate: goalCompletionRate
            },

            studyProgress: {
                total_sessions: Number(study.total_sessions),
                total_study_seconds: totalStudySeconds,
                total_study_hours: Number(
                    (totalStudySeconds / 3600).toFixed(2)
                ),
                average_session_seconds: Number(
                    study.average_session_seconds
                )
            },

            weeklyActivity: weeklyResult.rows.map(day => ({
                date: day.study_date,
                day: day.day_name,
                study_seconds: Number(day.study_seconds),
                study_hours: Number(
                    (Number(day.study_seconds) / 3600).toFixed(2)
                ),
                sessions: Number(day.sessions_count)
            }))
        });

    } catch (error) {
        console.error('Get progress error:', error.message);

        res.status(500).json({
            status: 'error',
            message: 'Failed to retrieve student progress'
        });
    }
};

module.exports = {
    getProgress
};
