const express = require("express");
const router = express.Router();
const db = require("../models/db");
const twilio = require("twilio");
const { detectKeyword, handleBookingConversation } = require("../services/buddyService");
const requireAuth = require("../middleware/requireAuth");

const COMPLAINT_REGEX = /\b(complaint|complain|unhappy|not happy|wrong|mistake|error|terrible|awful|disgusting|refund|rude|unacceptable)\b/i;

async function autoRaiseTicket(convId, customerNumber, body, businessId) {
  try {
    await db.query(
      `INSERT INTO tickets (conversation_id, customer_number, description, priority, sla_response_at, sla_resolve_at, business_id)
       VALUES ($1, $2, $3, 'P1', NOW() + INTERVAL '30 minutes', NOW() + INTERVAL '4 hours', $4)`,
      [convId, customerNumber, `Auto-raised: customer message contained complaint keywords.\n\nMessage: "${body}"`, businessId]
    );
    console.log(`Auto-ticket raised for ${customerNumber}`);
  } catch (err) {
    console.error("Auto-ticket failed:", err.message);
  }
}

const client = twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);
const FROM = process.env.TWILIO_FROM_NUMBER;
const CHANNEL = process.env.CHANNEL || "whatsapp";

function toAddress(number) {
  return CHANNEL === "whatsapp" ? `whatsapp:${number}` : number;
}

async function getBusinessSettings(businessId) {
  if (!db.isConnected()) return {};
  try {
    const q = businessId
      ? "SELECT business_name, sector FROM settings WHERE business_id = $1 LIMIT 1"
      : "SELECT business_name, sector FROM settings LIMIT 1";
    const { rows } = await db.query(q, businessId ? [businessId] : []);
    return rows[0] || {};
  } catch { return {}; }
}

async function getDefaultBusinessId() {
  if (!db.isConnected()) return null;
  try {
    // Prefer live business, then most recently created
    const { rows } = await db.query(
      "SELECT id FROM businesses ORDER BY is_live DESC, created_at DESC LIMIT 1"
    );
    return rows[0]?.id || null;
  } catch { return null; }
}

async function sendWhatsApp(to, body) {
  const msg = await client.messages.create({
    from: toAddress(FROM),
    to: toAddress(to),
    body,
  });
  return msg.sid;
}

