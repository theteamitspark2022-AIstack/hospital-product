require("dotenv").config();
const express = require("express");
const cookieParser = require("cookie-parser");
const requestLogger = require("./middleware/requestLogger");
const errorHandler = require("./middleware/errorHandler");
const requireAuth = require("./middleware/requireAuth");
const path = require("path");
const callsRouter = require("./routes/calls");
const statusRouter = require("./routes/status");
const settingsRouter = require("./routes/settings");
const inboxRouter = require("./routes/inbox");
const buddyRouter = require("./routes/buddy");
const ticketsRouter = require("./routes/tickets");
const authRouter = require("./routes/auth");
const billingRouter = require("./routes/billing");
const appointmentsRouter = require("./routes/appointments");
const analyticsRouter = require("./routes/analytics");
const { startReminderScheduler } = require("./services/reminderService");
const db = require("./models/db");

const app = express();

// Stripe webhook needs raw body — must be registered before express.json()
app.use("/api/billing/webhook", express.raw({ type: "application/json" }), billingRouter);

app.use(express.urlencoded({ extended: false }));
app.use(express.json());
app.use(cookieParser());
app.use(requestLogger);

// Public routes
app.use("/api/auth", authRouter);
app.use("/api/calls", callsRouter);       // Twilio webhooks — public (signature-verified)
app.use("/api/inbox", inboxRouter);       // Twilio webhooks — public (signature-verified)

// Protected routes
app.use("/api/status", requireAuth, statusRouter);
app.use("/api/settings", requireAuth, settingsRouter);
app.use("/api/buddy", requireAuth, buddyRouter);
app.use("/api/tickets", requireAuth, ticketsRouter);
app.use("/api/billing", requireAuth, billingRouter);
app.use("/api/appointments", requireAuth, appointmentsRouter);
app.use("/api/analytics", requireAuth, analyticsRouter);

app.get("/login", (_req, res) => {
  res.sendFile(path.join(__dirname, "../public/login.html"));
});

app.get("/dashboard", requireAuth, (_req, res) => {
  res.sendFile(path.join(__dirname, "../public/dashboard.html"));
});

app.get("/health", (_req, res) => res.json({ status: "ok" }));

// Temporary admin: list users and change roles (superadmin only)
app.get("/api/admin/users", requireAuth, async (req, res) => {
  if (req.auth?.role !== "superadmin") return res.status(403).json({ error: "Forbidden" });
  const { rows } = await db.query("SELECT id, email, role, business_id FROM users ORDER BY id");
  res.json(rows);
});
app.post("/api/admin/set-role", requireAuth, async (req, res) => {
  if (req.auth?.role !== "superadmin") return res.status(403).json({ error: "Forbidden" });
  const { email, role } = req.body;
  if (!["owner","agent","superadmin"].includes(role)) return res.status(400).json({ error: "Invalid role" });
  const { rows } = await db.query("UPDATE users SET role=$1 WHERE email=$2 RETURNING id,email,role", [role, email.toLowerCase()]);
  if (!rows.length) return res.status(404).json({ error: "User not found" });
  res.json({ ok: true, user: rows[0] });
});

app.use(errorHandler);

async function start() {
  db.connect();
  await db.migrate();
  startReminderScheduler();
  const PORT = process.env.PORT || 3000;
  app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
}

start();

module.exports = app;
