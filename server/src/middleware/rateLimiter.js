const rateLimit = require("express-rate-limit");

// Strict limiter for auth endpoints — prevents brute force
// Excludes /api/auth/me which is polled frequently by the dashboard
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 30,
  message: { error: "Too many attempts — please try again in 15 minutes" },
  standardHeaders: true,
  legacyHeaders: false,
  skip: (req) => process.env.NODE_ENV === "test" || req.path === "/me",
});

// General API limiter — prevents scraping / abuse
const apiLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 120,
  message: { error: "Too many requests — please slow down" },
  standardHeaders: true,
  legacyHeaders: false,
  skip: () => process.env.NODE_ENV === "test",
});

module.exports = { authLimiter, apiLimiter };
