const express = require("express");
const router = express.Router();
const db = require("../models/db");
const config = require("../../config");

const REQUIRED_TOKENS = {
  missed_call: ["{HOSPITAL_NAME}"],
};

// GET /api/settings — load current settings
router.get("/", async (req, res) => {
  const defaults = {
    businessName: config.hospital.name,
    callbackNumber: config.hospital.phone,
    sector: "Healthcare",
    country: "UK",
    missedCallTemplate: config.message.template(null)
      .replace("{HOSPITAL_NAME}", config.hospital.name)
      .replace("{MAPS}", config.hospital.maps)
      .replace("{WEBSITE}", config.hospital.website)
      .replace("{WHATSAPP}", config.hospital.whatsapp)
      .replace("{BOOKING}", config.hospital.bookingInstruction),
  };

  if (!db.isConnected()) return res.json(defaults);

  try {
    const { rows } = await db.query("SELECT * FROM settings WHERE id = 'default'");
    if (!rows.length) return res.json(defaults);
    const s = rows[0];
    res.json({
      businessName: s.business_name || defaults.businessName,
      callbackNumber: s.callback_number || defaults.callbackNumber,
      sector: s.sector || defaults.sector,
      country: s.country || defaults.country,
      missedCallTemplate: s.missed_call_template || defaults.missedCallTemplate,
    });
  } catch (err) {
    console.error("Settings load failed:", err.message);
    res.json(defaults);
  }
});

// POST /api/settings — save settings
router.post("/", async (req, res) => {
  const { businessName, callbackNumber, sector, country, missedCallTemplate } = req.body;

  // AC3: validate required tokens
  const missing = REQUIRED_TOKENS.missed_call.filter(t => !missedCallTemplate.includes(t));
  if (missing.length) {
    return res.status(400).json({ error: `Missing required tokens: ${missing.join(", ")}` });
  }

  if (!db.isConnected()) return res.json({ ok: true });

  try {
    await db.query(
      `INSERT INTO settings (id, business_name, callback_number, sector, country, missed_call_template)
       VALUES ('default', $1, $2, $3, $4, $5)
       ON CONFLICT (id) DO UPDATE SET
         business_name = $1, callback_number = $2, sector = $3,
         country = $4, missed_call_template = $5, updated_at = NOW()`,
      [businessName, callbackNumber, sector, country, missedCallTemplate]
    );
    res.json({ ok: true });
  } catch (err) {
    console.error("Settings save failed:", err.message);
    res.status(500).json({ error: "Failed to save settings" });
  }
});

module.exports = router;
