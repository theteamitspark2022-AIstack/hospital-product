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
      id                  SERIAL PRIMARY KEY,
      call_sid            VARCHAR(64) UNIQUE NOT NULL,
      from_number         VARCHAR(32),
      from_number_hash    VARCHAR(64),
      to_number           VARCHAR(32),
      business_id         VARCHAR(64),
      status              VARCHAR(32),
      caller_name         VARCHAR(128),
      duration            INTEGER DEFAULT 0,
      created_at          TIMESTAMPTZ DEFAULT NOW()
    )
  `);
  await pool.query(`
    ALTER TABLE calls
      ADD COLUMN IF NOT EXISTS from_number_hash VARCHAR(64),
      ADD COLUMN IF NOT EXISTS business_id VARCHAR(64)
  `).catch(() => {});
  await pool.query(`
    CREATE TABLE IF NOT EXISTS businesses (
      id       VARCHAR(64) PRIMARY KEY,
      is_live  BOOLEAN DEFAULT false,
      created_at TIMESTAMPTZ DEFAULT NOW()
    )
  `);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS settings (
      id                    VARCHAR(64) PRIMARY KEY,
      business_name         VARCHAR(128),
      callback_number       VARCHAR(32),
      sector                VARCHAR(64),
      country               VARCHAR(32),
      missed_call_template  TEXT,
      updated_at            TIMESTAMPTZ DEFAULT NOW()
    )
  `);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS conversations (
      id                SERIAL PRIMARY KEY,
      customer_number   VARCHAR(32) UNIQUE NOT NULL,
      status            VARCHAR(16) DEFAULT 'open',
      last_message      TEXT,
      last_message_at   TIMESTAMPTZ DEFAULT NOW(),
      resolved_at       TIMESTAMPTZ,
      created_at        TIMESTAMPTZ DEFAULT NOW()
    )
  `);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS messages (
      id                SERIAL PRIMARY KEY,
      conversation_id   INTEGER REFERENCES conversations(id),
      direction         VARCHAR(8) NOT NULL,
      body              TEXT,
      twilio_sid        VARCHAR(64),
      created_at        TIMESTAMPTZ DEFAULT NOW()
    )
  `);
  console.log("DB migration complete");
}

module.exports = { connect, isConnected, query, migrate };
