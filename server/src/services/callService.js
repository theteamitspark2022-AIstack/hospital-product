const db = require("../models/db");

async function logCall({ callSid, from, to, status, callerName, duration }) {
  if (!db.isConnected()) return;
  try {
    await db.query(
      `INSERT INTO calls (call_sid, from_number, to_number, status, caller_name, duration)
       VALUES ($1, $2, $3, $4, $5, $6)
       ON CONFLICT (call_sid) DO UPDATE SET status = $4`,
      [callSid, from, to, status, callerName, duration]
    );
  } catch (err) {
    console.error("DB log failed:", err.message);
  }
}

async function getCalls({ limit = 50, offset = 0 } = {}) {
  if (!db.isConnected()) return [];
  const { rows } = await db.query(
    "SELECT * FROM calls ORDER BY created_at DESC LIMIT $1 OFFSET $2",
    [limit, offset]
  );
  return rows;
}

module.exports = { logCall, getCalls };
