const express = require("express");
const router = express.Router();
const db = require("../models/db");
const config = require("../../config");
const twilio = require("twilio");

const twilioClient = () => twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);

const REQUIRED_TOKENS = {
  missed_call: ["{HOSPITAL_NAME}"],
};

// GET /api/settings — load current settings
router.get("/", async (req, res) => {
  const businessId = req.auth?.businessId;
  const defaults = {
    businessName: config.hospital.name,
    callbackNumber: config.hospital.phone,
    sector: "Healthcare",
    country: "UK",
    missedCallTemplate: config.message.template(null),
  };

  if (!db.isConnected()) return res.json(defaults);

  try {
    const { rows } = await db.query(
      "SELECT * FROM settings WHERE business_id = $1 LIMIT 1", [businessId]
    );
    if (!rows.length) return res.json(defaults);
    const s = rows[0];
    res.json({
      businessName: s.business_name || defaults.businessName,
      callbackNumber: s.callback_number || defaults.callbackNumber,
      sector: s.sector || defaults.sector,
      country: s.country || defaults.country,
      missedCallTemplate: s.missed_call_template || defaults.missedCallTemplate,
      businessPhone: s.business_phone || null,
      phoneSetupType: s.phone_setup_type || null,
      phoneSetupComplete: s.phone_setup_complete || false,
    });
  } catch (err) {
    console.error("Settings load failed:", err.message);
    res.json(defaults);
  }
});

// POST /api/settings — save settings
router.post("/", async (req, res) => {
  const businessId = req.auth?.businessId;
  const { businessName, callbackNumber, sector, country, missedCallTemplate } = req.body;

  if (!businessName || businessName.trim().length < 2 || businessName.trim().length > 100) {
    return res.status(400).json({ error: "Business name must be between 2 and 100 characters" });
  }
  if (callbackNumber && !/^\+\d{7,15}$/.test(callbackNumber.replace(/\s+/g, ""))) {
    return res.status(400).json({ error: "Call-back number must be in international format e.g. +447911123456" });
  }
  if (!missedCallTemplate || !missedCallTemplate.trim()) {
    return res.status(400).json({ error: "Missed call message template is required" });
  }
  const missing = REQUIRED_TOKENS.missed_call.filter(t => !missedCallTemplate.includes(t));
  if (missing.length) {
    return res.status(400).json({ error: `Missing required token: ${missing.join(", ")}` });
  }

  if (!db.isConnected()) return res.json({ ok: true });

  try {
    await db.query(
      `INSERT INTO settings (id, business_id, business_name, callback_number, sector, country, missed_call_template)
       VALUES ($1, $1, $2, $3, $4, $5, $6)
       ON CONFLICT (id) DO UPDATE SET
         business_name = $2, callback_number = $3, sector = $4,
         country = $5, missed_call_template = $6, updated_at = NOW()`,
      [businessId, businessName, callbackNumber, sector, country, missedCallTemplate]
    );
    res.json({ ok: true });
  } catch (err) {
    console.error("Settings save failed:", err.message);
    res.status(500).json({ error: "Failed to save settings" });
  }
});

// POST /api/settings/connect-number — save number setup choice
router.post("/connect-number", async (req, res) => {
  const businessId = req.auth?.businessId;
  const { type, phone } = req.body;
  if (!type || !["landline", "mobile", "new"].includes(type)) {
    return res.status(400).json({ error: "type must be landline, mobile, or new" });
  }
  if (!db.isConnected()) return res.status(503).json({ error: "DB not connected" });

  try {
    if (type === "new") {
      // Provision a Twilio UK number
      const client = twilioClient();
      const baseUrl = process.env.BASE_URL || "https://hospital-product.onrender.com";
      const available = await client.availablePhoneNumbers("GB").local.list({
        limit: 1, smsEnabled: true, voiceEnabled: true,
      });
      if (!available.length) return res.status(503).json({ error: "No UK numbers available at this time" });

      const purchased = await client.incomingPhoneNumbers.create({
        phoneNumber: available[0].phoneNumber,
        voiceUrl: `${baseUrl}/api/voice/inbound`,
        voiceMethod: "POST",
        smsUrl: `${baseUrl}/api/inbox/inbound`,
        smsMethod: "POST",
        friendlyName: `AIVoiceConnect — ${businessId}`,
      });

      await db.query(
        `UPDATE settings SET business_phone = $1, phone_setup_type = 'new', phone_setup_complete = true, updated_at = NOW()
         WHERE business_id = $2`,
        [purchased.phoneNumber, businessId]
      );
      return res.json({ ok: true, type: "new", phone: purchased.phoneNumber });
    }

    // landline or mobile — just save the number they provide
    if (!phone || !/^\+\d{7,15}$/.test(phone.replace(/\s+/g, ""))) {
      return res.status(400).json({ error: "Phone must be in international format e.g. +447911123456" });
    }
    await db.query(
      `UPDATE settings SET business_phone = $1, phone_setup_type = $2, phone_setup_complete = true, updated_at = NOW()
       WHERE business_id = $3`,
      [phone.replace(/\s+/g, ""), type, businessId]
    );
    res.json({ ok: true, type, phone: phone.replace(/\s+/g, "") });
  } catch (err) {
    console.error("Connect number failed:", err.message);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
