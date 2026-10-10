
const express = require("express");
const cors = require("cors");
require("dotenv").config();

const pool = require("./db");

const app = express();

app.use(cors());
app.use(express.json());

app.get("/", (req, res) => {
    res.json({ message: "NEXUS backend is running!" });
});

app.get("/api/health", (req, res) => {
    res.json({
        status: "OK",
        service: "NEXUS API"
    });
});

// Test PostgreSQL connection
app.get("/api/db-test", async (req, res) => {
    try {
        const result = await pool.query(
            "SELECT current_database() AS database, NOW() AS server_time"
        );

        res.json({
            status: "Connected",
            database: result.rows[0].database,
            serverTime: result.rows[0].server_time
        });
    } catch (error) {
        console.error("Database connection failed:", error.message);

        res.status(500).json({
            status: "Error",
            message: "Could not connect to PostgreSQL"
        });
    }
});

const PORT = process.env.PORT || 3000;
const eventRoutes = require("./routes/events");
app.use("/api/events", eventRoutes);

const customerRoutes = require("./routes/customers");
const analyticsRoutes = require("./routes/analytics");
const registrationRoutes = require("./routes/registrations");
app.use("/api/customers", customerRoutes);
app.use("/api/analytics", analyticsRoutes);
app.use("/api/registrations", registrationRoutes);

app.listen(PORT, () => {
    console.log(`Server running at http://localhost:${PORT}`);
});
