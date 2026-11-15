
const pool = require('../config/db');
const { publicKey } = require('../config/webPush');

// GET PUBLIC VAPID KEY
const getPublicKey = (req, res) => {
    res.status(200).json({
        success: true,
        publicKey
    });
};

// SAVE PUSH SUBSCRIPTION
const subscribe = async (req, res) => {
    try {
        const userId = req.user.id;
        const { endpoint, keys } = req.body;

        if (!endpoint || !keys || !keys.p256dh || !keys.auth) {
            return res.status(400).json({
                success: false,
                message: 'Valid push subscription is required.'
            });
        }

        const result = await pool.query(
            `INSERT INTO push_subscriptions (
                user_id, endpoint, p256dh, auth
            )
            VALUES ($1, $2, $3, $4)
            ON CONFLICT (endpoint)
            DO UPDATE SET
                user_id = EXCLUDED.user_id,
                p256dh = EXCLUDED.p256dh,
                auth = EXCLUDED.auth
            RETURNING id, user_id, created_at`,
            [
                userId,
                endpoint,
                keys.p256dh,
                keys.auth
            ]
        );

        res.status(201).json({
            success: true,
            message: 'Push subscription saved successfully.',
            subscription: result.rows[0]
        });

    } catch (error) {
        console.error('Push Subscription Error:', error);

        res.status(500).json({
            success: false,
            message: 'Server error while saving push subscription.'
        });
    }
};

// REMOVE PUSH SUBSCRIPTION
const unsubscribe = async (req, res) => {
    try {
        const userId = req.user.id;
        const { endpoint } = req.body;

        if (!endpoint) {
            return res.status(400).json({
                success: false,
                message: 'Subscription endpoint is required.'
            });
        }

        const result = await pool.query(
            `DELETE FROM push_subscriptions
             WHERE user_id = $1 AND endpoint = $2
             RETURNING id`,
            [userId, endpoint]
        );

        res.status(200).json({
            success: true,
            message: result.rowCount > 0
                ? 'Push subscription removed successfully.'
                : 'Subscription was not found.'
        });

    } catch (error) {
        console.error('Remove Push Subscription Error:', error);

        res.status(500).json({
            success: false,
            message: 'Server error while removing push subscription.'
        });
    }
};

module.exports = {
    getPublicKey,
    subscribe,
    unsubscribe
};
