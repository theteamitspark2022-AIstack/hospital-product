const express = require("express");
const router = express.Router();
const callService = require("../services/callService");
const messageService = require("../services/messageService");
const db = require("../models/db");

// POST /api/calls/inbound — Twilio webhook for call status changes
router.post("/inbound", async (req, res) => {
  const { CallStatus, CallSid, To, From, CallerName, Duration } = req.body;

  const missedStatuses = ["no-answer", "busy", "failed", "canceled"];

  // Log every call to database
  await callService.logCall({
    callSid: CallSid,
    from: From,
    to: To,
    status: CallStatus,
    callerName: CallerName || null,
    duration: Duration ? parseInt(Duration) : 0,
  });

  // Only send WhatsApp message for missed calls
  if (!missedStatuses.includes(CallStatus)) {
    return res.sendStatus(204);
  }

  try {
    await messageService.sendMissedCallMessage(From, CallerName);
    console.log(`[${CallStatus}] Sent message to ${From}`);
  } catch (err) {
    console.error("Failed to send message:", err.message);
  }

  res.sendStatus(204);
});

module.exports = router;
