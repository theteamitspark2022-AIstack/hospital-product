const express = require("express");
const router = express.Router();
const db = require("../models/db");

// GET /api/superadmin/businesses — all businesses with usage stats
router.get("/businesses", async (req, res) => {
  try {
    const { rows } = await db.query(`
      SELECT
        b.id,
        b.name,
        b.plan,
        b.subscription_status,
        b.trial_ends_at,
        b.created_at,
        b.is_live,
        COUNT(DISTINCT u.id)           AS user_count,
        COUNT(DISTINCT c.id)           AS call_count,
        COUNT(DISTINCT t.id)           AS ticket_count,
        COUNT(DISTINCT a.id)           AS appointment_count
      FROM businesses b
      LEFT JOIN users u         ON u.business_id = b.id
      LEFT JOIN calls c         ON c.business_id = b.id
      LEFT JOIN tickets t       ON t.business_id = b.id
      LEFT JOIN appointments a  ON a.business_id = b.id
      GROUP BY b.id
      ORDER BY b.created_at DESC
    `);
    res.json(rows);
  } catch (err) {
    console.error("Superadmin businesses failed:", err.message);
    res.status(500).json({ error: err.message });
  }
});

// GET /api/superadmin/businesses/:id/users
router.get("/businesses/:id/users", async (req, res) => {
  try {
    const { rows } = await db.query(
      "SELECT id, email, role, created_at FROM users WHERE business_id = $1 ORDER BY created_at ASC",
      [req.params.id]
    );
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PATCH /api/superadmin/businesses/:id — update plan or is_live
router.patch("/businesses/:id", async (req, res) => {
  const { plan, subscription_status, is_live } = req.body;
  try {
    const { rows } = await db.query(
      `UPDATE businesses SET
        plan                = COALESCE($1, plan),
        subscription_status = COALESCE($2, subscription_status),
        is_live             = COALESCE($3, is_live)
       WHERE id = $4 RETURNING *`,
      [plan || null, subscription_status || null, is_live ?? null, req.params.id]
    );
    if (!rows.length) return res.status(404).json({ error: "Business not found" });
    res.json(rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/superadmin/stats — platform-wide numbers
router.get("/stats", async (req, res) => {
  try {
    const [businesses, users, calls, tickets, appointments] = await Promise.all([
      db.query("SELECT COUNT(*) FROM businesses"),
      db.query("SELECT COUNT(*) FROM users"),
      db.query("SELECT COUNT(*) FROM calls"),
      db.query("SELECT COUNT(*) FROM tickets"),
      db.query("SELECT COUNT(*) FROM appointments"),
    ]);
    res.json({
      businesses: parseInt(businesses.rows[0].count),
      users:       parseInt(users.rows[0].count),
      calls:       parseInt(calls.rows[0].count),
      tickets:     parseInt(tickets.rows[0].count),
      appointments: parseInt(appointments.rows[0].count),
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
