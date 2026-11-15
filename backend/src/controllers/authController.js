
const pool = require('../config/db');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');

// STUDENT REGISTRATION
const registerStudent = async (req, res) => {
    const {
        fullName,
        email,
        password,
        institutionName,
        programme,
        yearOfStudy
    } = req.body;

    if (
        !fullName || !email || !password ||
        !institutionName || !programme || !yearOfStudy
    ) {
        return res.status(400).json({
            status: 'error',
            message: 'All fields are required.'
        });
    }

    if (password.length < 8) {
        return res.status(400).json({
            status: 'error',
            message: 'Password must contain at least 8 characters.'
        });
    }

    const year = Number(yearOfStudy);
    const normalizedEmail = email.trim().toLowerCase();

    if (!Number.isInteger(year) || year < 1 || year > 10) {
        return res.status(400).json({
            status: 'error',
            message: 'Invalid year of study.'
        });
    }

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail)) {
        return res.status(400).json({
            status: 'error',
            message: 'Please enter a valid email address.'
        });
    }

    if (
        fullName.trim().length < 2 ||
        institutionName.trim().length < 2 ||
        programme.trim().length < 2 ||
        institutionName.trim().length > 200 ||
        programme.trim().length > 200
    ) {
        return res.status(400).json({
            status: 'error',
            message: 'Please enter valid registration details.'
        });
    }

    const client = await pool.connect();

    try {
        await client.query('BEGIN');

        const passwordHash = await bcrypt.hash(password, 12);

        const userResult = await client.query(
            `INSERT INTO users (full_name, email, password_hash)
             VALUES ($1, $2, $3)
             RETURNING id, full_name, email, role, created_at`,
            [fullName.trim(), normalizedEmail, passwordHash]
        );

        const user = userResult.rows[0];

        await client.query(
            `INSERT INTO student_profiles
             (user_id, institution_name, programme, year_of_study)
             VALUES ($1, $2, $3, $4)`,
            [
                user.id,
                institutionName.trim(),
                programme.trim(),
                year
            ]
        );

        await client.query('COMMIT');

        return res.status(201).json({
            status: 'success',
            message: 'Student registered successfully.',
            student: {
                id: user.id,
                fullName: user.full_name,
                email: user.email,
                institutionName: institutionName.trim(),
                programme: programme.trim(),
                yearOfStudy: year
            }
        });

    } catch (error) {
        await client.query('ROLLBACK');

        console.error('Registration error:', error.message);

        if (error.code === '23505') {
            return res.status(409).json({
                status: 'error',
                message: 'This email address is already registered.'
            });
        }

        return res.status(500).json({
            status: 'error',
            message: 'Registration failed. Please try again.'
        });

    } finally {
        client.release();
    }
};


// STUDENT LOGIN

const loginStudent = async (req, res) => {
    try {
        const { email, password } = req.body;

        if (!email || !password) {
            return res.status(400).json({
                status: 'error',
                message: 'Email and password are required.'
            });
        }

        if (!process.env.JWT_SECRET) {
            console.error('JWT_SECRET is not configured.');

            return res.status(500).json({
                status: 'error',
                message: 'Authentication service is not configured.'
            });
        }

        const normalizedEmail = email.trim().toLowerCase();

        const result = await pool.query(
            `SELECT
                u.id,
                u.full_name,
                u.email,
                u.password_hash,
                u.role,
                u.must_change_password,
                sp.institution_name,
                sp.programme,
                sp.year_of_study
             FROM users u
             LEFT JOIN student_profiles sp ON u.id = sp.user_id
             WHERE LOWER(u.email) = $1
               AND u.is_active = TRUE`,
            [normalizedEmail]
        );

        if (result.rows.length === 0) {
            return res.status(401).json({
                status: 'error',
                message: 'Invalid email or password.'
            });
        }

        const user = result.rows[0];

        const passwordMatch = await bcrypt.compare(
            password,
            user.password_hash
        );

        if (!passwordMatch) {
            return res.status(401).json({
                status: 'error',
                message: 'Invalid email or password.'
            });
        }

        const token = jwt.sign(
            {
                id: user.id,
                role: user.role
            },
            process.env.JWT_SECRET,
            {
                expiresIn: process.env.JWT_EXPIRES_IN || '1d'
            }
        );

        return res.status(200).json({
            status: 'success',
            message: 'Login successful.',
            token,
            student: {
                id: user.id,
                fullName: user.full_name,
                email: user.email,
                role: user.role,
                institutionName: user.institution_name,
                programme: user.programme,
                yearOfStudy: user.year_of_study,
                mustChangePassword: user.must_change_password
            }
        });

    } catch (error) {
        console.error('Login error:', error.message);

        return res.status(500).json({
            status: 'error',
            message: 'Login failed. Please try again.'
        });
    }
};

