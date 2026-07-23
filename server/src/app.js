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
const calendarRouter = require("./routes/calendar");
const superadminRouter = require("./routes/superadmin");
const planRouter = require("./routes/plan");
const requireSuperAdmin = require("./middleware/requireSuperAdmin");
const requirePlanFeature = require("./middleware/requirePlanFeature");
const { startReminderScheduler } = require("./services/reminderService");
const { authLimiter, apiLimiter } = require("./middleware/rateLimiter");
const db = require("./models/db");

const app = express();

// Stripe webhook needs raw body — must be registered before express.json()
app.use("/api/billing/webhook", express.raw({ type: "application/json" }), billingRouter);

app.use(express.urlencoded({ extended: false }));
app.use(express.json());
app.use(cookieParser());
app.use(requestLogger);

// Rate limiting
app.use("/api/auth", authLimiter);
app.use("/api", apiLimiter);

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
app.use("/api/analytics", requireAuth, requirePlanFeature("analytics"), analyticsRouter);
app.use("/api/calendar", requireAuth, requirePlanFeature("calendar"), calendarRouter);
app.use("/api/plan", requireAuth, planRouter);
app.use("/api/superadmin", requireSuperAdmin, superadminRouter);

// Serve static assets (logo, etc.)
app.use(express.static(path.join(__dirname, "../public")));

app.get("/login", (_req, res) => {
  res.sendFile(path.join(__dirname, "../public/login.html"));
});

app.get("/dashboard", requireAuth, (_req, res) => {
  res.sendFile(path.join(__dirname, "../public/dashboard.html"));
});

app.get("/reset-password", (_req, res) => {
  res.sendFile(path.join(__dirname, "../public/reset-password.html"));
});

app.get("/superadmin", requireSuperAdmin, (_req, res) => {
  res.sendFile(path.join(__dirname, "../public/superadmin.html"));
});

app.get("/health", (_req, res) => res.json({ status: "ok" }));


app.use(errorHandler);

async function start() {
  const PORT = process.env.PORT || 3000;
  app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
  db.connect();
  await db.migrate();
  startReminderScheduler();
}

if (require.main === module) {
  start();
}

module.exports = app;
