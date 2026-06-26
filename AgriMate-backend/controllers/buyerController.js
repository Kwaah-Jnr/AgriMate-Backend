const pool = require("../database");

// Helper to log actions into history
async function logHistory(client, userId, actionType, referenceId, description) {
  await client.query(
    "INSERT INTO history (user_id, action_type, reference_id, description) VALUES ($1, $2, $3, $4)",
    [userId, actionType, referenceId, description]
  );
}

/* ==========================================================================
   1. Listings Discovery
   ========================================================================== */

exports.getListings = async (req, res) => {
  const { crop_name, grade, price_min, price_max, region, limit = 10, offset = 0 } = req.query;

  try {
    let query = `
      SELECT l.*, u.username as farmer_name, u.region as farmer_region 
      FROM listings l
      JOIN users u ON l.user_id = u.user_id
      WHERE l.status = 'open'
    `;
    const params = [];

    if (crop_name) {
      params.push(crop_name);
      query += ` AND l.crop_name = $${params.length}`;
    }

    if (grade) {
      params.push(grade);
      query += ` AND l.grade = $${params.length}`;
    }

    if (price_min) {
      params.push(parseFloat(price_min));
      query += ` AND l.price >= $${params.length}`;
    }

    if (price_max) {
      params.push(parseFloat(price_max));
      query += ` AND l.price <= $${params.length}`;
    }

    if (region) {
      params.push(region);
      query += ` AND u.region = $${params.length}`;
    }

    query += ` ORDER BY l.created_at DESC LIMIT $${params.length + 1} OFFSET $${params.length + 2}`;
    params.push(parseInt(limit), parseInt(offset));

    const result = await pool.query(query, params);
    res.json(result.rows);
  } catch (err) {
    console.error("❌ Error fetching active listings for buyer:", err.message);
    res.status(500).json({ error: "Internal server error" });
  }
};

