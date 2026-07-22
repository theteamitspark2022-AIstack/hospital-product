const express = require("express");
const router = express.Router();
const db = require("../models/db");
const bcrypt = require("bcryptjs");
const { v4: uuidv4 } = require("uuid");
const { getPlan } = require("../config/plans");

// GET /api/superadmin/businesses
router.get("/businesses", async (req, res) => {
  try {
    const { rows } = await db.query(`
      SELECT
        b.id, b.name, b.plan, b.subscription_status, b.trial_ends_at,
        b.created_at, b.is_live,
        COALESCE(
          (SELECT email FROM users WHERE business_id = b.id AND role = 'owner' LIMIT 1),
          (SELECT email FROM users WHERE business_id = b.id LIMIT 1)
        ) AS owner_email,
        COUNT(DISTINCT u.id)  AS user_count,
        COUNT(DISTINCT c.id)  AS call_count,
        COUNT(DISTINCT t.id)  AS ticket_count,
        COUNT(DISTINCT a.id)  AS appointment_count
      FROM businesses b
      LEFT JOIN users u        ON u.business_id = b.id
      LEFT JOIN calls c        ON c.business_id = b.id
      LEFT JOIN tickets t      ON t.business_id = b.id
      LEFT JOIN appointments a ON a.business_id = b.id
      GROUP BY b.id
      ORDER BY b.created_at DESC
    `);
    res.json(rows);
  } catch (err) {
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

// POST /api/superadmin/businesses — create new business + owner
router.post("/businesses", async (req, res) => {
  const { businessName, ownerEmail, ownerPassword } = req.body;
  if (!businessName || !ownerEmail || !ownerPassword) {
    return res.status(400).json({ error: "Business name, owner email and password are required" });
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(ownerEmail)) {
    return res.status(400).json({ error: "Invalid email address" });
  }
  if (ownerPassword.length < 8 || !/[A-Z]/.test(ownerPassword) || !/[0-9]/.test(ownerPassword)) {
    return res.status(400).json({ error: "Password must be 8+ chars with uppercase and number" });
  }
  try {
    const bizId = uuidv4();
    await db.query(
      `INSERT INTO businesses (id, name, plan, subscription_status, trial_ends_at)
       VALUES ($1, $2, 'trial', 'trial', NOW() + INTERVAL '14 days')`,
      [bizId, businessName.trim()]
    );
    const hash = await bcrypt.hash(ownerPassword, 10);
    await db.query(
      `INSERT INTO users (email, password_hash, business_id, role)
       VALUES ($1, $2, $3, 'owner')`,
      [ownerEmail.toLowerCase().trim(), hash, bizId]
    );
    res.status(201).json({ ok: true, businessId: bizId });
  } catch (err) {
    if (err.code === "23505") return res.status(409).json({ error: "Email already exists" });
    res.status(500).json({ error: err.message });
  }
});

// PATCH /api/superadmin/businesses/:id — update plan / status / suspend / live
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

// DELETE /api/superadmin/businesses/:id — permanently delete business and all data
router.delete("/businesses/:id", async (req, res) => {
  const { id } = req.params;
  try {
    await db.query("DELETE FROM appointments  WHERE business_id = $1", [id]);
    await db.query("DELETE FROM tickets       WHERE business_id = $1", [id]);
    await db.query("DELETE FROM calls         WHERE business_id = $1", [id]);
    await db.query("DELETE FROM settings      WHERE business_id = $1", [id]);
    await db.query("DELETE FROM users         WHERE business_id = $1", [id]);
    await db.query("DELETE FROM businesses    WHERE id = $1",          [id]);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/superadmin/businesses/:id/team — add team member
router.post("/businesses/:id/team", async (req, res) => {
  const { email, password, role = "agent" } = req.body;
  if (!email || !password) return res.status(400).json({ error: "Email and password are required" });
  if (!["owner", "agent"].includes(role)) return res.status(400).json({ error: "Role must be owner or agent" });
  if (password.length < 8 || !/[A-Z]/.test(password) || !/[0-9]/.test(password)) {
    return res.status(400).json({ error: "Password must be 8+ chars with uppercase and number" });
  }
  try {
    // Enforce agent limit based on business plan
    const bizRow = await db.query("SELECT plan FROM businesses WHERE id = $1", [req.params.id]);
    if (bizRow.rows.length) {
      const limits = getPlan(bizRow.rows[0].plan);
      if (limits.agents !== Infinity) {
        const countRow = await db.query("SELECT COUNT(*) FROM users WHERE business_id = $1", [req.params.id]);
        if (parseInt(countRow.rows[0].count) >= limits.agents) {
          return res.status(403).json({
            error: `Agent limit reached for this plan (max ${limits.agents}). Upgrade the plan first.`,
          });
        }
      }
    }
    const hash = await bcrypt.hash(password, 10);
    const { rows } = await db.query(
      `INSERT INTO users (email, password_hash, business_id, role)
       VALUES ($1, $2, $3, $4) RETURNING id, email, role`,
      [email.toLowerCase().trim(), hash, req.params.id, role]
    );
    res.status(201).json(rows[0]);
  } catch (err) {
    if (err.code === "23505") return res.status(409).json({ error: "Email already exists" });
    res.status(500).json({ error: err.message });
  }
});

// DELETE /api/superadmin/users/:id — remove a team member
router.delete("/users/:id", async (req, res) => {
  try {
    await db.query("DELETE FROM users WHERE id = $1", [req.params.id]);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/superadmin/stats
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
      businesses:   parseInt(businesses.rows[0].count),
      users:        parseInt(users.rows[0].count),
      calls:        parseInt(calls.rows[0].count),
      tickets:      parseInt(tickets.rows[0].count),
      appointments: parseInt(appointments.rows[0].count),
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
