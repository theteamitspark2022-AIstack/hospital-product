const express = require("express");
const router = express.Router();
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const crypto = require("crypto");
const db = require("../models/db");

const SECRET = process.env.JWT_SECRET || "changeme-set-JWT_SECRET-in-env";
const COOKIE_NAME = "avc_token";

function setAuthCookie(res, payload) {
  const token = jwt.sign(payload, SECRET, { expiresIn: "7d" });
  res.cookie(COOKIE_NAME, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: 7 * 24 * 60 * 60 * 1000,
  });
}

// POST /api/auth/signup
router.post("/signup", async (req, res) => {
  const { email, password, businessName } = req.body;
  if (!email || !password || !businessName) {
    return res.status(400).json({ error: "Email, password and business name are required" });
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return res.status(400).json({ error: "Enter a valid email address" });
  }
  if (password.length < 8) {
    return res.status(400).json({ error: "Password must be at least 8 characters" });
  }
  if (!/[A-Z]/.test(password) || !/[0-9]/.test(password)) {
    return res.status(400).json({ error: "Password must contain at least one uppercase letter and one number" });
  }
  if (businessName.trim().length < 2 || businessName.trim().length > 100) {
    return res.status(400).json({ error: "Business name must be between 2 and 100 characters" });
  }

  try {
    // Check email not already used
    const existing = await db.query("SELECT id FROM users WHERE email = $1", [email.toLowerCase()]);
    if (existing.rows.length) return res.status(409).json({ error: "Email already registered" });

    // Create business with a unique string ID
    const businessId = crypto.randomUUID();
    await db.query(
      "INSERT INTO businesses (id, name) VALUES ($1, $2)", [businessId, businessName]
    );

    // Seed default settings for the business
    await db.query(
      `INSERT INTO settings (id, business_id, business_name) VALUES ($1, $2, $3) ON CONFLICT (id) DO NOTHING`,
      [`default_${businessId}`, businessId, businessName]
    );

    // Hash password and create user
    const hash = await bcrypt.hash(password, 10);
    const user = await db.query(
      "INSERT INTO users (email, password_hash, business_id, role) VALUES ($1, $2, $3, 'owner') RETURNING id",
      [email.toLowerCase(), hash, businessId]
    );

    setAuthCookie(res, { userId: user.rows[0].id, businessId, role: "owner" });
    res.status(201).json({ ok: true, businessId });
  } catch (err) {
    console.error("Signup error:", err.message);
    res.status(500).json({ error: "Signup failed" });
  }
});

// POST /api/auth/login
router.post("/login", async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) return res.status(400).json({ error: "email and password required" });

  try {
    const { rows } = await db.query(
      "SELECT u.id, u.password_hash, u.business_id, u.role FROM users u WHERE u.email = $1",
      [email.toLowerCase()]
    );
    if (!rows.length) return res.status(401).json({ error: "Invalid email or password" });

    const user = rows[0];
    const valid = await bcrypt.compare(password, user.password_hash);
    if (!valid) return res.status(401).json({ error: "Invalid email or password" });

    setAuthCookie(res, { userId: user.id, businessId: user.business_id, role: user.role });
    res.json({ ok: true, businessId: user.business_id });
  } catch (err) {
    console.error("Login error:", err.message);
    res.status(500).json({ error: "Login failed" });
  }
});

// POST /api/auth/logout
router.post("/logout", (_req, res) => {
  res.clearCookie(COOKIE_NAME);
  res.json({ ok: true });
});

// GET /api/auth/me — check current session
router.get("/me", (req, res) => {
  const token = req.cookies?.[COOKIE_NAME];
  if (!token) return res.status(401).json({ error: "Not authenticated" });
  try {
    const payload = jwt.verify(token, SECRET);
    res.json({ userId: payload.userId, businessId: payload.businessId, role: payload.role });
  } catch {
    res.status(401).json({ error: "Session expired" });
  }
});

// POST /api/auth/make-superadmin — promote a user by email (requires SUPERADMIN_SECRET header)
router.post("/make-superadmin", async (req, res) => {
  const secret = req.headers["x-superadmin-secret"];
  if (!secret || secret !== process.env.SUPERADMIN_SECRET) {
    return res.status(403).json({ error: "Forbidden" });
  }
  const { email } = req.body;
  if (!email) return res.status(400).json({ error: "Email required" });
  try {
    const { rows } = await db.query(
      "UPDATE users SET role = 'superadmin' WHERE email = $1 RETURNING id, email, role",
      [email.toLowerCase().trim()]
    );
    if (!rows.length) return res.status(404).json({ error: "User not found" });
    res.json({ ok: true, user: rows[0] });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
