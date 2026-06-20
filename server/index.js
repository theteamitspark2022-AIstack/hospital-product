require("dotenv").config();
const express = require("express");
const twilio = require("twilio");
const config = require("./config");

const app = express();
app.use(express.urlencoded({ extended: false }));
app.use(express.json());

const client = twilio(
  process.env.TWILIO_ACCOUNT_SID,
  process.env.TWILIO_AUTH_TOKEN
);

const CHANNEL = process.env.CHANNEL || "whatsapp"; // "whatsapp" | "sms"
const FROM = process.env.TWILIO_FROM_NUMBER;

// ── Build the outbound message from config ──────────────────────────────────
function buildMessage(callerName) {
  const h = config.hospital;
  return config.message
    .template(callerName)
    .replace("{HOSPITAL_NAME}", h.name)
    .replace("{MAPS}", h.maps)
    .replace("{WEBSITE}", h.website)
    .replace("{WHATSAPP}", h.whatsapp)
    .replace("{BOOKING}", h.bookingInstruction);
}

// ── Format numbers for Twilio ────────────────────────────────────────────────
function toAddress(number) {
  return CHANNEL === "whatsapp" ? `whatsapp:${number}` : number;
}

// ── Twilio webhook: called on every call status change ───────────────────────
app.post("/call-status", async (req, res) => {
  const { CallStatus, To, From, CallerName } = req.body;

  // Trigger only on missed / no-answer / busy / failed calls
  const missedStatuses = ["no-answer", "busy", "failed", "canceled"];
  if (!missedStatuses.includes(CallStatus)) {
    return res.sendStatus(204);
  }

  const patientNumber = From; // the patient who called
  const body = buildMessage(CallerName || null);

  try {
    await client.messages.create({
      from: toAddress(FROM),
      to: toAddress(patientNumber),
      body,
    });
    console.log(`[${CallStatus}] Sent ${CHANNEL} to ${patientNumber}`);
  } catch (err) {
    console.error("Failed to send message:", err.message);
  }

  res.sendStatus(204);
});

// ── Health check ─────────────────────────────────────────────────────────────
app.get("/health", (_req, res) => res.json({ status: "ok" }));

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
