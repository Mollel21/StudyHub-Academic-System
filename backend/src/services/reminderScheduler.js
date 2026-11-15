
const cron = require('node-cron');
const pool = require('../config/db');
const { webpush } = require('../config/webPush');

const sendDueReminders = async () => {
    try {
        // Find reminders whose scheduled time has arrived
        // and which have not been notified yet.
        const result = await pool.query(
            `SELECT r.id, r.user_id, r.title, r.description,
                    r.reminder_date, r.reminder_time
             FROM reminders r
             WHERE r.status = 'pending'
             AND r.notified_at IS NULL
             AND (r.reminder_date + r.reminder_time) <= CURRENT_TIMESTAMP
             AND EXISTS (
                 SELECT 1
                 FROM push_subscriptions ps
                 WHERE ps.user_id = r.user_id
             )
             ORDER BY r.reminder_date, r.reminder_time`
        );

        for (const reminder of result.rows) {

            const subscriptions = await pool.query(
                `SELECT id, endpoint, p256dh, auth
                 FROM push_subscriptions
                 WHERE user_id = $1`,
                [reminder.user_id]
            );

            const payload = JSON.stringify({
                title: 'StudyHub Reminder 🔔',
                body: reminder.title,
                description: reminder.description || '',
                reminderId: reminder.id,
                url: '/reminders.html'
            });

            let delivered = false;

            for (const item of subscriptions.rows) {

                const subscription = {
                    endpoint: item.endpoint,
                    keys: {
                        p256dh: item.p256dh,
                        auth: item.auth
                    }
                };

                try {

                    await webpush.sendNotification(
                        subscription,
                        payload
                    );

                    delivered = true;

                } catch (error) {

                    console.error(
                        'Push notification failed:',
                        error.statusCode || error.message
                    );

                    // Remove expired subscriptions
                    if (error.statusCode === 404 ||
                        error.statusCode === 410) {

                        await pool.query(
                            `DELETE FROM push_subscriptions
                             WHERE id = $1`,
                            [item.id]
                        );
                    }
                }
            }

            // Mark as notified only after successful delivery
            if (delivered) {
                await pool.query(
                    `UPDATE reminders
                     SET notified_at = CURRENT_TIMESTAMP,
                         updated_at = CURRENT_TIMESTAMP
                     WHERE id = $1
                     AND notified_at IS NULL`,
                    [reminder.id]
                );

                console.log(
                    `Reminder ${reminder.id} notification sent.`
                );
            }
        }

    } catch (error) {
        console.error('Reminder Scheduler Error:', error);
    }
};

// Check for due reminders every minute
const startReminderScheduler = () => {

    cron.schedule('* * * * *', () => {
        sendDueReminders();
    });

    console.log('Reminder notification scheduler started.');
};

module.exports = {
    startReminderScheduler,
    sendDueReminders
};
