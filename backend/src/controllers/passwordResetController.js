const pool = require('../config/db');
const bcrypt = require('bcrypt');
const crypto = require('crypto');
const transporter = require('../config/email');

// REQUEST PASSWORD RESET OTP
const requestPasswordReset = async (req, res) => {
    try {
        const { email } = req.body;

        if (!email || typeof email !== 'string') {
            return res.status(400).json({
                status: 'error',
                message: 'Please provide a valid email address.'
            });
        }

        const normalizedEmail = email.trim().toLowerCase();

        const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

        if (!emailPattern.test(normalizedEmail)) {
            return res.status(400).json({
                status: 'error',
                message: 'Please provide a valid email address.'
            });
        }

        // Find an active account using this email
        const userResult = await pool.query(
            `SELECT id, full_name, email
             FROM users
             WHERE LOWER(email) = $1
             AND is_active = TRUE
             LIMIT 1`,
            [normalizedEmail]
        );

        // Always return the same message to protect account privacy
        const responseMessage =
            'If an active account exists with that email, a password reset code will be sent.';

        if (userResult.rows.length === 0) {
            return res.status(200).json({
                status: 'success',
                message: responseMessage
            });
        }

        const user = userResult.rows[0];

        // Prevent requesting another OTP within 60 seconds
        const cooldownResult = await pool.query(
            `SELECT id
             FROM password_reset_otps
             WHERE user_id = $1
             AND created_at > NOW() - INTERVAL '60 seconds'
             ORDER BY created_at DESC
             LIMIT 1`,
            [user.id]
        );

        if (cooldownResult.rows.length > 0) {
            return res.status(200).json({
                status: 'success',
                message: responseMessage
            });
        }

        // Generate a secure six-digit OTP
        const otp = crypto.randomInt(100000, 1000000).toString();

        // Hash the OTP before storing it
        const otpHash = await bcrypt.hash(otp, 10);

        // OTP expires after 10 minutes
        const otpResult = await pool.query(
            `INSERT INTO password_reset_otps
                (user_id, otp_hash, expires_at)
             VALUES
                ($1, $2, NOW() + INTERVAL '10 minutes')
             RETURNING id`,
            [user.id, otpHash]
        );

        const otpId = otpResult.rows[0].id;

        try {
            // Send OTP to the student's email
            const emailInfo = await transporter.sendMail({
                from: `"StudyHub" <${process.env.EMAIL_USER}>`,
                to: user.email,
                subject: 'StudyHub Password Reset Code',
                text: `Hello ${user.full_name},

We received a request to reset your StudyHub password.

Your six-digit verification code is: ${otp}

This code expires in 10 minutes.

If you did not request this password reset, please ignore this email.

StudyHub Team`
            });

            console.log('Password reset email accepted:', emailInfo.accepted);
console.log('Password reset email rejected:', emailInfo.rejected);
console.log('Password reset SMTP response:', emailInfo.response);

            // Invalidate previous unused OTPs after successful email delivery
            await pool.query(
                `UPDATE password_reset_otps
                 SET used_at = NOW()
                 WHERE user_id = $1
                 AND id != $2
                 AND used_at IS NULL`,
                [user.id, otpId]
            );

        } catch (emailError) {
            // Remove the OTP if the email could not be sent
            await pool.query(
                'DELETE FROM password_reset_otps WHERE id = $1',
                [otpId]
            );

            throw emailError;
        }

        return res.status(200).json({
            status: 'success',
            message: responseMessage
        });

    } catch (error) {
        console.error(
            'Password reset OTP request failed:',
            error.message
        );

        return res.status(500).json({
            status: 'error',
            message: 'Unable to process your password reset request. Please try again later.'
        });
    }
};


