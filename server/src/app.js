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
const db = require("./models/db");

const app = express();

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

app.get("/login", (_req, res) => {
  res.sendFile(path.join(__dirname, "../public/login.html"));
});

app.get("/dashboard", requireAuth, (_req, res) => {
  res.sendFile(path.join(__dirname, "../public/dashboard.html"));
});

app.get("/health", (_req, res) => res.json({ status: "ok" }));

app.use(errorHandler);

async function start() {
  db.connect();
  await db.migrate();
  const PORT = process.env.PORT || 3000;
  app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
}

start();

module.exports = app;
