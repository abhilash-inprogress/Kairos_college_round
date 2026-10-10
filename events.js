
const express = require("express");
const router = express.Router();
const pool = require("../db");

// Get all events
router.get("/", async (req, res) => {
    try {
        const result = await pool.query(
            "SELECT * FROM events ORDER BY event_date"
        );
        res.json(result.rows);
    } catch (error) {
        console.error(error.message);
        res.status(500).json({ error: "Failed to fetch events" });
    }
});

// Create an event
router.post("/", async (req, res) => {
    const { title, description, event_date, event_time, capacity } = req.body;

    if (!title?.trim() || !event_date || !event_time ||
        !Number.isInteger(Number(capacity)) || Number(capacity) < 1) {
        return res.status(400).json({
            error: "Valid title, date, time and capacity are required"
        });
    }

    try {
        const result = await pool.query(
            `INSERT INTO events
             (title, description, event_date, event_time, capacity)
             VALUES ($1, $2, $3, $4, $5)
             RETURNING *`,
            [title.trim(), description || "", event_date, event_time, Number(capacity)]
        );

        res.status(201).json(result.rows[0]);
    } catch (error) {
        console.error(error.message);
        res.status(500).json({ error: "Failed to create event" });
    }
});

module.exports = router;
