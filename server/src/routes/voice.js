const express = require("express");
const router = express.Router();
const db = require("../models/db");
const { handleVoiceConversation } = require("../services/buddyService");

const VOICE = process.env.TWILIO_VOICE || "Polly.Amy";
const LANGUAGE = "en-GB";

function twimlSay(text, gather = true, action = "/api/voice/respond") {
  const safe = text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  if (gather) {
    return `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Gather input="speech" action="${action}" method="POST" speechTimeout="auto" language="${LANGUAGE}">
    <Say voice="${VOICE}">${safe}</Say>
  </Gather>
  <Say voice="${VOICE}">Sorry, I didn't hear anything. Please call back and we'll be happy to help. Goodbye!</Say>
</Response>`;
  }
  return `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say voice="${VOICE}">${safe}</Say>
  <Hangup/>
</Response>`;
}

async function getBusinessSettings(businessId) {
  if (!db.isConnected() || !businessId) return {};
  try {
    const { rows } = await db.query(
      "SELECT business_name, sector FROM settings WHERE business_id = $1 LIMIT 1",
      [businessId]
    );
    return rows[0] || {};
  } catch { return {}; }
}

async function getDefaultBusinessId() {
  if (!db.isConnected()) return null;
  try {
    const { rows } = await db.query(
      "SELECT id FROM businesses ORDER BY is_live DESC, created_at DESC LIMIT 1"
    );
    return rows[0]?.id || null;
  } catch { return null; }
}

// POST /api/voice/inbound — Twilio calls this when a call comes in
router.post("/inbound", async (req, res) => {
  const { CallSid, From } = req.body;
  res.set("Content-Type", "text/xml");

  if (!CallSid) return res.send(twimlSay("Hello! Thank you for calling. How can I help you today?"));

  const callerNumber = From?.replace("whatsapp:", "") || "unknown";
  const businessId = await getDefaultBusinessId();
  const settings = await getBusinessSettings(businessId);
  const businessName = settings.business_name || "us";

  const greeting = `Hello! Thank you for calling ${businessName}. How can I help you today?`;

  if (db.isConnected()) {
    try {
      await db.query(
        `INSERT INTO voice_sessions (call_sid, business_id, caller_number, messages)
         VALUES ($1, $2, $3, $4)
         ON CONFLICT (call_sid) DO NOTHING`,
        [CallSid, businessId, callerNumber, JSON.stringify([
          { role: "assistant", content: greeting }
        ])]
      );
    } catch (err) {
      console.error("Voice session create failed:", err.message);
    }
  }

  res.send(twimlSay(greeting));
});

// POST /api/voice/respond — Twilio sends speech transcript here
router.post("/respond", async (req, res) => {
  const { CallSid, SpeechResult, From } = req.body;
  res.set("Content-Type", "text/xml");

  if (!SpeechResult) {
    return res.send(twimlSay("Sorry, I didn't catch that. Could you say that again please?"));
  }

  const callerNumber = From?.replace("whatsapp:", "") || "unknown";

  let session = null;
  let messages = [];
  let businessId = null;

  if (db.isConnected()) {
    try {
      const { rows } = await db.query(
        "SELECT * FROM voice_sessions WHERE call_sid = $1",
        [CallSid]
      );
      session = rows[0] || null;
      messages = session?.messages || [];
      businessId = session?.business_id || await getDefaultBusinessId();
    } catch (err) {
      console.error("Voice session fetch failed:", err.message);
      businessId = await getDefaultBusinessId();
    }
  }

  messages.push({ role: "user", content: SpeechResult });

  const settings = await getBusinessSettings(businessId);
  const today = new Date().toISOString().split("T")[0];
  const { reply, booking, hangup } = await handleVoiceConversation(
    messages, settings.business_name, settings.sector, today
  );

  messages.push({ role: "assistant", content: reply });

  // Save appointment if booking detected
  if (booking?.name && booking?.date && booking?.time && db.isConnected()) {
    try {
      const apptAt = new Date(`${booking.date}T${booking.time}:00`);
      await db.query(
        `INSERT INTO appointments (business_id, customer_number, customer_name, appointment_at, notes, status)
         VALUES ($1, $2, $3, $4, $5, 'confirmed')`,
        [businessId, callerNumber, booking.name, apptAt, booking.notes || "Booked via phone call"]
      );
      console.log(`Voice booking: ${booking.name} on ${booking.date} at ${booking.time}`);
    } catch (err) {
      console.error("Voice appointment insert failed:", err.message);
    }
  }

  // Update session
  if (db.isConnected()) {
    try {
      await db.query(
        `UPDATE voice_sessions SET messages = $1, booking = $2, ended = $3, updated_at = NOW() WHERE call_sid = $4`,
        [JSON.stringify(messages), booking ? JSON.stringify(booking) : null, hangup, CallSid]
      );
    } catch (err) {
      console.error("Voice session update failed:", err.message);
    }
  }

  if (hangup) {
    return res.send(twimlSay(reply, false));
  }

  res.send(twimlSay(reply));
});

module.exports = router;
