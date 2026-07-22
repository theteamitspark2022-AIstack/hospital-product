require("dotenv").config();
const express = require("express");
const requestLogger = require("./middleware/requestLogger");
const errorHandler = require("./middleware/errorHandler");
const path = require("path");
const callsRouter = require("./routes/calls");
const statusRouter = require("./routes/status");
const settingsRouter = require("./routes/settings");
const inboxRouter = require("./routes/inbox");
const buddyRouter = require("./routes/buddy");
const db = require("./models/db");

const app = express();

app.use(express.urlencoded({ extended: false }));
app.use(express.json());
app.use(requestLogger);

app.use("/api/calls", callsRouter);
app.use("/api/status", statusRouter);
app.use("/api/settings", settingsRouter);
app.use("/api/inbox", inboxRouter);
app.use("/api/buddy", buddyRouter);

app.get("/dashboard", (_req, res) => {
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
