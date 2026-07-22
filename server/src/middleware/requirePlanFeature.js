const db = require("../models/db");
const { getPlan } = require("../config/plans");

function requirePlanFeature(feature) {
  return async (req, res, next) => {
    try {
      const { rows } = await db.query(
        "SELECT plan, subscription_status FROM businesses WHERE id = $1",
        [req.auth.businessId]
      );
      if (!rows.length) return res.status(404).json({ error: "Business not found" });
      const { plan, subscription_status } = rows[0];
      if (subscription_status === "suspended") {
        return res.status(403).json({ error: "Your account is suspended. Please contact support." });
      }
      const limits = getPlan(plan);
      if (!limits[feature]) {
        return res.status(403).json({
          error: `This feature is not available on the ${limits.label} plan. Please upgrade.`,
          upgradeRequired: true,
          currentPlan: plan,
          feature,
        });
      }
      req.planLimits = limits;
      req.businessPlan = plan;
      next();
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  };
}

module.exports = requirePlanFeature;
