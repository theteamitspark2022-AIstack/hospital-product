const express = require("express");
const router = express.Router();
const db = require("../models/db");
const { getAuthUrl, isConnected } = require("../services/calendarService");
const { google } = require("googleapis");

function getOAuthClient() {
  return new (require("googleapis").google.auth.OAuth2)(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    process.env.GOOGLE_REDIRECT_URI || `${process.env.APP_URL}/api/calendar/callback`
  );
}

// GET /api/calendar/status — is Google Calendar connected?
router.get("/status", async (req, res) => {
  const businessId = req.auth?.businessId;
  if (!db.isConnected()) return res.json({ connected: false });
  try {
    const connected = await isConnected(businessId);
    res.json({ connected });
  } catch {
    res.json({ connected: false });
  }
});

// GET /api/calendar/auth — redirect to Google OAuth consent screen
router.get("/auth", (req, res) => {
  if (!process.env.GOOGLE_CLIENT_ID) {
    return res.status(503).json({ error: "Google Calendar not configured" });
  }
  res.redirect(getAuthUrl());
});

// GET /api/calendar/callback — handle OAuth callback from Google
router.get("/callback", async (req, res) => {
  const { code, error } = req.query;
  if (error || !code) {
    return res.redirect(`/dashboard?gcal=denied`);
  }

  // Recover businessId from state or session cookie
  const businessId = req.auth?.businessId;
  if (!businessId) return res.redirect("/login");

  try {
    const client = getOAuthClient();
    const { tokens } = await client.getToken(code);

    await db.query(
      `UPDATE businesses SET
         gcal_access_token  = $1,
         gcal_refresh_token = $2,
         gcal_token_expiry  = $3
       WHERE id = $4`,
      [
        tokens.access_token,
        tokens.refresh_token,
        tokens.expiry_date ? new Date(tokens.expiry_date) : null,
        businessId,
      ]
    );

    res.redirect("/dashboard?gcal=connected&tab=settings");
  } catch (err) {
    console.error("Google Calendar callback failed:", err.message);
    res.redirect("/dashboard?gcal=error");
  }
});

// DELETE /api/calendar/disconnect — revoke and clear tokens
router.delete("/disconnect", async (req, res) => {
  const businessId = req.auth?.businessId;
  try {
    const { rows } = await db.query(
      "SELECT gcal_access_token FROM businesses WHERE id = $1",
      [businessId]
    );
    const token = rows[0]?.gcal_access_token;
    if (token) {
      const client = getOAuthClient();
      client.setCredentials({ access_token: token });
      await client.revokeCredentials().catch(() => {}); // best-effort revoke
    }
    await db.query(
      "UPDATE businesses SET gcal_access_token = NULL, gcal_refresh_token = NULL, gcal_token_expiry = NULL WHERE id = $1",
      [businessId]
    );
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
