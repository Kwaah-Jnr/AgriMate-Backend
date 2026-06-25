const pool = require("../database");
const bcrypt = require("bcryptjs");

// Logic to register a new user
const registerUser = async (req, res) => {
  const { username, phone_number, email, pin } = req.body;

  // // Start a tranction
  // const client = await pool.connect();
    
    try {
      // await client.query("BEGIN"); // Start transaction


      //1. Hash the pin before storing it in the database
    const salt = await bcrypt.genSalt(10);
    const hashedPin = await bcrypt.hash(pin, salt);

    //2. Insert User into the database
    const newUser = await pool.query(
      "INSERT INTO users (username, phone_number, email, pin) VALUES ($1, $2, $3, $4) RETURNING user_id, username",
      [username, phone_number, email, hashedPin]
    );

    // const userId = newUser.rows[0].user_id;

    // //3. Insert Role (must be 'farmer' or 'buyer')
    // const role = await client.query(
    //   "INSERT INTO roles (user_id, role) VALUES ($1, $2)",
    //   [userId, role] 
    // );

    //4. Save everything to the database
    // await client.query("COMMIT");

    res.status(201).json({
      message: "User and Role registered successfully!",
      user: newUser.rows[0],
    });
  } catch (err) {
    // await client.query("ROLLBACK"); // Cancel everything if there is an error
    console.error("❌ Error registering user");
    console.error("Error details:", err.message);
    res.status(500).json({ error: "Internal server error or user already exists" });
  }
};


module.exports = { registerUser };