// VERIFY PASSWORD RESET OTP
const verifyPasswordResetOTP = async (req, res) => {
    try {
        const { email, otp } = req.body;

        if (
            !email ||
            typeof email !== 'string' ||
            !otp ||
            typeof otp !== 'string' ||
            !/^\d{6}$/.test(otp)
        ) {
            return res.status(400).json({
                status: 'error',
                message: 'Please provide a valid email and six-digit OTP.'
            });
        }

        const normalizedEmail = email.trim().toLowerCase();

        // Find the active account
        const userResult = await pool.query(
            `SELECT id
             FROM users
             WHERE LOWER(email) = $1
             AND is_active = TRUE
             LIMIT 1`,
            [normalizedEmail]
        );

        if (userResult.rows.length === 0) {
            return res.status(400).json({
                status: 'error',
                message: 'Invalid or expired verification code.'
            });
        }

        const userId = userResult.rows[0].id;

        // Find the latest unused OTP
        const otpResult = await pool.query(
            `SELECT id, otp_hash, expires_at, attempts
             FROM password_reset_otps
             WHERE user_id = $1
             AND used_at IS NULL
             ORDER BY created_at DESC
             LIMIT 1`,
            [userId]
        );

        if (otpResult.rows.length === 0) {
            return res.status(400).json({
                status: 'error',
                message: 'Invalid or expired verification code.'
            });
        }

        const resetRecord = otpResult.rows[0];

        // Check expiration and maximum attempts
        if (
            new Date(resetRecord.expires_at) <= new Date() ||
            resetRecord.attempts >= 5
        ) {
            await pool.query(
                `UPDATE password_reset_otps
                 SET used_at = NOW()
                 WHERE id = $1`,
                [resetRecord.id]
            );

            return res.status(400).json({
                status: 'error',
                message: 'Invalid or expired verification code.'
            });
        }

        // Compare submitted OTP with stored hash
        const isOTPValid = await bcrypt.compare(
            otp,
            resetRecord.otp_hash
        );

        if (!isOTPValid) {
            const attemptResult = await pool.query(
                `UPDATE password_reset_otps
                 SET attempts = attempts + 1
                 WHERE id = $1
                 RETURNING attempts`,
                [resetRecord.id]
            );

            if (attemptResult.rows[0].attempts >= 5) {
                await pool.query(
                    `UPDATE password_reset_otps
                     SET used_at = NOW()
                     WHERE id = $1`,
                    [resetRecord.id]
                );
            }

            return res.status(400).json({
                status: 'error',
                message: 'Invalid or expired verification code.'
            });
        }

        // Generate a secure, one-time reset token
        const resetToken = crypto.randomBytes(32).toString('hex');

        const resetTokenHash = crypto
            .createHash('sha256')
            .update(resetToken)
            .digest('hex');

        // Mark OTP as used and save hashed reset token
        await pool.query(
            `UPDATE password_reset_otps
             SET used_at = NOW(),
                 reset_token_hash = $1,
                 reset_token_expires_at = NOW() + INTERVAL '10 minutes'
             WHERE id = $2`,
            [resetTokenHash, resetRecord.id]
        );

        return res.status(200).json({
            status: 'success',
            message: 'OTP verified successfully. You can now reset your password.',
            resetToken
        });

    } catch (error) {
        console.error(
            'OTP verification failed:',
            error.message
        );

        return res.status(500).json({
            status: 'error',
            message: 'Unable to verify OTP. Please try again later.'
        });
    }
};


// RESET STUDENT PASSWORD
const resetStudentPassword = async (req, res) => {
    const { email, resetToken, newPassword, confirmPassword } = req.body;

    try {
        if (
            !email ||
            !resetToken ||
            !newPassword ||
            !confirmPassword
        ) {
            return res.status(400).json({
                status: 'error',
                message: 'Please provide all required fields.'
            });
        }

        if (newPassword.length < 8) {
            return res.status(400).json({
                status: 'error',
                message: 'Password must contain at least 8 characters.'
            });
        }

        if (newPassword !== confirmPassword) {
            return res.status(400).json({
                status: 'error',
                message: 'Passwords do not match.'
            });
        }

        const normalizedEmail = email.trim().toLowerCase();

        // Find the account and its latest reset token
        const result = await pool.query(
            `SELECT
                p.id AS reset_id,
                p.reset_token_hash,
                p.reset_token_expires_at,
                u.id AS user_id
             FROM users u
             INNER JOIN password_reset_otps p
                ON p.user_id = u.id
             WHERE LOWER(u.email) = $1
             AND u.is_active = TRUE
             AND p.reset_token_hash IS NOT NULL
             ORDER BY p.created_at DESC
             LIMIT 1`,
            [normalizedEmail]
        );

        if (result.rows.length === 0) {
            return res.status(400).json({
                status: 'error',
                message: 'Invalid or expired reset token.'
            });
        }

        const resetRecord = result.rows[0];

        // Check token expiration
        if (
            !resetRecord.reset_token_expires_at ||
            new Date(resetRecord.reset_token_expires_at) <= new Date()
        ) {
            return res.status(400).json({
                status: 'error',
                message: 'Invalid or expired reset token.'
            });
        }

        // Hash submitted token and compare it with stored hash
        const submittedTokenHash = crypto
            .createHash('sha256')
            .update(resetToken)
            .digest('hex');

        const tokenIsValid = crypto.timingSafeEqual(
            Buffer.from(submittedTokenHash, 'hex'),
            Buffer.from(resetRecord.reset_token_hash, 'hex')
        );

        if (!tokenIsValid) {
            return res.status(400).json({
                status: 'error',
                message: 'Invalid or expired reset token.'
            });
        }

        // Hash the new password
        const passwordHash = await bcrypt.hash(newPassword, 12);

        // Update password and consume reset token
        const client = await pool.connect();

        try {
            await client.query('BEGIN');

            await client.query(
                `UPDATE users
                 SET password_hash = $1,
                     updated_at = CURRENT_TIMESTAMP
                 WHERE id = $2`,
                [passwordHash, resetRecord.user_id]
            );

            await client.query(
                `UPDATE password_reset_otps
                 SET reset_token_hash = NULL,
                     reset_token_expires_at = NULL,
                     used_at = COALESCE(used_at, NOW())
                 WHERE user_id = $1`,
                [resetRecord.user_id]
            );

            await client.query('COMMIT');

        } catch (dbError) {
            await client.query('ROLLBACK');
            throw dbError;

        } finally {
            client.release();
        }

        return res.status(200).json({
            status: 'success',
            message: 'Password reset successfully. You can now login with your new password.'
        });

    } catch (error) {
        console.error('Password reset failed:', error.message);

        return res.status(500).json({
            status: 'error',
            message: 'Unable to reset password. Please try again later.'
        });
    }
};



module.exports = {
    requestPasswordReset,
    verifyPasswordResetOTP,
    resetStudentPassword

};