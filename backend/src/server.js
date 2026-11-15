
require('dotenv').config();
require('./config/email');

const app = require('./app');
const { startReminderScheduler } = require('./services/reminderScheduler');

const PORT = process.env.PORT || 5000;

app.listen(PORT, () => {
    console.log(`StudyHub server running on port ${PORT}`);

    // Start automatic reminder notifications
    startReminderScheduler();
});
