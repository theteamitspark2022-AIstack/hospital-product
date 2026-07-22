const jwt = require("jsonwebtoken");
const SECRET = process.env.JWT_SECRET || "changeme-set-JWT_SECRET-in-env";
const COOKIE_NAME = "avc_token";

function requireAuth(req, res, next) {
  const token = req.cookies?.[COOKIE_NAME];
  const isApi = req.path.startsWith("/api") || req.originalUrl.startsWith("/api");

  if (!token) {
    if (isApi) return res.status(401).json({ error: "Not authenticated" });
    return res.redirect("/login");
  }
  try {
    req.auth = jwt.verify(token, SECRET);
    next();
  } catch {
    if (isApi) return res.status(401).json({ error: "Session expired — please log in again" });
    res.redirect("/login");
  }
}

module.exports = requireAuth;
