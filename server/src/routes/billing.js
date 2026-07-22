const express = require("express");
const router = express.Router();
const stripe = require("stripe")(process.env.STRIPE_SECRET_KEY);
const db = require("../models/db");

const PLANS = {
  starter: { name: "Starter", price: 4900, currency: "gbp", interval: "month" },
  growth:  { name: "Growth",  price: 9900, currency: "gbp", interval: "month" },
  pro:     { name: "Pro",     price: 19900, currency: "gbp", interval: "month" },
};

// Cache price IDs after first lookup/creation
const priceIdCache = {};

async function getOrCreatePrice(planKey) {
  if (priceIdCache[planKey]) return priceIdCache[planKey];

  const plan = PLANS[planKey];
  if (!plan) throw new Error("Unknown plan");

  // Search for existing product
  const products = await stripe.products.search({ query: `name:"AIVoiceConnect ${plan.name}"`, limit: 1 });
  let product;
  if (products.data.length) {
    product = products.data[0];
  } else {
    product = await stripe.products.create({
      name: `AIVoiceConnect ${plan.name}`,
      description: getPlanDescription(planKey),
    });
  }

  // Search for existing recurring price
  const prices = await stripe.prices.list({ product: product.id, active: true, limit: 10 });
  const match = prices.data.find(
    (p) => p.unit_amount === plan.price && p.currency === plan.currency && p.recurring?.interval === plan.interval
  );
  if (match) {
    priceIdCache[planKey] = match.id;
    return match.id;
  }

  const newPrice = await stripe.prices.create({
    product: product.id,
    unit_amount: plan.price,
    currency: plan.currency,
    recurring: { interval: plan.interval, trial_period_days: 14 },
  });
  priceIdCache[planKey] = newPrice.id;
  return newPrice.id;
}

function getPlanDescription(planKey) {
  const desc = {
    starter: "Up to 500 calls/mo, 1 user, AI voice + WhatsApp",
    growth:  "Up to 2,000 calls/mo, 5 users, AI voice + WhatsApp + analytics",
    pro:     "Unlimited calls, unlimited users, priority support, white-label",
  };
  return desc[planKey] || "";
}

// GET /api/billing/status — current subscription info
router.get("/status", async (req, res) => {
  const businessId = req.auth?.businessId;
  try {
    const { rows } = await db.query(
      "SELECT stripe_customer_id, stripe_subscription_id, plan, trial_ends_at, subscription_status FROM businesses WHERE id = $1",
      [businessId]
    );
    const biz = rows[0];
    if (!biz) return res.status(404).json({ error: "Business not found" });

    if (!biz.stripe_subscription_id) {
      return res.json({ plan: biz.plan || "trial", status: "no_subscription", trialEndsAt: biz.trial_ends_at });
    }

    const sub = await stripe.subscriptions.retrieve(biz.stripe_subscription_id);
    res.json({
      plan: biz.plan || "trial",
      status: sub.status,
      currentPeriodEnd: new Date(sub.current_period_end * 1000).toISOString(),
      trialEnd: sub.trial_end ? new Date(sub.trial_end * 1000).toISOString() : null,
      cancelAtPeriodEnd: sub.cancel_at_period_end,
    });
  } catch (err) {
    console.error("Billing status error:", err.message);
    res.status(500).json({ error: "Failed to get billing status" });
  }
});

// POST /api/billing/checkout — create Stripe Checkout session
router.post("/checkout", async (req, res) => {
  const { plan } = req.body;
  if (!PLANS[plan]) return res.status(400).json({ error: "Invalid plan" });

  const businessId = req.auth?.businessId;
  const { rows } = await db.query("SELECT id, name, stripe_customer_id FROM businesses WHERE id = $1", [businessId]);
  const biz = rows[0];
  if (!biz) return res.status(404).json({ error: "Business not found" });

  const userRow = await db.query("SELECT email FROM users WHERE business_id = $1 ORDER BY id ASC LIMIT 1", [businessId]);
  const email = userRow.rows[0]?.email;

  try {
    const priceId = await getOrCreatePrice(plan);

    // Create or reuse Stripe customer
    let customerId = biz.stripe_customer_id;
    if (!customerId) {
      const customer = await stripe.customers.create({ email, name: biz.name, metadata: { businessId } });
      customerId = customer.id;
      await db.query("UPDATE businesses SET stripe_customer_id = $1 WHERE id = $2", [customerId, businessId]);
    }

    const baseUrl = process.env.APP_URL || "https://localhost:3000";
    const session = await stripe.checkout.sessions.create({
      customer: customerId,
      payment_method_types: ["card"],
      line_items: [{ price: priceId, quantity: 1 }],
      mode: "subscription",
      subscription_data: { trial_period_days: 14 },
      success_url: `${baseUrl}/dashboard?billing=success`,
      cancel_url:  `${baseUrl}/dashboard?billing=cancel`,
      metadata: { businessId, plan },
    });

    res.json({ url: session.url });
  } catch (err) {
    console.error("Checkout error:", err.message);
    res.status(500).json({ error: "Failed to create checkout session" });
  }
});

// POST /api/billing/portal — Stripe customer portal (manage/cancel)
router.post("/portal", async (req, res) => {
  const businessId = req.auth?.businessId;
  const { rows } = await db.query("SELECT stripe_customer_id FROM businesses WHERE id = $1", [businessId]);
  const customerId = rows[0]?.stripe_customer_id;
  if (!customerId) return res.status(400).json({ error: "No billing account found" });

  try {
    const baseUrl = process.env.APP_URL || "https://localhost:3000";
    const session = await stripe.billingPortal.sessions.create({
      customer: customerId,
      return_url: `${baseUrl}/dashboard`,
    });
    res.json({ url: session.url });
  } catch (err) {
    console.error("Portal error:", err.message);
    res.status(500).json({ error: "Failed to open billing portal" });
  }
});

// POST /api/billing/webhook — Stripe webhook events
router.post("/webhook", express.raw({ type: "application/json" }), async (req, res) => {
  const sig = req.headers["stripe-signature"];
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
  let event;

  try {
    event = webhookSecret
      ? stripe.webhooks.constructEvent(req.body, sig, webhookSecret)
      : JSON.parse(req.body);
  } catch (err) {
    console.error("Webhook signature failed:", err.message);
    return res.status(400).send("Webhook Error");
  }

  try {
    if (event.type === "checkout.session.completed") {
      const session = event.data.object;
      const { businessId, plan } = session.metadata || {};
      if (businessId) {
        await db.query(
          "UPDATE businesses SET stripe_subscription_id = $1, plan = $2, subscription_status = 'trialing' WHERE id = $3",
          [session.subscription, plan, businessId]
        );
      }
    }

    if (event.type === "customer.subscription.updated" || event.type === "customer.subscription.deleted") {
      const sub = event.data.object;
      const customer = await stripe.customers.retrieve(sub.customer);
      const businessId = customer.metadata?.businessId;
      if (businessId) {
        await db.query(
          "UPDATE businesses SET subscription_status = $1, plan = $2 WHERE id = $3",
          [sub.status, sub.metadata?.plan || null, businessId]
        );
      }
    }
  } catch (err) {
    console.error("Webhook handler error:", err.message);
  }

  res.json({ received: true });
});

module.exports = router;
