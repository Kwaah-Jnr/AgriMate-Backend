const pool = require("../database");
const bcrypt = require("bcryptjs");

const loginUser = async (req, res) => {
  const { identifier, pin } = req.body;

  try {
    //1. Look for the user by username or phone number
    const userResult = await pool.query("SELECT * FROM users WHERE username = $1 OR phone_number = $1", [identifier]);

    //2. Check if user exists
    if (userResult.rows.length === 0) {
      return res.status(404).json({ error: "User not found" });
    }
    const user = userResult.rows[0];

    //3. Check if the provided PIN matches the stored PIN
    const isMatch = await bcrypt.compare(pin, user.pin);
    if (!isMatch) {
      return res.status(401).json({ error: "Invalid credentials" });
    }

    //4. If everything is correct, return success message and user info (excluding PIN)
    res.json({
      message: "Login successful!",
      user: {
        id: user.id,
        username: user.username,
        phone_number: user.phone_number,
        email: user.email,
      },
    });
  } catch (err) {
    console.error("❌ Error logging in user");
    console.error("Error details:", err.message);
    res.status(500).json({ error: "Internal server error" });
  }
};

module.exports = { loginUser };