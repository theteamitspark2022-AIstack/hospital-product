const { google } = require("googleapis");
const db = require("../models/db");

function getOAuthClient() {
  return new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    process.env.GOOGLE_REDIRECT_URI || `${process.env.APP_URL}/api/calendar/callback`
  );
}

function getAuthUrl() {
  const client = getOAuthClient();
  return client.generateAuthUrl({
    access_type: "offline",
    prompt: "consent",
    scope: ["https://www.googleapis.com/auth/calendar.events"],
  });
}

async function getAuthedClient(businessId) {
  const { rows } = await db.query(
    "SELECT gcal_access_token, gcal_refresh_token, gcal_token_expiry FROM businesses WHERE id = $1",
    [businessId]
  );
  const biz = rows[0];
  if (!biz?.gcal_refresh_token) return null;

  const client = getOAuthClient();
  client.setCredentials({
    access_token: biz.gcal_access_token,
    refresh_token: biz.gcal_refresh_token,
    expiry_date: biz.gcal_token_expiry ? new Date(biz.gcal_token_expiry).getTime() : null,
  });

  // Auto-refresh and persist new token if expired
  client.on("tokens", async (tokens) => {
    await db.query(
      `UPDATE businesses SET
         gcal_access_token = COALESCE($1, gcal_access_token),
         gcal_token_expiry = $2
       WHERE id = $3`,
      [tokens.access_token, tokens.expiry_date ? new Date(tokens.expiry_date) : null, businessId]
    );
  });

  return client;
}

async function createEvent(businessId, appointment) {
  const auth = await getAuthedClient(businessId);
  if (!auth) return null;

  const calendar = google.calendar({ version: "v3", auth });
  const start = new Date(appointment.appointment_at);
  const end = new Date(start.getTime() + 60 * 60 * 1000); // 1 hour default

  const event = {
    summary: appointment.customer_name
      ? `Appointment — ${appointment.customer_name}`
      : "Customer Appointment",
    description: [
      `Customer: ${appointment.customer_name || "Unknown"}`,
      `Phone: ${appointment.customer_number}`,
      appointment.notes ? `Notes: ${appointment.notes}` : "",
    ].filter(Boolean).join("\n"),
    start: { dateTime: start.toISOString() },
    end:   { dateTime: end.toISOString() },
    reminders: {
      useDefault: false,
      overrides: [
        { method: "popup", minutes: 30 },
        { method: "email", minutes: 60 },
      ],
    },
  };

  try {
    const res = await calendar.events.insert({ calendarId: "primary", resource: event });
    return res.data.id;
  } catch (err) {
    console.error("Google Calendar create event failed:", err.message);
    return null;
  }
}

async function deleteEvent(businessId, googleEventId) {
  if (!googleEventId) return;
  const auth = await getAuthedClient(businessId);
  if (!auth) return;

  const calendar = google.calendar({ version: "v3", auth });
  try {
    await calendar.events.delete({ calendarId: "primary", eventId: googleEventId });
  } catch (err) {
    // Ignore 410 Gone (already deleted)
    if (err.code !== 410) console.error("Google Calendar delete event failed:", err.message);
  }
}

async function isConnected(businessId) {
  const { rows } = await db.query(
    "SELECT gcal_refresh_token FROM businesses WHERE id = $1",
    [businessId]
  );
  return !!rows[0]?.gcal_refresh_token;
}

module.exports = { getAuthUrl, getAuthedClient, createEvent, deleteEvent, isConnected };
