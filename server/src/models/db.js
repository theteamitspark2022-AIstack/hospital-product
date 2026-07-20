const { Pool } = require("pg");

let pool = null;

function connect() {
  if (!process.env.DATABASE_URL) {
    console.warn("DATABASE_URL not set — running without database");
    return;
  }
  pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: process.env.NODE_ENV === "production" ? { rejectUnauthorized: false } : false,
  });
  pool.on("error", (err) => console.error("DB pool error:", err.message));
}

function isConnected() {
  return pool !== null;
}

async function query(text, params) {
  if (!pool) throw new Error("Database not connected");
  return pool.query(text, params);
}

async function migrate() {
  if (!pool) return;
  await pool.query(`
    CREATE TABLE IF NOT EXISTS calls (
      id          SERIAL PRIMARY KEY,
      call_sid    VARCHAR(64) UNIQUE NOT NULL,
      from_number VARCHAR(32),
      to_number   VARCHAR(32),
      status      VARCHAR(32),
      caller_name VARCHAR(128),
      duration    INTEGER DEFAULT 0,
      created_at  TIMESTAMPTZ DEFAULT NOW()
    )
  `);
  console.log("DB migration complete");
}

module.exports = { connect, isConnected, query, migrate };