// POST /api/inbox/inbound — Twilio webhook for incoming WhatsApp messages
router.post("/inbound", async (req, res) => {
  const { From, Body, MessageSid } = req.body;
  if (!From || !Body) return res.sendStatus(204);

  const customerNumber = From.replace("whatsapp:", "");
  const keyword = detectKeyword(Body);
  const businessId = await getDefaultBusinessId();

  if (db.isConnected()) {
    try {
      // Upsert conversation — set opt_in on first message
      await db.query(
        `INSERT INTO conversations (customer_number, status, last_message, last_message_at, opt_in_whatsapp, opt_in_at, business_id)
         VALUES ($1, 'open', $2, NOW(), true, NOW(), $3)
         ON CONFLICT (customer_number) DO UPDATE SET
           last_message = $2, last_message_at = NOW(),
           status = CASE WHEN conversations.status = 'resolved' THEN 'open' ELSE conversations.status END,
           opt_in_whatsapp = true,
           opt_in_at = COALESCE(conversations.opt_in_at, NOW()),
           business_id = $3`,
        [customerNumber, Body, businessId]
      );

      const { rows } = await db.query(
        "SELECT id, opted_out_at FROM conversations WHERE customer_number = $1", [customerNumber]
      );
      const conv = rows[0];
      const convId = conv?.id;

      if (convId) {
        await db.query(
          `INSERT INTO messages (conversation_id, direction, body, twilio_sid)
           VALUES ($1, 'inbound', $2, $3)`,
          [convId, Body, MessageSid]
        );

        // STOP — opt out immediately, send final SMS, no further WhatsApp
        if (keyword === "stop") {
          await db.query(
            "UPDATE conversations SET opted_out_at = NOW(), opt_in_whatsapp = false, status = 'resolved' WHERE id = $1",
            [convId]
          );
          const reply = "You've been unsubscribed. No further messages will be sent. Take care!";
          const sid = await sendWhatsApp(customerNumber, reply);
          await db.query(
            "INSERT INTO messages (conversation_id, direction, body, twilio_sid) VALUES ($1, 'outbound', $2, $3)",
            [convId, reply, sid]
          );
          console.log(`GDPR opt-out recorded for ${customerNumber} at ${new Date().toISOString()}`);
          return res.sendStatus(204);
        }

        // Block all outbound to opted-out numbers
        if (conv.opted_out_at) {
          console.log(`Blocked outbound to opted-out number ${customerNumber}`);
          return res.sendStatus(204);
        }

        // Send acknowledgement immediately (AC4: within 10s)
        const ack = "Thanks for your message — we've received it and will get back to you shortly. 👍";
        const ackSid = await sendWhatsApp(customerNumber, ack);
        await db.query(
          "INSERT INTO messages (conversation_id, direction, body, twilio_sid) VALUES ($1, 'outbound', $2, $3)",
          [convId, ack, ackSid]
        );

        if (keyword === "confirm") {
          const reply = "Brilliant — your appointment is confirmed! We'll see you then. 😊";
          const sid = await sendWhatsApp(customerNumber, reply);
          await db.query(
            "INSERT INTO messages (conversation_id, direction, body, twilio_sid) VALUES ($1, 'outbound', $2, $3)",
            [convId, reply, sid]
          );
          await db.query("UPDATE conversations SET status = 'resolved' WHERE id = $1", [convId]);

        } else if (keyword === "cancel") {
          const reply = "No problem — your appointment has been cancelled. Call us if you'd like to rebook.";
          const sid = await sendWhatsApp(customerNumber, reply);
          await db.query(
            "INSERT INTO messages (conversation_id, direction, body, twilio_sid) VALUES ($1, 'outbound', $2, $3)",
            [convId, reply, sid]
          );
          await db.query("UPDATE conversations SET status = 'resolved' WHERE id = $1", [convId]);

        } else {
          // Auto-raise P1 ticket for complaint keywords
          if (COMPLAINT_REGEX.test(Body)) {
            await autoRaiseTicket(convId, customerNumber, Body, businessId);
          }

          // Multi-turn Buddy AI — handles booking conversation with full history
          const settings = await getBusinessSettings(businessId);
          const { rows: history } = await db.query(
            `SELECT direction, body FROM messages WHERE conversation_id = $1 ORDER BY created_at ASC`,
            [convId]
          );
          const today = new Date().toISOString().split("T")[0];
          const { reply: aiReply, booking } = await handleBookingConversation(
            history, settings.business_name, settings.sector, today
          );

          // If Buddy extracted booking details, save the appointment
          if (booking?.name && booking?.date && booking?.time) {
            try {
              const apptAt = new Date(`${booking.date}T${booking.time}:00`);
              await db.query(
                `INSERT INTO appointments (business_id, customer_number, customer_name, appointment_at, notes, status)
                 VALUES ($1, $2, $3, $4, $5, 'confirmed')`,
                [businessId, customerNumber, booking.name, apptAt, booking.notes || "Booked via WhatsApp"]
              );
              console.log(`Appointment booked for ${booking.name} on ${booking.date} at ${booking.time}`);
            } catch (err) {
              console.error("Appointment insert failed:", err.message);
            }
          }

          if (aiReply) {
            const sid = await sendWhatsApp(customerNumber, aiReply);
            await db.query(
              "INSERT INTO messages (conversation_id, direction, body, twilio_sid) VALUES ($1, 'outbound', $2, $3)",
              [convId, aiReply, sid]
            );
          }
          // Thread stays open in inbox for human agent
        }
      }
    } catch (err) {
      console.error("Inbox inbound failed:", err.message);
    }
  }

  res.sendStatus(204);
});

// POST /api/inbox/simulate — test Buddy booking conversation without sending WhatsApp
// Body: { customerNumber, message, businessId (optional) }
router.post("/simulate", requireAuth, async (req, res) => {
  const { customerNumber, message } = req.body;
  if (!customerNumber || !message) return res.status(400).json({ error: "customerNumber and message required" });

  const businessId = req.auth?.businessId;
  if (!db.isConnected()) return res.status(503).json({ error: "DB not connected" });

  try {
    // Upsert conversation
    await db.query(
      `INSERT INTO conversations (customer_number, status, last_message, last_message_at, opt_in_whatsapp, opt_in_at, business_id)
       VALUES ($1, 'open', $2, NOW(), true, NOW(), $3)
       ON CONFLICT (customer_number) DO UPDATE SET
         last_message = $2, last_message_at = NOW(),
         status = CASE WHEN conversations.status = 'resolved' THEN 'open' ELSE conversations.status END,
         business_id = $3`,
      [customerNumber, message, businessId]
    );

    const { rows } = await db.query("SELECT id FROM conversations WHERE customer_number = $1", [customerNumber]);
    const convId = rows[0]?.id;

    // Save inbound message
    await db.query(
      `INSERT INTO messages (conversation_id, direction, body, twilio_sid) VALUES ($1, 'inbound', $2, $3)`,
      [convId, message, `SIM_${Date.now()}`]
    );

    // Run Buddy
    const settings = await getBusinessSettings(businessId);
    const { rows: history } = await db.query(
      `SELECT direction, body FROM messages WHERE conversation_id = $1 ORDER BY created_at ASC`,
      [convId]
    );
    const today = new Date().toISOString().split("T")[0];
    const { reply, booking } = await handleBookingConversation(history, settings.business_name, settings.sector, today);

    // Save Buddy's reply as outbound (no Twilio)
    if (reply) {
      await db.query(
        `INSERT INTO messages (conversation_id, direction, body, twilio_sid) VALUES ($1, 'outbound', $2, $3)`,
        [convId, reply, `SIM_OUT_${Date.now()}`]
      );
      await db.query("UPDATE conversations SET last_message = $1, last_message_at = NOW() WHERE id = $2", [reply, convId]);
    }

    // Save appointment if booking detected
    let appointmentSaved = false;
    if (booking?.name && booking?.date && booking?.time) {
      try {
        const apptAt = new Date(`${booking.date}T${booking.time}:00`);
        await db.query(
          `INSERT INTO appointments (business_id, customer_number, customer_name, appointment_at, notes, status)
           VALUES ($1, $2, $3, $4, $5, 'confirmed')`,
          [businessId, customerNumber, booking.name, apptAt, booking.notes || "Booked via WhatsApp"]
        );
        appointmentSaved = true;
      } catch (err) {
        console.error("Simulate appointment insert failed:", err.message);
      }
    }

    res.json({ reply, booking, appointmentSaved, conversationId: convId });
  } catch (err) {
    console.error("Simulate error:", err.message);
    res.status(500).json({ error: err.message });
  }
});

