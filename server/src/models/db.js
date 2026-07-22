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
  // Auth migrations — add business_id columns, fix type if needed
  await pool.query(`ALTER TABLE settings ADD COLUMN IF NOT EXISTS business_id VARCHAR(64)`).catch(() => {});
  await pool.query(`ALTER TABLE conversations ADD COLUMN IF NOT EXISTS business_id VARCHAR(64)`).catch(() => {});
  await pool.query(`ALTER TABLE tickets ADD COLUMN IF NOT EXISTS business_id VARCHAR(64)`).catch(() => {});
  // Fix any integer business_id columns to VARCHAR
  await pool.query(`ALTER TABLE settings ALTER COLUMN business_id TYPE VARCHAR(64) USING business_id::text`).catch(() => {});
  await pool.query(`ALTER TABLE conversations ALTER COLUMN business_id TYPE VARCHAR(64) USING business_id::text`).catch(() => {});
  await pool.query(`ALTER TABLE tickets ALTER COLUMN business_id TYPE VARCHAR(64) USING business_id::text`).catch(() => {});
  await pool.query(`
    CREATE TABLE IF NOT EXISTS businesses (
      id         VARCHAR(64) PRIMARY KEY,
      name       VARCHAR(128),
      is_live    BOOLEAN DEFAULT false,
      created_at TIMESTAMPTZ DEFAULT NOW()
    )
  `);
  await pool.query(`ALTER TABLE businesses ADD COLUMN IF NOT EXISTS name VARCHAR(128)`).catch(() => {});
  await pool.query(`ALTER TABLE businesses ADD COLUMN IF NOT EXISTS stripe_customer_id VARCHAR(128)`).catch(() => {});
  await pool.query(`ALTER TABLE businesses ADD COLUMN IF NOT EXISTS stripe_subscription_id VARCHAR(128)`).catch(() => {});
  await pool.query(`ALTER TABLE businesses ADD COLUMN IF NOT EXISTS plan VARCHAR(32) DEFAULT 'trial'`).catch(() => {});
  await pool.query(`ALTER TABLE businesses ADD COLUMN IF NOT EXISTS subscription_status VARCHAR(32) DEFAULT 'trial'`).catch(() => {});
  await pool.query(`ALTER TABLE businesses ADD COLUMN IF NOT EXISTS trial_ends_at TIMESTAMPTZ DEFAULT (NOW() + INTERVAL '14 days')`).catch(() => {});
  await pool.query(`
    CREATE TABLE IF NOT EXISTS users (
      id            SERIAL PRIMARY KEY,
      email         VARCHAR(256) UNIQUE NOT NULL,
      password_hash VARCHAR(256) NOT NULL,
      business_id   VARCHAR(64) REFERENCES businesses(id),
      role          VARCHAR(16) DEFAULT 'owner',
      created_at    TIMESTAMPTZ DEFAULT NOW()
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
      opt_in_whatsapp   BOOLEAN DEFAULT false,
      opt_in_at         TIMESTAMPTZ,
      opted_out_at      TIMESTAMPTZ,
      created_at        TIMESTAMPTZ DEFAULT NOW()
    )
  `);
  await pool.query(`
    ALTER TABLE conversations
      ADD COLUMN IF NOT EXISTS opt_in_whatsapp BOOLEAN DEFAULT false,
      ADD COLUMN IF NOT EXISTS opt_in_at TIMESTAMPTZ,
      ADD COLUMN IF NOT EXISTS opted_out_at TIMESTAMPTZ
  `).catch(() => {});
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
  await pool.query(`
    CREATE TABLE IF NOT EXISTS tickets (
      id                SERIAL PRIMARY KEY,
      conversation_id   INTEGER REFERENCES conversations(id),
      customer_number   VARCHAR(32),
      description       TEXT,
      priority          VARCHAR(4) DEFAULT 'P2',
      status            VARCHAR(16) DEFAULT 'open',
      assigned_agent    VARCHAR(64),
      sla_response_at   TIMESTAMPTZ,
      sla_resolve_at    TIMESTAMPTZ,
      resolved_at       TIMESTAMPTZ,
      created_at        TIMESTAMPTZ DEFAULT NOW(),
      updated_at        TIMESTAMPTZ DEFAULT NOW()
    )
  `);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS appointments (
      id                    SERIAL PRIMARY KEY,
      business_id           VARCHAR(64),
      customer_number       VARCHAR(32) NOT NULL,
      customer_name         VARCHAR(128),
      appointment_at        TIMESTAMPTZ NOT NULL,
      notes                 TEXT,
      status                VARCHAR(16) DEFAULT 'confirmed',
      reminder_24h_sent_at  TIMESTAMPTZ,
      reminder_2h_sent_at   TIMESTAMPTZ,
      created_at            TIMESTAMPTZ DEFAULT NOW()
    )
  `);
  console.log("DB migration complete");
}

module.exports = { connect, isConnected, query, migrate };
