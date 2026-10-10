
const express = require("express");
const router = express.Router();
const pool = require("../db");

// GET /api/registrations
router.get("/", async (req, res) => {
    try {
        const result = await pool.query(`
            SELECT
                r.id,
                c.name AS customer_name,
                c.email,
                e.title AS event_title,
                r.registered_at
            FROM registrations r
            JOIN customers c ON c.id = r.customer_id
            JOIN events e ON e.id = r.event_id
            ORDER BY r.registered_at DESC
        `);

        res.json(result.rows);
    } catch (error) {
        console.error(error.message);
        res.status(500).json({
            error: "Failed to fetch registrations"
        });
    }
});

// POST /api/registrations
router.post("/", async (req, res) => {
    const { name, email, event_id, source } = req.body;

    if (
        typeof name !== "string" ||
        !name.trim() ||
        typeof email !== "string" ||
        !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim()) ||
        !Number.isInteger(Number(event_id)) ||
        Number(event_id) < 1
    ) {
        return res.status(400).json({
            error: "Valid name, email and event_id are required"
        });
    }

    const client = await pool.connect();

    try {
        await client.query("BEGIN");

        // Lock the event row while checking capacity
        const eventResult = await client.query(
            `SELECT id, capacity, event_date
             FROM events
             WHERE id = $1
             FOR UPDATE`,
            [Number(event_id)]
        );

        if (eventResult.rowCount === 0) {
            await client.query("ROLLBACK");
            return res.status(404).json({ error: "Event not found" });
        }

        const event = eventResult.rows[0];

        if (event.event_date < new Date().toISOString().slice(0, 10)) {
            await client.query("ROLLBACK");
            return res.status(400).json({
                error: "Cannot register for a past event"
            });
        }

        const emailNormalized = email.trim().toLowerCase();

        // Find or create the customer
        const customerResult = await client.query(
            `INSERT INTO customers (name, email, source)
             VALUES ($1, $2, $3)
             ON CONFLICT (email)
             DO UPDATE SET email = EXCLUDED.email
             RETURNING id`,
            [name.trim(), emailNormalized, source || "Website"]
        );

        const customerId = customerResult.rows[0].id;

        // Check for an existing registration
        const duplicate = await client.query(
            `SELECT id FROM registrations
             WHERE customer_id = $1 AND event_id = $2`,
            [customerId, Number(event_id)]
        );

        if (duplicate.rowCount > 0) {
            await client.query("ROLLBACK");
            return res.status(409).json({
                error: "Customer is already registered for this event"
            });
        }

        // Check remaining capacity
        const countResult = await client.query(
            `SELECT COUNT(*) AS total
             FROM registrations
             WHERE event_id = $1`,
            [Number(event_id)]
        );

        if (Number(countResult.rows[0].total) >= event.capacity) {
            await client.query("ROLLBACK");
            return res.status(409).json({
                error: "This event is full"
            });
        }

        const registrationResult = await client.query(
            `INSERT INTO registrations (customer_id, event_id)
             VALUES ($1, $2)
             RETURNING *`,
            [customerId, Number(event_id)]
        );

        await client.query("COMMIT");

        res.status(201).json({
            message: "Registration successful",
            registration: registrationResult.rows[0]
        });
    } catch (error) {
        await client.query("ROLLBACK");
        console.error(error.message);
        res.status(500).json({
            error: "Failed to create registration"
        });
    } finally {
        client.release();
    }
});

module.exports = router;
