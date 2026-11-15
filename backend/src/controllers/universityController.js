
const pool = require('../config/db');

const getUniversities = async (req, res) => {
    try {
        const result = await pool.query(
            `SELECT id, institution_name, institution_type
             FROM universities
             ORDER BY institution_name ASC`
        );

        res.json({
            status: 'success',
            count: result.rowCount,
            universities: result.rows
        });

    } catch (error) {
        console.error('University error:', error.message);

        res.status(500).json({
            status: 'error',
            message: 'Unable to retrieve institutions.'
        });
    }
};

module.exports = { getUniversities };