// GET CURRENT STUDENT
const getCurrentStudent = async (req, res) => {
    try {
        const result = await pool.query(
            `SELECT
                u.id,
                u.full_name,
                u.email,
                u.role,
                u.must_change_password,
                sp.institution_name,
                sp.programme,
                sp.year_of_study
             FROM users u
             LEFT JOIN student_profiles sp ON u.id = sp.user_id
             WHERE u.id = $1
               AND u.is_active = TRUE`,
            [req.user.id]
        );

        if (result.rows.length === 0) {
            return res.status(404).json({
                status: 'error',
                message: 'Student account not found.'
            });
        }

        const user = result.rows[0];

        return res.status(200).json({
            status: 'success',
            message: 'Student information retrieved successfully.',
            student: {
                id: user.id,
                fullName: user.full_name,
                email: user.email,
                role: user.role,
                institutionName: user.institution_name,
                programme: user.programme,
                yearOfStudy: user.year_of_study,
                mustChangePassword: user.must_change_password
            }
        });

    } catch (error) {
        console.error('Get current student error:', error.message);

        return res.status(500).json({
            status: 'error',
            message: 'Unable to retrieve student information.'
        });
    }
};

// UPDATE STUDENT PROFILE
const updateStudentProfile = async (req, res) => {
    const {
        fullName,
        email,
        institutionName,
        programme,
        yearOfStudy
    } = req.body;

    if (
        !fullName?.trim() ||
        !email?.trim() ||
        !institutionName?.trim() ||
        !programme?.trim() ||
        yearOfStudy === undefined
    ) {
        return res.status(400).json({
            status: 'error',
            message: 'All profile fields are required.'
        });
    }

    const normalizedEmail = email.trim().toLowerCase();
    const year = Number(yearOfStudy);

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail)) {
        return res.status(400).json({
            status: 'error',
            message: 'Please enter a valid email address.'
        });
    }

    if (
        fullName.trim().length < 2 ||
        institutionName.trim().length < 2 ||
        programme.trim().length < 2 ||
        !Number.isInteger(year) ||
        year < 1 ||
        year > 10
    ) {
        return res.status(400).json({
            status: 'error',
            message: 'Please enter valid profile details.'
        });
    }

    const client = await pool.connect();

    try {
        await client.query('BEGIN');

        const userResult = await client.query(
            `UPDATE users
             SET full_name = $1,
                 email = $2,
                 updated_at = CURRENT_TIMESTAMP
             WHERE id = $3
             RETURNING id, full_name, email, role`,
            [fullName.trim(), normalizedEmail, req.user.id]
        );

        if (userResult.rows.length === 0) {
            await client.query('ROLLBACK');

            return res.status(404).json({
                status: 'error',
                message: 'Student account not found.'
            });
        }

        const profileResult = await client.query(
            `UPDATE student_profiles
             SET institution_name = $1,
                 programme = $2,
                 year_of_study = $3
             WHERE user_id = $4
             RETURNING institution_name, programme, year_of_study`,
            [
                institutionName.trim(),
                programme.trim(),
                year,
                req.user.id
            ]
        );

        if (profileResult.rows.length === 0) {
            await client.query('ROLLBACK');

            return res.status(404).json({
                status: 'error',
                message: 'Student profile not found.'
            });
        }

        await client.query('COMMIT');

        const user = userResult.rows[0];
        const profile = profileResult.rows[0];

        return res.status(200).json({
            status: 'success',
            message: 'Student profile updated successfully.',
            student: {
                id: user.id,
                fullName: user.full_name,
                email: user.email,
                role: user.role,
                institutionName: profile.institution_name,
                programme: profile.programme,
                yearOfStudy: profile.year_of_study
            }
        });

    } catch (error) {
        await client.query('ROLLBACK');

        console.error('Update profile error:', error.message);

        if (error.code === '23505') {
            return res.status(409).json({
                status: 'error',
                message: 'This email address is already in use.'
            });
        }

        return res.status(500).json({
            status: 'error',
            message: 'Unable to update student profile.'
        });

    } finally {
        client.release();
    }
};



