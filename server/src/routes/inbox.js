const express = require("express");
const router = express.Router();
const db = require("../models/db");
const twilio = require("twilio");

const client = twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);
const FROM = process.env.TWILIO_FROM_NUMBER;
const CHANNEL = process.env.CHANNEL || "whatsapp";

function toAddress(number) {
  return CHANNEL === "whatsapp" ? `whatsapp:${number}` : number;
}

// POST /api/inbox/inbound — Twilio webhook for incoming WhatsApp messages
router.post("/inbound", async (req, res) => {
  const { From, Body, MessageSid } = req.body;
  if (!From || !Body) return res.sendStatus(204);

  const customerNumber = From.replace("whatsapp:", "");

  if (db.isConnected()) {
    try {
      // Upsert conversation thread
      await db.query(
        `INSERT INTO conversations (customer_number, status, last_message, last_message_at)
         VALUES ($1, 'open', $2, NOW())
         ON CONFLICT (customer_number) DO UPDATE SET
           last_message = $2, last_message_at = NOW(),
           status = CASE WHEN conversations.status = 'resolved' THEN 'open' ELSE conversations.status END`,
        [customerNumber, Body]
      );

      // Get conversation id
      const { rows } = await db.query(
        "SELECT id FROM conversations WHERE customer_number = $1", [customerNumber]
      );
      const convId = rows[0]?.id;

      if (convId) {
        await db.query(
          `INSERT INTO messages (conversation_id, direction, body, twilio_sid)
           VALUES ($1, 'inbound', $2, $3)`,
          [convId, Body, MessageSid]
        );
      }
    } catch (err) {
      console.error("Inbox inbound failed:", err.message);
    }
  }

  res.sendStatus(204);
});

// GET /api/inbox — list open threads sorted by wait time
router.get("/", async (req, res) => {
  if (!db.isConnected()) return res.json([]);
  try {
    const { rows } = await db.query(`
      SELECT c.id, c.customer_number, c.status, c.last_message, c.last_message_at,
             NOW() - c.last_message_at AS waiting,
             (SELECT COUNT(*) FROM messages m WHERE m.conversation_id = c.id) AS message_count
      FROM conversations c
      WHERE c.status = 'open'
      ORDER BY c.last_message_at ASC
    `);
    res.json(rows);
  } catch (err) {
    console.error("Inbox list failed:", err.message);
    res.json([]);
  }
});

// GET /api/inbox/:id/messages — full conversation history
router.get("/:id/messages", async (req, res) => {
  if (!db.isConnected()) return res.json([]);
  try {
    const { rows } = await db.query(
      "SELECT * FROM messages WHERE conversation_id = $1 ORDER BY created_at ASC",
      [req.params.id]
    );
    res.json(rows);
  } catch (err) {
    res.json([]);
  }
});

// POST /api/inbox/:id/reply — send reply via Twilio
router.post("/:id/reply", async (req, res) => {
  const { body } = req.body;
  if (!body) return res.status(400).json({ error: "body required" });

  if (!db.isConnected()) return res.status(503).json({ error: "DB not connected" });

  try {
    const { rows } = await db.query(
      "SELECT customer_number FROM conversations WHERE id = $1", [req.params.id]
    );
    if (!rows.length) return res.status(404).json({ error: "Thread not found" });

    const to = rows[0].customer_number;
    const msg = await client.messages.create({
      from: toAddress(FROM),
      to: toAddress(to),
      body,
    });

    await db.query(
      "INSERT INTO messages (conversation_id, direction, body, twilio_sid) VALUES ($1, 'outbound', $2, $3)",
      [req.params.id, body, msg.sid]
    );

    res.json({ ok: true });
  } catch (err) {
    console.error("Reply failed:", err.message);
    res.status(500).json({ error: err.message });
  }
});

// POST /api/inbox/:id/resolve — mark thread resolved
router.post("/:id/resolve", async (req, res) => {
  if (!db.isConnected()) return res.status(503).json({ error: "DB not connected" });
  try {
    await db.query(
      "UPDATE conversations SET status = 'resolved', resolved_at = NOW() WHERE id = $1",
      [req.params.id]
    );
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
