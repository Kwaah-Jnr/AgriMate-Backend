require('dotenv').config();
const express = require("express");
const cors = require("cors");
const pool = require("./database");
const userRoutes = require("./routes/userRoutes");
const authRoutes = require("./routes/authRoutes");

const app = express();

app.use(cors());
app.use(express.json());
app.use("/api/auth", authRoutes);
app.use("/api/users", userRoutes);

//Basic welcome route
app.get("/", (req, res) => {
  res.send("Welcome to AgriMate API!");
});

// Test route to check if the server is working
app.get("/test-db", async (req, res) => {
  try {
    const client = await pool.connect();
    const result = await client.query("SELECT NOW() as current_time");
    client.release();
    res.json({ message: "Database connection is working!", time: result.rows[0].current_time });
  } catch (err) {
    console.error("❌ Error testing database connection");
    console.error("Error details:", err.message);
    res.status(500).json({ error: "Internal server error" });
  }
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});