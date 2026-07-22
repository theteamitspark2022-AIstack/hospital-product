const jwt = require("jsonwebtoken");
const SECRET = process.env.JWT_SECRET || "changeme-set-JWT_SECRET-in-env";
const COOKIE_NAME = "avc_token";

function requireAuth(req, res, next) {
  const token = req.cookies?.[COOKIE_NAME];
  if (!token) return res.status(401).json({ error: "Not authenticated" });
  try {
    req.auth = jwt.verify(token, SECRET);
    next();
  } catch {
    res.status(401).json({ error: "Session expired — please log in again" });
  }
}

module.exports = requireAuth;