exports.getMarketInsights = async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT crop_name, 
              AVG(price)::DECIMAL(10,2) as average_price, 
              MIN(price)::DECIMAL(10,2) as minimum_price,
              MAX(price)::DECIMAL(10,2) as maximum_price,
              COUNT(*) as count 
       FROM listings 
       GROUP BY crop_name`
    );
    res.json(result.rows);
  } catch (err) {
    console.error("❌ Error fetching market insights:", err.message);
    res.status(500).json({ error: "Internal server error" });
  }
};

/* ==========================================================================
   2. Offers & Orders
   ========================================================================== */

exports.placeOffer = async (req, res) => {
  const { listings_id, price, quantity, pickup_by, note } = req.body;
  const buyerId = req.user.user_id;

  if (!listings_id || !price || !quantity) {
    return res.status(400).json({ error: "Listing ID, offered price per bag, and offered quantity are required." });
  }

  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    // Verify listing is active and open
    const listingCheck = await client.query("SELECT * FROM listings WHERE listing_id = $1", [listings_id]);
    if (listingCheck.rows.length === 0) {
      await client.query("ROLLBACK");
      return res.status(404).json({ error: "Crop listing not found." });
    }
    if (listingCheck.rows[0].status !== "open") {
      await client.query("ROLLBACK");
      return res.status(400).json({ error: `Cannot place offer on a listing with status '${listingCheck.rows[0].status}'.` });
    }

    // Insert order/offer
    const result = await client.query(
      `INSERT INTO orders (buyer_id, listings_id, price, quantity, status, pickup_by, note) 
       VALUES ($1, $2, $3, $4, 'pending', $5, $6) 
       RETURNING *`,
      [buyerId, listings_id, price, quantity, pickup_by || null, note || null]
    );
    const order = result.rows[0];

    // Log history
    await logHistory(client, buyerId, "offer_placed", order.order_id, `Placed offer of ${price} GHS/bag for listing ID ${listings_id}`);

    await client.query("COMMIT");
    res.status(201).json(order);
  } catch (err) {
    await client.query("ROLLBACK");
    console.error("❌ Error placing offer:", err.message);
    res.status(500).json({ error: "Internal server error: " + err.message });
  } finally {
    client.release();
  }
};

exports.updateOffer = async (req, res) => {
  const orderId = req.params.id;
  const { price, quantity, pickup_by, note } = req.body;
  const buyerId = req.user.user_id;

  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    // Verify ownership and status
    const check = await client.query("SELECT * FROM orders WHERE order_id = $1", [orderId]);
    if (check.rows.length === 0) {
      await client.query("ROLLBACK");
      return res.status(404).json({ error: "Offer not found." });
    }
    if (check.rows[0].buyer_id !== buyerId) {
      await client.query("ROLLBACK");
      return res.status(403).json({ error: "Forbidden. You do not own this offer." });
    }
    if (check.rows[0].status !== "pending") {
      await client.query("ROLLBACK");
      return res.status(400).json({ error: `Cannot edit an offer that is already '${check.rows[0].status}'.` });
    }

    const current = check.rows[0];
    const newPrice = price !== undefined ? price : current.price;
    const newQty = quantity !== undefined ? quantity : current.quantity;
    const newPickup = pickup_by !== undefined ? pickup_by : current.pickup_by;
    const newNote = note !== undefined ? note : current.note;

    const result = await client.query(
      `UPDATE orders 
       SET price = $1, quantity = $2, pickup_by = $3, note = $4, updated_at = NOW() 
       WHERE order_id = $5 
       RETURNING *`,
      [newPrice, newQty, newPickup, newNote, orderId]
    );

    await logHistory(client, buyerId, "offer_updated", orderId, `Updated parameters for pending offer ID ${orderId}`);
    
    await client.query("COMMIT");
    res.json(result.rows[0]);
  } catch (err) {
    await client.query("ROLLBACK");
    console.error("❌ Error updating offer:", err.message);
    res.status(500).json({ error: "Internal server error: " + err.message });
  } finally {
    client.release();
  }
};

exports.cancelOffer = async (req, res) => {
  const orderId = req.params.id;
  const buyerId = req.user.user_id;

  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    // Verify ownership and status
    const check = await client.query("SELECT * FROM orders WHERE order_id = $1", [orderId]);
    if (check.rows.length === 0) {
      await client.query("ROLLBACK");
      return res.status(404).json({ error: "Offer not found." });
    }
    if (check.rows[0].buyer_id !== buyerId) {
      await client.query("ROLLBACK");
      return res.status(403).json({ error: "Forbidden. You do not own this offer." });
    }
    if (check.rows[0].status !== "pending") {
      await client.query("ROLLBACK");
      return res.status(400).json({ error: `Cannot cancel an offer that is already '${check.rows[0].status}'.` });
    }

    await client.query("DELETE FROM orders WHERE order_id = $1", [orderId]);
    await logHistory(client, buyerId, "offer_cancelled", orderId, `Cancelled pending offer ID ${orderId}`);

    await client.query("COMMIT");
    res.json({ message: "Offer cancelled successfully." });
  } catch (err) {
    await client.query("ROLLBACK");
    console.error("❌ Error cancelling offer:", err.message);
    res.status(500).json({ error: "Internal server error" });
  } finally {
    client.release();
  }
};

exports.getOwnOrders = async (req, res) => {
  const buyerId = req.user.user_id;
  const { status, limit = 10, offset = 0 } = req.query;

  try {
    let query = `
      SELECT o.*, l.crop_name, l.location as listing_location, l.grade, u.username as farmer_name 
      FROM orders o
      JOIN listings l ON o.listings_id = l.listing_id
      JOIN users u ON l.user_id = u.user_id
      WHERE o.buyer_id = $1
    `;
    const params = [buyerId];

    if (status) {
      params.push(status);
      query += ` AND o.status = $2`;
    }

    query += ` ORDER BY o.created_at DESC LIMIT $${params.length + 1} OFFSET $${params.length + 2}`;
    params.push(parseInt(limit), parseInt(offset));

    const result = await pool.query(query, params);
    res.json(result.rows);
  } catch (err) {
    console.error("❌ Error fetching own orders:", err.message);
    res.status(500).json({ error: "Internal server error" });
  }
};

/* ==========================================================================
   3. Payments & Escrow
   ========================================================================== */

exports.fundEscrow = async (req, res) => {
  const orderId = req.params.id;
  const { transaction_id } = req.body;
  const buyerId = req.user.user_id;

  if (!transaction_id) {
    return res.status(400).json({ error: "Mobile Money (MoMo) transaction ID is required." });
  }

  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    // Verify order ownership and status
    const check = await client.query("SELECT * FROM orders WHERE order_id = $1", [orderId]);
    if (check.rows.length === 0) {
      await client.query("ROLLBACK");
      return res.status(404).json({ error: "Order not found." });
    }
    if (check.rows[0].buyer_id !== buyerId) {
      await client.query("ROLLBACK");
      return res.status(403).json({ error: "Forbidden. You do not own this order." });
    }
    if (check.rows[0].status !== "accepted") {
      await client.query("ROLLBACK");
      return res.status(400).json({ error: `You can only fund orders in 'accepted' status. Current: '${check.rows[0].status}'` });
    }

    // 1. Update order status
    await client.query("UPDATE orders SET status = 'escrow_funded', updated_at = NOW() WHERE order_id = $1", [orderId]);

    // 2. Update payments table record
    await client.query(
      `UPDATE payments 
       SET transaction_id = $1, status = 'funded', confirmed_at = NOW() 
       WHERE order_id = $2`,
      [transaction_id, orderId]
    );

    // 3. Log history
    await logHistory(client, buyerId, "escrow_funded", orderId, `Funded escrow of ${check.rows[0].price * check.rows[0].quantity} GHS via transaction ${transaction_id}`);

    await client.query("COMMIT");
    res.json({ message: "Escrow pre-funded successfully.", order_id: orderId, transaction_id });
  } catch (err) {
    await client.query("ROLLBACK");
    console.error("❌ Error funding escrow:", err.message);
    res.status(500).json({ error: "Internal server error" });
  } finally {
    client.release();
  }
};

exports.getPaymentHistory = async (req, res) => {
  const buyerId = req.user.user_id;

  try {
    const result = await pool.query(
      `SELECT p.payment_id, p.transaction_id, p.status as payment_status, p.confirmed_at,
              o.order_id, o.price, o.quantity, o.status as order_status, l.crop_name
       FROM payments p
       JOIN orders o ON p.order_id = o.order_id
       JOIN listings l ON o.listings_id = l.listing_id
       WHERE o.buyer_id = $1
       ORDER BY p.confirmed_at DESC`,
      [buyerId]
    );
    res.json(result.rows);
  } catch (err) {
    console.error("❌ Error fetching payment history:", err.message);
    res.status(500).json({ error: "Internal server error" });
  }
};

/* ==========================================================================
   4. Ratings & Reputation
   ========================================================================== */

exports.rateFarmer = async (req, res) => {
  const { rated_user_id, score, comment } = req.body;
  const buyerId = req.user.user_id;

  if (!rated_user_id || !score) {
    return res.status(400).json({ error: "Rated user (farmer) ID and rating score (1-5) are required." });
  }
  const scoreInt = parseInt(score);
  if (Number.isNaN(scoreInt) || scoreInt < 1 || scoreInt > 5) {
    return res.status(400).json({ error: "Rating score must be an integer between 1 and 5." });
  }

  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    // Verify buyer has traded with this farmer
    const tradeCheck = await client.query(
      `SELECT COUNT(*) 
       FROM orders o
       JOIN listings l ON o.listings_id = l.listing_id
       WHERE o.buyer_id = $1 AND l.user_id = $2 AND o.status IN ('accepted', 'escrow_funded', 'ready_for_pickup', 'picked_up', 'delivered', 'disputed')`,
      [buyerId, rated_user_id]
    );

    if (parseInt(tradeCheck.rows[0].count) === 0) {
      await client.query("ROLLBACK");
      return res.status(403).json({ error: "Forbidden. You can only rate a farmer after placing/completing an order with them." });
    }

    const result = await client.query(
      `INSERT INTO ratings (user_id, rated_user_id, score, comment) 
       VALUES ($1, $2, $3, $4) 
       RETURNING *`,
      [buyerId, rated_user_id, scoreInt, comment || null]
    );
    const rating = result.rows[0];

    await logHistory(client, buyerId, "rating_submitted", rating.rating_id, `Rated farmer ID ${rated_user_id} with score ${scoreInt}`);

    await client.query("COMMIT");
    res.status(201).json(rating);
  } catch (err) {
    await client.query("ROLLBACK");
    console.error("❌ Error rating farmer:", err.message);
    res.status(500).json({ error: "Internal server error: " + err.message });
  } finally {
    client.release();
  }
};

exports.getFarmerProfile = async (req, res) => {
  const farmerId = req.params.id;

  try {
    // Fetch profile
    const profile = await pool.query(
      `SELECT u.user_id, u.username, u.email, u.phone_number, u.region, r.role 
       FROM users u
       JOIN roles r ON u.user_id = r.user_id
       WHERE u.user_id = $1 AND r.role = 'farmer'`,
      [farmerId]
    );

    if (profile.rows.length === 0) {
      return res.status(404).json({ error: "Farmer not found." });
    }

    // Fetch aggregate rating
    const scoreResult = await pool.query(
      `SELECT AVG(score)::DECIMAL(2,1) as average_rating, 
              COUNT(*) as total_ratings 
       FROM ratings 
       WHERE rated_user_id = $1`,
      [farmerId]
    );

    // Fetch all reviews
    const reviews = await pool.query(
      `SELECT r.rating_id, r.score, r.comment, r.reply, r.created_at, u.username as reviewer_name 
       FROM ratings r
       JOIN users u ON r.user_id = u.user_id
       WHERE r.rated_user_id = $1
       ORDER BY r.created_at DESC`,
      [farmerId]
    );

    res.json({
      profile: profile.rows[0],
      ratings_summary: scoreResult.rows[0],
      reviews: reviews.rows
    });
  } catch (err) {
    console.error("❌ Error fetching farmer profile:", err.message);
    res.status(500).json({ error: "Internal server error" });
  }
};

exports.raiseDispute = async (req, res) => {
  const orderId = req.params.id;
  const { reason } = req.body;
  const buyerId = req.user.user_id;

  if (!reason || reason.trim() === "") {
    return res.status(400).json({ error: "Reason for dispute cannot be empty." });
  }

  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    // Verify ownership and status
    const check = await client.query("SELECT * FROM orders WHERE order_id = $1", [orderId]);
    if (check.rows.length === 0) {
      await client.query("ROLLBACK");
      return res.status(404).json({ error: "Order not found." });
    }
    if (check.rows[0].buyer_id !== buyerId) {
      await client.query("ROLLBACK");
      return res.status(403).json({ error: "Forbidden. You do not own this order." });
    }

    // Insert dispute
    const result = await client.query(
      `INSERT INTO disputes (order_id, buyer_id, reason) 
       VALUES ($1, $2, $3) 
       RETURNING *`,
      [orderId, buyerId, reason]
    );
    const dispute = result.rows[0];

    // Update order status to disputed
    await client.query("UPDATE orders SET status = 'disputed', updated_at = NOW() WHERE order_id = $1", [orderId]);

    // Log history
    await logHistory(client, buyerId, "dispute_raised", dispute.dispute_id, `Raised dispute on order ID ${orderId} due to: ${reason}`);

    await client.query("COMMIT");
    res.status(201).json(dispute);
  } catch (err) {
    await client.query("ROLLBACK");
    console.error("❌ Error raising dispute:", err.message);
    res.status(500).json({ error: "Internal server error" });
  } finally {
    client.release();
  }
};

/* ==========================================================================
   5. Analytics
   ========================================================================== */

exports.getAnalytics = async (req, res) => {
  const buyerId = req.user.user_id;

  try {
    // 1. Total offers placed by buyer
    const offersCount = await pool.query("SELECT COUNT(*) FROM orders WHERE buyer_id = $1", [buyerId]);

    // 2. Average bid acceptance rate (ratio of accepted/ready_for_pickup/delivered orders to total placed)
    const totalOffers = parseInt(offersCount.rows[0].count);
    let acceptanceRate = "0.0%";
    if (totalOffers > 0) {
      const acceptedOffers = await pool.query(
        "SELECT COUNT(*) FROM orders WHERE buyer_id = $1 AND status IN ('accepted', 'escrow_funded', 'ready_for_pickup', 'picked_up', 'delivered', 'disputed')",
        [buyerId]
      );
      acceptanceRate = ((parseInt(acceptedOffers.rows[0].count) / totalOffers) * 100).toFixed(1) + "%";
    }

    // 3. Escrow volume (Total GHS locked in active/completed trades)
    const escrowVolume = await pool.query(
      `SELECT SUM(price * quantity)::DECIMAL(12,2) as total_escrow
       FROM orders
       WHERE buyer_id = $1 AND status IN ('escrow_funded', 'ready_for_pickup', 'picked_up', 'delivered', 'disputed')`,
      [buyerId]
    );

    res.json({
      total_offers: totalOffers,
      bid_acceptance_rate: acceptanceRate,
      total_escrow_funded: parseFloat(escrowVolume.rows[0].total_escrow) || 0.00
    });
  } catch (err) {
    console.error("❌ Error fetching buyer analytics:", err.message);
    res.status(500).json({ error: "Internal server error" });
  }
};
