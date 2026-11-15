
const webpush = require('web-push');

const publicKey = process.env.VAPID_PUBLIC_KEY;
const privateKey = process.env.VAPID_PRIVATE_KEY;
const subject = process.env.VAPID_SUBJECT;

if (!publicKey || !privateKey || !subject) {
    throw new Error('VAPID configuration is missing. Check your .env file.');
}

webpush.setVapidDetails(
    subject,
    publicKey,
    privateKey
);

module.exports = {
    webpush,
    publicKey
};