// CHANGE STUDENT PASSWORD
const changeStudentPassword = async (req, res) => {
    const {
        currentPassword,
        newPassword,
        confirmNewPassword
    } = req.body;

    if (!currentPassword || !newPassword || !confirmNewPassword) {
        return res.status(400).json({
            status: 'error',
            message: 'All password fields are required.'
        });
    }

    if (newPassword.length < 8) {
        return res.status(400).json({
            status: 'error',
            message: 'New password must contain at least 8 characters.'
        });
    }

    if (newPassword !== confirmNewPassword) {
        return res.status(400).json({
            status: 'error',
            message: 'New password and confirmation do not match.'
        });
    }

    if (currentPassword === newPassword) {
        return res.status(400).json({
            status: 'error',
            message: 'New password must be different from current password.'
        });
    }

    try {
        const result = await pool.query(
            `SELECT password_hash, must_change_password
             FROM users
             WHERE id = $1 AND is_active = TRUE`,
            [req.user.id]
        );

        if (result.rows.length === 0) {
            return res.status(404).json({
                status: 'error',
                message: 'Student account not found or inactive.'
            });
        }

        const passwordMatch = await bcrypt.compare(
            currentPassword,
            result.rows[0].password_hash
        );

        if (!passwordMatch) {
            return res.status(401).json({
                status: 'error',
                message: 'Current password is incorrect.'
            });
        }

        const newPasswordHash = await bcrypt.hash(newPassword, 12);

        await pool.query(
            `UPDATE users
             SET password_hash = $1,
                 must_change_password = FALSE,
                 updated_at = CURRENT_TIMESTAMP
             WHERE id = $2`,
            [newPasswordHash, req.user.id]
        );

        return res.status(200).json({
            status: 'success',
            message: 'Password changed successfully. You can now continue using StudyHub.',
            mustChangePassword: false
        });

    } catch (error) {
        console.error('Change password error:', error.message);

        return res.status(500).json({
            status: 'error',
            message: 'Unable to change password. Please try again.'
        });
    }
};




// GET STUDENT PREFERENCES
const getStudentPreferences = async (req, res) => {
    try {
        await pool.query(
            `INSERT INTO user_preferences (user_id)
             VALUES ($1)
             ON CONFLICT (user_id) DO NOTHING`,
            [req.user.id]
        );

        const preferences = await pool.query(
            `SELECT language, push_notifications_enabled, theme
             FROM user_preferences
             WHERE user_id = $1`,
            [req.user.id]
        );

        return res.status(200).json({
            status: 'success',
            message: 'Preferences retrieved successfully.',
            preferences: preferences.rows[0]
        });

    } catch (error) {
        console.error('Get preferences error:', error.message);

        return res.status(500).json({
            status: 'error',
            message: 'Unable to retrieve preferences.'
        });
    }
};


