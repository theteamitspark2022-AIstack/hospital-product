const jwt = require("jsonwebtoken");
const SECRET = process.env.JWT_SECRET || "changeme-set-JWT_SECRET-in-env";
const COOKIE_NAME = "avc_token";

function requireSuperAdmin(req, res, next) {
  const token = req.cookies?.[COOKIE_NAME];
  if (!token) return res.status(401).json({ error: "Not authenticated" });
  try {
    const payload = jwt.verify(token, SECRET);
    if (payload.role !== "superadmin") {
      return res.status(403).json({ error: "Superadmin access required" });
    }
    req.auth = payload;
    next();
  } catch {
    res.status(401).json({ error: "Session expired" });
  }
}

module.exports = requireSuperAdmin;
