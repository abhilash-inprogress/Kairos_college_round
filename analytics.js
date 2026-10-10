
const express = require("express");
const router = express.Router();
const pool = require("../db");

// Overall business metrics
router.get("/overview", async (req, res) => {
    try {
        const result = await pool.query(`
            SELECT
                (SELECT COUNT(*) FROM customers) AS total_customers,
                (SELECT COUNT(*) FROM customers
                 WHERE status = 'Lead') AS total_leads,
                (SELECT COUNT(*) FROM events) AS total_events,
                (SELECT COUNT(*) FROM events
                 WHERE event_date >= CURRENT_DATE) AS upcoming_events,
                (SELECT COUNT(*) FROM registrations)
                    AS total_registrations
        `);

        res.json(result.rows[0]);
    } catch (error) {
        console.error(error.message);
        res.status(500).json({
            error: "Failed to calculate analytics"
        });
    }
});

// Event performance and capacity utilization
router.get("/events", async (req, res) => {
    try {
        const result = await pool.query(`
            SELECT
                e.id,
                e.title,
                e.event_date,
                e.capacity,
                COUNT(r.id) AS registrations,
                ROUND(
                    100.0 * COUNT(r.id) /
                    NULLIF(e.capacity, 0),
                    2
                ) AS utilization_percent
            FROM events e
            LEFT JOIN registrations r ON r.event_id = e.id
            GROUP BY e.id, e.title, e.event_date, e.capacity
            ORDER BY e.event_date
        `);

        res.json(result.rows);
    } catch (error) {
        console.error(error.message);
        res.status(500).json({
            error: "Failed to calculate event analytics"
        });
    }
});

module.exports = router;
