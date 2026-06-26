const pool = require("../database");

const authenticateUser = async (req, res, next) => {
  const userId = req.headers["x-user-id"];

  if (!userId) {
    return res.status(401).json({ error: "Unauthorized. Missing X-User-Id header." });
  }

  try {
    const userResult = await pool.query(
      `SELECT u.user_id, u.username, u.email, u.phone_number, u.region, r.role 
       FROM users u 
       LEFT JOIN roles r ON u.user_id = r.user_id 
       WHERE u.user_id = $1`,
      [userId]
    );

    if (userResult.rows.length === 0) {
      return res.status(401).json({ error: "Unauthorized. User not found." });
    }

    req.user = userResult.rows[0];
    next();
  } catch (err) {
    console.error("❌ Error in auth middleware:", err.message);
    res.status(500).json({ error: "Internal server error in auth middleware" });
  }
};

const requireRole = (allowedRole) => {
  return (req, res, next) => {
    if (!req.user || req.user.role !== allowedRole) {
      return res.status(403).json({ error: `Forbidden. Requires the '${allowedRole}' role.` });
    }
    next();
  };
};

module.exports = {
  authenticateUser,
  requireRole,
};
