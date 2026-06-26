const pool = require("../database");
const bcrypt = require("bcryptjs");

const loginUser = async (req, res) => {
  const { identifier, password, pin } = req.body;
  const passwordVal = password || pin;

  try {
    // 1. Look for the user by username, phone number, or email and fetch their role
    const userResult = await pool.query(
      `SELECT u.*, r.role 
       FROM users u 
       LEFT JOIN roles r ON u.user_id = r.user_id 
       WHERE u.username = $1 OR u.phone_number = $1 OR u.email = $1`,
      [identifier]
    );

    // 2. Check if user exists
    if (userResult.rows.length === 0) {
      return res.status(404).json({ error: "User not found" });
    }
    const user = userResult.rows[0];

    // 3. Check if the provided PIN/password matches the stored hashed PIN/password
    if (!passwordVal) {
      return res.status(400).json({ error: "Password or PIN is required" });
    }
    const isMatch = await bcrypt.compare(passwordVal, user.pin);
    if (!isMatch) {
      return res.status(401).json({ error: "Invalid credentials" });
    }

    // 4. If everything is correct, return success message, user info (excluding PIN) and role
    res.json({
      message: "Login successful!",
      user: {
        id: user.user_id,
        username: user.username,
        phone_number: user.phone_number,
        email: user.email,
        region: user.region,
        role: user.role
      },
    });
  } catch (err) {
    console.error("❌ Error logging in user");
    console.error("Error details:", err.message);
    res.status(500).json({ error: "Internal server error" });
  }
};

module.exports = { loginUser };