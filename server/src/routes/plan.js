const express = require("express");
const router = express.Router();
const db = require("../models/db");
const { getPlan, PLANS } = require("../config/plans");

// GET /api/plan/usage — current plan + usage stats for the dashboard
router.get("/usage", async (req, res) => {
  const { businessId } = req.auth;
  try {
    const [bizRow, agentCount, callCount] = await Promise.all([
      db.query("SELECT plan, subscription_status, trial_ends_at FROM businesses WHERE id = $1", [businessId]),
      db.query("SELECT COUNT(*) FROM users WHERE business_id = $1", [businessId]),
      db.query(
        "SELECT COUNT(*) FROM calls WHERE business_id = $1 AND created_at >= DATE_TRUNC('month', NOW())",
        [businessId]
      ),
    ]);

    const biz = bizRow.rows[0];
    if (!biz) return res.status(404).json({ error: "Business not found" });

    const limits = getPlan(biz.plan);
    const agents = parseInt(agentCount.rows[0].count);
    const calls  = parseInt(callCount.rows[0].count);

    res.json({
      plan:               biz.plan || "trial",
      planLabel:          limits.label,
      status:             biz.subscription_status,
      trialEndsAt:        biz.trial_ends_at,
      limits: {
        agents:        limits.agents === Infinity ? null : limits.agents,
        callsPerMonth: limits.callsPerMonth === Infinity ? null : limits.callsPerMonth,
        whatsapp:      limits.whatsapp,
        calendar:      limits.calendar,
        analytics:     limits.analytics,
      },
      usage: {
        agents,
        callsThisMonth: calls,
      },
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/plan/plans — return all plan info (for upgrade page)
router.get("/plans", (_req, res) => {
  const display = Object.entries(PLANS).map(([key, p]) => ({
    key,
    label: p.label,
    agents:        p.agents === Infinity ? "Unlimited" : p.agents,
    callsPerMonth: p.callsPerMonth === Infinity ? "Unlimited" : p.callsPerMonth,
    whatsapp:  p.whatsapp,
    calendar:  p.calendar,
    analytics: p.analytics,
  }));
  res.json(display);
});

module.exports = router;
