
const pool = require('../config/db');

// GET ADMIN DASHBOARD SUMMARY
const getAdminSummary = async (req, res) => {
    try {
        const [users, activeUsers, inactiveUsers, pendingRequests, totalLogs] =
            await Promise.all([
                pool.query('SELECT COUNT(*) FROM users'),
                pool.query('SELECT COUNT(*) FROM users WHERE is_active = TRUE'),
                pool.query('SELECT COUNT(*) FROM users WHERE is_active = FALSE'),
                pool.query(
                    `SELECT COUNT(*) FROM account_deletion_requests
                     WHERE status = 'pending'`
                ),
                pool.query('SELECT COUNT(*) FROM admin_audit_logs')
            ]);

        return res.status(200).json({
            status: 'success',
            message: 'Administrator summary retrieved successfully.',
            summary: {
                totalUsers: Number(users.rows[0].count),
                activeUsers: Number(activeUsers.rows[0].count),
                inactiveUsers: Number(inactiveUsers.rows[0].count),
                pendingDeletionRequests: Number(pendingRequests.rows[0].count),
                totalAdminActions: Number(totalLogs.rows[0].count)
            }
        });
    } catch (error) {
        console.error('Admin summary error:', error.message);

        return res.status(500).json({
            status: 'error',
            message: 'Unable to retrieve administrator summary.'
        });
    }
};  


// GET ALL USERS FOR ADMIN
const getAllUsers = async (req, res) => {
    try {
        const result = await pool.query(
            `SELECT
                u.id,
                u.full_name,
                u.email,
                u.role,
                u.is_active,
                u.created_at,
                sp.institution_name,
                sp.programme,
                sp.year_of_study
             FROM users u
             LEFT JOIN student_profiles sp
                ON u.id = sp.user_id
             ORDER BY u.created_at DESC`
        );

        return res.status(200).json({
            status: 'success',
            message: 'Users retrieved successfully.',
            total: result.rows.length,
            users: result.rows
        });

    } catch (error) {
        console.error('Get all users error:', error.message);

        return res.status(500).json({
            status: 'error',
            message: 'Unable to retrieve users.'
        });
    }
};


 // UPDATE USER ACCOUNT STATUS AND RECORD ADMIN ACTION
const updateUserStatus = async (req, res) => {
    const client = await pool.connect();

    try {
        const userId = Number(req.params.id);
        const { isActive } = req.body;

        if (!Number.isInteger(userId) || userId <= 0) {
            return res.status(400).json({
                status: 'error',
                message: 'Invalid user ID.'
            });
        }

        if (typeof isActive !== 'boolean') {
            return res.status(400).json({
                status: 'error',
                message: 'isActive must be true or false.'
            });
        }

        if (userId === req.user.id) {
            return res.status(400).json({
                status: 'error',
                message: 'You cannot change your own account status.'
            });
        }

        await client.query('BEGIN');

        const result = await client.query(
            `UPDATE users
             SET is_active = $1,
                 updated_at = CURRENT_TIMESTAMP
             WHERE id = $2
             RETURNING id, full_name, email, role, is_active`,
            [isActive, userId]
        );

        if (result.rows.length === 0) {
            await client.query('ROLLBACK');

            return res.status(404).json({
                status: 'error',
                message: 'User not found.'
            });
        }

        const user = result.rows[0];

        await client.query(
            `INSERT INTO admin_audit_logs
                (admin_id, action, target_type, target_id, details, ip_address, user_agent)
             VALUES ($1, $2, $3, $4, $5, $6, $7)`,
            [
                req.user.id,
                isActive ? 'ACTIVATE_USER' : 'DEACTIVATE_USER',
                'user',
                userId,
                JSON.stringify({
                    fullName: user.full_name,
                    email: user.email,
                    isActive: user.is_active
                }),
                req.ip,
                req.get('user-agent') || null
            ]
        );

        await client.query('COMMIT');

        return res.status(200).json({
            status: 'success',
            message: 'User account status updated and admin action recorded successfully.',
            user
        });

    } catch (error) {
        await client.query('ROLLBACK');

        console.error('Update user status error:', error.message);

        return res.status(500).json({
            status: 'error',
            message: 'Unable to update user account status.'
        });

    } finally {
        client.release();
    }

};


