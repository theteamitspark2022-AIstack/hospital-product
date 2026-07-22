const express = require("express");
const router = express.Router();
const db = require("../models/db");

const SLA = {
  P1: { responseMinutes: 30,   resolveMinutes: 240  },
  P2: { responseMinutes: 120,  resolveMinutes: 1440 },
  P3: { responseMinutes: 240,  resolveMinutes: 2880 },
};

function slaDeadlines(priority) {
  const s = SLA[priority] || SLA.P2;
  const now = new Date();
  return {
    sla_response_at: new Date(now.getTime() + s.responseMinutes * 60000),
    sla_resolve_at:  new Date(now.getTime() + s.resolveMinutes  * 60000),
  };
}

// POST /api/tickets — create a ticket
router.post("/", async (req, res) => {
  const { conversationId, customerNumber, description, priority = "P2", assignedAgent } = req.body;
  if (!customerNumber) return res.status(400).json({ error: "customerNumber required" });
  if (!db.isConnected()) return res.status(503).json({ error: "DB not connected" });

  const { sla_response_at, sla_resolve_at } = slaDeadlines(priority);

  try {
    const { rows } = await db.query(
      `INSERT INTO tickets (conversation_id, customer_number, description, priority, assigned_agent, sla_response_at, sla_resolve_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *`,
      [conversationId || null, customerNumber, description || null, priority, assignedAgent || null, sla_response_at, sla_resolve_at]
    );
    res.status(201).json(rows[0]);
  } catch (err) {
    console.error("Ticket create failed:", err.message);
    res.status(500).json({ error: err.message });
  }
});

// GET /api/tickets — list tickets (open by default, ?status=resolved for history)
router.get("/", async (req, res) => {
  if (!db.isConnected()) return res.json([]);
  const status = req.query.status || "open";
  const businessId = req.auth?.businessId;
  try {
    const { rows } = await db.query(
      `SELECT *,
        CASE WHEN sla_response_at < NOW() AND status = 'open' THEN true ELSE false END AS response_breached,
        CASE WHEN sla_resolve_at  < NOW() AND status != 'resolved' THEN true ELSE false END AS resolve_breached
       FROM tickets
       WHERE status = $1
         AND business_id = $2
       ORDER BY priority ASC, created_at ASC`,
      [status, businessId || null]
    );
    res.json(rows);
  } catch (err) {
    res.json([]);
  }
});

// PATCH /api/tickets/:id — update status or assignment
router.patch("/:id", async (req, res) => {
  if (!db.isConnected()) return res.status(503).json({ error: "DB not connected" });
  const { status, assignedAgent } = req.body;
  try {
    const { rows } = await db.query(
      `UPDATE tickets SET
        status = COALESCE($1, status),
        assigned_agent = COALESCE($2, assigned_agent),
        resolved_at = CASE WHEN $1 = 'resolved' THEN NOW() ELSE resolved_at END,
        updated_at = NOW()
       WHERE id = $3 RETURNING *`,
      [status || null, assignedAgent || null, req.params.id]
    );
    if (!rows.length) return res.status(404).json({ error: "Ticket not found" });
    res.json(rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