// GET /api/inbox — list open threads sorted by wait time
router.get("/", requireAuth, async (req, res) => {
  if (!db.isConnected()) return res.json([]);
  const businessId = req.auth?.businessId;
  try {
    const { rows } = await db.query(`
      SELECT c.id, c.customer_number, c.status, c.last_message, c.last_message_at,
             NOW() - c.last_message_at AS waiting,
             (SELECT COUNT(*) FROM messages m WHERE m.conversation_id = c.id) AS message_count
      FROM conversations c
      WHERE c.status = 'open'
        AND c.business_id = $1
      ORDER BY c.last_message_at ASC
    `, [businessId]);
    res.json(rows);
  } catch (err) {
    console.error("Inbox list failed:", err.message);
    res.json([]);
  }
});

// GET /api/inbox/:id/suggest — AI suggested replies based on conversation history
router.get("/:id/suggest", requireAuth, async (req, res) => {
  if (!db.isConnected()) return res.status(503).json({ error: "DB not connected" });
  try {
    const businessId = req.auth?.businessId;

    // Get business settings for context
    const settings = await getBusinessSettings(businessId);

    // Get last 6 messages for context
    const { rows: messages } = await db.query(
      `SELECT direction, body FROM messages WHERE conversation_id = $1 ORDER BY created_at DESC LIMIT 6`,
      [req.params.id]
    );
    if (!messages.length) return res.json({ suggestions: [] });

    // Build conversation context (reverse to chronological)
    const history = messages.reverse().map(m =>
      `${m.direction === "inbound" ? "Customer" : "Agent"}: ${m.body}`
    ).join("\n");

    const lastCustomerMsg = messages.filter(m => m.direction === "inbound").slice(-1)[0]?.body || "";

    const groq = require("groq-sdk");
    const Groq = groq;
    if (!process.env.GROQ_API_KEY) return res.json({ suggestions: [] });

    const client = new Groq({ apiKey: process.env.GROQ_API_KEY });
    const completion = await client.chat.completions.create({
      model: "llama-3.3-70b-versatile",
      max_tokens: 300,
      messages: [
        {
          role: "system",
          content: `You are a customer service assistant for ${settings.business_name || "this business"} (${settings.sector || "small business"}).
Generate exactly 3 short, distinct WhatsApp reply suggestions for the agent to send to the customer.
Each suggestion should be on its own line starting with a number and dot (1. 2. 3.).
Keep each reply under 2 sentences. Be warm, professional, and helpful.
Do not add any explanation or preamble — just the 3 numbered suggestions.`
        },
        {
          role: "user",
          content: `Conversation so far:\n${history}\n\nGenerate 3 reply suggestions for the agent to send next.`
        }
      ],
    });

    const raw = completion.choices[0]?.message?.content?.trim() || "";
    const suggestions = raw
      .split("\n")
      .filter(l => /^\d+\./.test(l.trim()))
      .map(l => l.replace(/^\d+\.\s*/, "").trim())
      .filter(Boolean)
      .slice(0, 3);

    res.json({ suggestions });
  } catch (err) {
    console.error("Suggest reply error:", err.message);
    res.json({ suggestions: [] });
  }
});

// GET /api/inbox/:id/messages — full conversation history
router.get("/:id/messages", requireAuth, async (req, res) => {
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
router.post("/:id/reply", requireAuth, async (req, res) => {
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
router.post("/:id/resolve", requireAuth, async (req, res) => {
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