// ADMIN RESET STUDENT PASSWORD
const adminResetStudentPassword = async (req, res) => {
    const client = await pool.connect();
    let transactionStarted = false;

    try {
        const studentId = Number(req.params.id);

        if (!Number.isInteger(studentId) || studentId <= 0) {
            return res.status(400).json({
                status: 'error',
                message: 'Invalid student ID.'
            });
        }

        if (studentId === req.user.id) {
            return res.status(400).json({
                status: 'error',
                message: 'You cannot reset your own password using this action.'
            });
        }

        await client.query('BEGIN');
        transactionStarted = true;

        // FIND STUDENT ACCOUNT
        const studentResult = await client.query(
            `SELECT id, full_name, email, role, is_active
             FROM users
             WHERE id = $1
             FOR UPDATE`,
            [studentId]
        );

        if (studentResult.rows.length === 0) {
            await client.query('ROLLBACK');
            transactionStarted = false;

            return res.status(404).json({
                status: 'error',
                message: 'Student account not found.'
            });
        }

        const student = studentResult.rows[0];

        if (student.role !== 'student') {
            await client.query('ROLLBACK');
            transactionStarted = false;

            return res.status(400).json({
                status: 'error',
                message: 'Password reset is only allowed for student accounts.'
            });
        }

        if (!student.is_active) {
            await client.query('ROLLBACK');
            transactionStarted = false;

            return res.status(400).json({
                status: 'error',
                message: 'Cannot reset password for an inactive account.'
            });
        }

        // HASH TEMPORARY PASSWORD
        const bcrypt = require('bcrypt');
        const temporaryPasswordHash = await bcrypt.hash('123456', 12);

        // UPDATE STUDENT PASSWORD
        await client.query(
            `UPDATE users
             SET password_hash = $1,
                 must_change_password = TRUE,
                 updated_at = CURRENT_TIMESTAMP
             WHERE id = $2`,
            [temporaryPasswordHash, studentId]
        );

        // RECORD ADMIN ACTION
        await client.query(
            `INSERT INTO admin_audit_logs
                (admin_id, action, target_type, target_id,
                 details, ip_address, user_agent)
             VALUES ($1, $2, $3, $4, $5, $6, $7)`,
            [
                req.user.id,
                'ADMIN_RESET_STUDENT_PASSWORD',
                'user',
                studentId,
                JSON.stringify({
                    studentName: student.full_name,
                    studentEmail: student.email,
                    temporaryPasswordIssued: true,
                    mustChangePassword: true
                }),
                req.ip,
                req.get('user-agent') || null
            ]
        );

        await client.query('COMMIT');
        transactionStarted = false;

        return res.status(200).json({
            status: 'success',
            message: 'Student password reset successfully. The student must change the temporary password after login.',
            student: {
                id: student.id,
                fullName: student.full_name,
                email: student.email,
                mustChangePassword: true
            }
        });

    } catch (error) {
        if (transactionStarted) {
            await client.query('ROLLBACK');
        }

        console.error('Admin reset student password error:', error.message);

        return res.status(500).json({
            status: 'error',
            message: 'Unable to reset student password.'
        });

    } finally {
        client.release();
    }
};


 // GET ADMIN AUDIT LOGS
const getAdminAuditLogs = async (req, res) => {
    try {
        const result = await pool.query(
            `SELECT
                l.id,
                l.admin_id,
                u.full_name AS admin_name,
                l.action,
                l.target_type,
                l.target_id,
                l.details,
                l.ip_address,
                l.user_agent,
                l.created_at
             FROM admin_audit_logs l
             LEFT JOIN users u ON l.admin_id = u.id
             ORDER BY l.created_at DESC`
        );

        return res.status(200).json({
            status: 'success',
            message: 'Admin audit logs retrieved successfully.',
            total: result.rows.length,
            logs: result.rows
        });

    } catch (error) {
        console.error('Get admin audit logs error:', error.message);

        return res.status(500).json({
            status: 'error',
            message: 'Unable to retrieve admin audit logs.'
        });
    }
};


 // GET ADMIN SYSTEM REPORTS
