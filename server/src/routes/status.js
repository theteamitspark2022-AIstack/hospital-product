const express = require("express");
const router = express.Router();
const db = require("../models/db");
const callService = require("../services/callService");
const config = require("../../config");

// GET /api/status — business status + checklist state
router.get("/", async (req, res) => {
  const businessId = req.auth?.businessId;
  let isLive = false;
  let callCount = 0;

  let settingsConfigured = false;
  let phoneConnected = false;
  if (db.isConnected()) {
    try {
      const biz = await db.query("SELECT is_live FROM businesses WHERE id = $1", [businessId]);
      if (biz.rows.length) isLive = biz.rows[0].is_live;
      const calls = await db.query("SELECT COUNT(*) FROM calls WHERE business_id = $1::varchar", [businessId]);
      callCount = parseInt(calls.rows[0].count);
      const settings = await db.query(
        "SELECT callback_number, sector, phone_setup_complete FROM settings WHERE business_id = $1 LIMIT 1", [businessId]
      );
      if (settings.rows.length) {
        const s = settings.rows[0];
        settingsConfigured = !!(s.callback_number && s.sector);
        phoneConnected = !!s.phone_setup_complete;
      }
    } catch (err) {
      console.error("Status query failed:", err.message);
    }
  }

  const steps = [
    { key: "signup",         label: "Sign up",              done: true },
    { key: "verify_email",   label: "Verify email",          done: true },
    { key: "templates",      label: "Configure settings",    done: settingsConfigured },
    { key: "connect_number", label: "Connect your number",   done: phoneConnected },
    { key: "test_call",      label: "Make test call",        done: callCount > 0 },
    { key: "go_live",        label: "Go live",               done: isLive },
  ];

  const completed = steps.filter((s) => s.done).length;
  const percent = Math.round((completed / steps.length) * 100);

  res.json({
    businessName: config.hospital.name,
    businessPhone: config.hospital.phone,
    isLive,
    checklist: steps,
    percentComplete: percent,
  });
});

// POST /api/status/golive — mark business as live
router.post("/golive", async (req, res) => {
  const businessId = req.auth?.businessId;
  if (db.isConnected()) {
    try {
      await db.query(
        "UPDATE businesses SET is_live = true WHERE id = $1", [businessId]
      );
    } catch (err) {
      console.error("Go-live failed:", err.message);
      return res.status(500).json({ error: "Failed to go live" });
    }
  }
  res.json({ isLive: true });
});

// GET /api/status/calls — paginated call log scoped to business
router.get("/calls", async (req, res) => {
  const businessId = req.auth?.businessId;
  const calls = await callService.getCalls({ limit: 20, businessId });
  res.json(calls);
});

module.exports = router;