// UPDATE STUDENT PREFERENCES
const updateStudentPreferences = async (req, res) => {
    const {
        language,
        pushNotificationsEnabled,
        theme
    } = req.body;

    if (
        language === undefined &&
        pushNotificationsEnabled === undefined &&
        theme === undefined
    ) {
        return res.status(400).json({
            status: 'error',
            message: 'At least one preference must be provided.'
        });
    }

    if (
        language !== undefined &&
        !['English', 'Kiswahili'].includes(language)
    ) {
        return res.status(400).json({
            status: 'error',
            message: 'Language must be English or Kiswahili.'
        });
    }

    if (
        pushNotificationsEnabled !== undefined &&
        typeof pushNotificationsEnabled !== 'boolean'
    ) {
        return res.status(400).json({
            status: 'error',
            message: 'Push notifications setting must be true or false.'
        });
    }

    if (
        theme !== undefined &&
        !['light', 'dark'].includes(theme)
    ) {
        return res.status(400).json({
            status: 'error',
            message: 'Theme must be light or dark.'
        });
    }

    try {
        await pool.query(
            `INSERT INTO user_preferences (
                user_id,
                language,
                push_notifications_enabled,
                theme
            )
            VALUES ($1, $2, $3, $4)
            ON CONFLICT (user_id)
            DO UPDATE SET
                language = COALESCE($2, user_preferences.language),
                push_notifications_enabled = COALESCE(
                    $3,
                    user_preferences.push_notifications_enabled
                ),
                theme = COALESCE($4, user_preferences.theme),
                updated_at = CURRENT_TIMESTAMP`,
            [
                req.user.id,
                language ?? 'English',
                pushNotificationsEnabled ?? true,
                theme ?? 'light'
            ]
        );

        return res.status(200).json({
            status: 'success',
            message: 'Preferences updated successfully.'
        });

    } catch (error) {
        console.error('Update preferences error:', error.message);

        return res.status(500).json({
            status: 'error',
            message: 'Unable to update preferences.'
        });
    }
};


// REQUEST ACCOUNT DELETION
const requestAccountDeletion = async (req, res) => {
    const { reason } = req.body;

    if (
        reason !== undefined &&
        (typeof reason !== 'string' || reason.length > 1000)
    ) {
        return res.status(400).json({
            status: 'error',
            message: 'Reason must be text and must not exceed 1000 characters.'
        });
    }

    try {
        // Check whether the student already has a pending request
        const existingRequest = await pool.query(
            `SELECT id
             FROM account_deletion_requests
             WHERE user_id = $1 AND status = 'pending'`,
            [req.user.id]
        );

        if (existingRequest.rows.length > 0) {
            return res.status(409).json({
                status: 'error',
                message: 'You already have a pending account deletion request.'
            });
        }

        // Save the deletion request
        const result = await pool.query(
            `INSERT INTO account_deletion_requests (user_id, reason)
             VALUES ($1, $2)
             RETURNING id, reason, status, requested_at`,
            [req.user.id, reason?.trim() || null]
        );

        return res.status(201).json({
            status: 'success',
            message: 'Account deletion request submitted successfully.',
            request: result.rows[0]
        });

    } catch (error) {
        console.error('Account deletion request error:', error.message);

        return res.status(500).json({
            status: 'error',
            message: 'Unable to submit account deletion request.'
        });
    }
};


// GET ACCOUNT DELETION REQUEST STATUS
const getAccountDeletionStatus = async (req, res) => {
    try {
        const result = await pool.query(
            `SELECT id, reason, status, requested_at, reviewed_at
             FROM account_deletion_requests
             WHERE user_id = $1
             ORDER BY requested_at DESC
             LIMIT 1`,
            [req.user.id]
        );

        if (result.rows.length === 0) {
            return res.status(200).json({
                status: 'success',
                message: 'No account deletion request found.',
                request: null
            });
        }

        return res.status(200).json({
            status: 'success',
            message: 'Account deletion status retrieved successfully.',
            request: result.rows[0]
        });

    } catch (error) {
        console.error('Get deletion status error:', error.message);

        return res.status(500).json({
            status: 'error',
            message: 'Unable to retrieve account deletion status.'
        });
    }
};


module.exports = {
    registerStudent,
    loginStudent,
    getCurrentStudent,
    updateStudentProfile,
    changeStudentPassword,
    getStudentPreferences,
    updateStudentPreferences,
    requestAccountDeletion,
    getAccountDeletionStatus
};