const getAdminReports = async (req, res) => {
    try {
        const [userStatistics, registrations, deletionStatistics] =
            await Promise.all([

                // User statistics
                pool.query(
                    `SELECT
                        COUNT(*) AS total_users,
                        COUNT(*) FILTER (WHERE is_active = TRUE) AS active_users,
                        COUNT(*) FILTER (WHERE is_active = FALSE) AS inactive_users,
                        COUNT(*) FILTER (WHERE role = 'student') AS total_students,
                        COUNT(*) FILTER (WHERE role = 'admin') AS total_admins
                     FROM users`
                ),

                // Daily registrations for the last 30 days
                pool.query(
                    `SELECT
                        DATE(created_at) AS registration_date,
                        COUNT(*) AS total_registrations
                     FROM users
                     WHERE created_at >= CURRENT_DATE - INTERVAL '29 days'
                     GROUP BY DATE(created_at)
                     ORDER BY registration_date ASC`
                ),

                // Account deletion request statistics
                pool.query(
                    `SELECT
                        status,
                        COUNT(*) AS total
                     FROM account_deletion_requests
                     GROUP BY status
                     ORDER BY status`
                )
            ]);

        return res.status(200).json({
            status: 'success',
            message: 'Admin reports retrieved successfully.',
            reports: {
                userStatistics: userStatistics.rows[0],
                dailyRegistrations: registrations.rows,
                deletionStatistics: deletionStatistics.rows
            }
        });

    } catch (error) {
        console.error('Admin reports error:', error.message);

        return res.status(500).json({
            status: 'error',
            message: 'Unable to retrieve admin reports.'
        });
    }
};

// GET ALL PLATFORM SETTINGS
const getPlatformSettings = async (req, res) => {
    try {
        const result = await pool.query(
            `SELECT
                id,
                setting_key,
                setting_value,
                description,
                updated_by,
                updated_at
             FROM platform_settings
             ORDER BY id ASC`
        );

        return res.status(200).json({
            status: 'success',
            message: 'Platform settings retrieved successfully.',
            settings: result.rows
        });

    } catch (error) {
        console.error('Get platform settings error:', error.message);

        return res.status(500).json({
            status: 'error',
            message: 'Unable to retrieve platform settings.'
        });
    }
};


// UPDATE PLATFORM SETTING AND RECORD ADMIN ACTION
const updatePlatformSetting = async (req, res) => {
    const settingId = Number(req.params.id);
    const { settingValue } = req.body;

    if (!Number.isInteger(settingId) || settingId <= 0) {
        return res.status(400).json({
            status: 'error',
            message: 'Invalid setting ID.'
        });
    }

    if (
        typeof settingValue !== 'string' ||
        settingValue.trim() === ''
    ) {
        return res.status(400).json({
            status: 'error',
            message: 'A valid setting value is required.'
        });
    }

    let client;
    let transactionStarted = false;

    try {
        client = await pool.connect();

        await client.query('BEGIN');
        transactionStarted = true;

        // GET CURRENT SETTING
        const currentResult = await client.query(
            `SELECT *
             FROM platform_settings
             WHERE id = $1
             FOR UPDATE`,
            [settingId]
        );

        if (currentResult.rows.length === 0) {
            await client.query('ROLLBACK');
            transactionStarted = false;

            return res.status(404).json({
                status: 'error',
                message: 'Platform setting not found.'
            });
        }

        const oldSetting = currentResult.rows[0];

        // UPDATE SETTING
        const result = await client.query(
            `UPDATE platform_settings
             SET setting_value = $1,
                 updated_by = $2,
                 updated_at = CURRENT_TIMESTAMP
             WHERE id = $3
             RETURNING *`,
            [settingValue.trim(), req.user.id, settingId]
        );

        const updatedSetting = result.rows[0];

        // RECORD ADMIN ACTION
        await client.query(
            `INSERT INTO admin_audit_logs
                (admin_id, action, target_type, target_id,
                 details, ip_address, user_agent)
             VALUES ($1, $2, $3, $4, $5, $6, $7)`,
            [
                req.user.id,
                'UPDATE_PLATFORM_SETTING',
                'platform_setting',
                settingId,
                JSON.stringify({
                    settingKey: oldSetting.setting_key,
                    oldValue: oldSetting.setting_value,
                    newValue: updatedSetting.setting_value
                }),
                req.ip,
                req.get('user-agent') || null
            ]
        );

        await client.query('COMMIT');
        transactionStarted = false;

        return res.status(200).json({
            status: 'success',
            message: 'Platform setting updated and admin action recorded successfully.',
            setting: updatedSetting
        });

    } catch (error) {
        if (client && transactionStarted) {
            await client.query('ROLLBACK');
        }

        console.error('Update platform setting error:', error.message);

        return res.status(500).json({
            status: 'error',
            message: 'Unable to update platform setting.'
        });

    } finally {
        if (client) {
            client.release();
        }
    }
};


module.exports = {
    getAdminSummary,
    getAllUsers,
    updateUserStatus,
    adminResetStudentPassword,
    getAdminAuditLogs,
    getAdminReports,
    getPlatformSettings,
    updatePlatformSetting
};
