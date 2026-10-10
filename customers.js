
const express = require("express");
const router = express.Router();
const pool = require("../db");

// Get all customers
router.get("/", async (req, res) => {
    try {
        const result = await pool.query(`
            SELECT id, name, email, status, source, created_at
            FROM customers
            ORDER BY created_at DESC
        `);

        res.json(result.rows);
    } catch (error) {
        console.error(error.message);
        res.status(500).json({
            error: "Failed to fetch customers"
        });
    }
});

// Create a customer
router.post("/", async (req, res) => {
    const { name, email, status, source } = req.body;

    if (
        typeof name !== "string" ||
        !name.trim() ||
        typeof email !== "string" ||
        !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())
    ) {
        return res.status(400).json({
            error: "A valid name and email are required"
        });
    }

    try {
        const result = await pool.query(
            `INSERT INTO customers (name, email, status, source)
             VALUES ($1, $2, $3, $4)
             RETURNING *`,
            [
                name.trim(),
                email.trim().toLowerCase(),
                status || "Lead",
                source || "Website"
            ]
        );

        res.status(201).json(result.rows[0]);
    } catch (error) {
        if (error.code === "23505") {
            return res.status(409).json({
                error: "A customer with this email already exists"
            });
        }

        console.error(error.message);
        res.status(500).json({
            error: "Failed to create customer"
        });
    }
});

module.exports = router;
