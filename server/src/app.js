require("dotenv").config();
const express = require("express");
const requestLogger = require("./middleware/requestLogger");
const errorHandler = require("./middleware/errorHandler");
const callsRouter = require("./routes/calls");
const db = require("./models/db");

const app = express();

app.use(express.urlencoded({ extended: false }));
app.use(express.json());
app.use(requestLogger);

app.use("/api/calls", callsRouter);

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
