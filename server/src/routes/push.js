const express = require("express");
const router = express.Router();
const db = require("../models/db");
const webpush = require("web-push");

function getPushClient() {
  const pub = process.env.VAPID_PUBLIC_KEY;
  const priv = process.env.VAPID_PRIVATE_KEY;
  if (!pub || !priv) return null;
  webpush.setVapidDetails("mailto:hello@aivoiceconnect.co.uk", pub, priv);
  return webpush;
}

// GET /api/push/vapid-public — returns VAPID public key for SW subscription
router.get("/vapid-public", (req, res) => {
  const key = process.env.VAPID_PUBLIC_KEY;
  if (!key) return res.status(503).json({ error: "Push not configured" });
  res.json({ publicKey: key });
});

// POST /api/push/subscribe — save push subscription for this business
router.post("/subscribe", async (req, res) => {
  const businessId = req.auth?.businessId;
  const { subscription } = req.body;
  if (!subscription?.endpoint) return res.status(400).json({ error: "Missing subscription" });
  if (!db.isConnected()) return res.status(503).json({ error: "DB not connected" });
  try {
    await db.query(
      `INSERT INTO push_subscriptions (business_id, endpoint, p256dh, auth, updated_at)
       VALUES ($1, $2, $3, $4, NOW())
       ON CONFLICT (endpoint) DO UPDATE SET business_id=$1, p256dh=$3, auth=$4, updated_at=NOW()`,
      [businessId, subscription.endpoint, subscription.keys?.p256dh, subscription.keys?.auth]
    );
    res.json({ ok: true });
  } catch (err) {
    console.error("Push subscribe failed:", err.message);
    res.status(500).json({ error: "Failed to save subscription" });
  }
});

// POST /api/push/unsubscribe — remove subscription
router.post("/unsubscribe", async (req, res) => {
  const { endpoint } = req.body;
  if (!endpoint) return res.status(400).json({ error: "Missing endpoint" });
  if (db.isConnected()) {
    await db.query("DELETE FROM push_subscriptions WHERE endpoint=$1", [endpoint]).catch(() => {});
  }
  res.json({ ok: true });
});

// Internal helper — called by inbox/calls routes
async function sendPushToBusinesses(businessIds, payload) {
  const client = getPushClient();
  if (!client || !db.isConnected()) return;
  try {
    const ids = Array.isArray(businessIds) ? businessIds : [businessIds];
    const placeholders = ids.map((_, i) => `$${i + 1}`).join(",");
    const { rows } = await db.query(
      `SELECT endpoint, p256dh, auth FROM push_subscriptions WHERE business_id IN (${placeholders})`,
      ids
    );
    await Promise.allSettled(
      rows.map((row) =>
        client.sendNotification(
          { endpoint: row.endpoint, keys: { p256dh: row.p256dh, auth: row.auth } },
          JSON.stringify(payload)
        ).catch(async (err) => {
          // Remove stale subscriptions (410 Gone)
          if (err.statusCode === 410 || err.statusCode === 404) {
            await db.query("DELETE FROM push_subscriptions WHERE endpoint=$1", [row.endpoint]).catch(() => {});
          }
        })
      )
    );
  } catch (err) {
    console.error("Push send failed:", err.message);
  }
}

module.exports = router;
module.exports.sendPushToBusinesses = sendPushToBusinesses;
