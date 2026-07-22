const express = require("express");
const router = express.Router();
const db = require("../models/db");
const callService = require("../services/callService");
const config = require("../../config");

// GET /api/status — business status + checklist state
router.get("/", async (req, res) => {
  let isLive = false;
  let callCount = 0;

  if (db.isConnected()) {
    try {
      const biz = await db.query("SELECT is_live FROM businesses WHERE id = $1", ["default"]);
      if (biz.rows.length) isLive = biz.rows[0].is_live;
      const calls = await db.query("SELECT COUNT(*) FROM calls");
      callCount = parseInt(calls.rows[0].count);
    } catch (err) {
      console.error("Status query failed:", err.message);
    }
  }

  const steps = [
    { key: "signup",       label: "Sign up",           done: true },
    { key: "verify_email", label: "Verify email",       done: true },
    { key: "templates",    label: "Check templates",    done: true },
    { key: "test_call",    label: "Make test call",     done: callCount > 0 },
    { key: "go_live",      label: "Go live",            done: isLive },
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
  if (db.isConnected()) {
    try {
      await db.query(
        `INSERT INTO businesses (id, is_live) VALUES ('default', true)
         ON CONFLICT (id) DO UPDATE SET is_live = true`
      );
    } catch (err) {
      console.error("Go-live failed:", err.message);
      return res.status(500).json({ error: "Failed to go live" });
    }
  }
  res.json({ isLive: true });
});

// GET /api/status/calls — paginated call log
router.get("/calls", async (req, res) => {
  const calls = await callService.getCalls({ limit: 20 });
  res.json(calls);
});

module.exports = router;
