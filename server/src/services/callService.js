const crypto = require("crypto");
const db = require("../models/db");

function hashPhone(number) {
  if (!number) return null;
  return crypto.createHash("sha256").update(number.trim()).digest("hex");
}

async function logCall({ callSid, from, to, status, callerName, duration, businessId }) {
  if (!db.isConnected()) return;
  try {
    await db.query(
      `INSERT INTO calls (call_sid, from_number, from_number_hash, to_number, business_id, status, caller_name, duration)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       ON CONFLICT (call_sid) DO UPDATE SET status = $6`,
      [callSid, from, hashPhone(from), to, businessId || null, status, callerName, duration]
    );
  } catch (err) {
    console.error("DB log failed:", err.message);
  }
}

async function getCalls({ limit = 50, offset = 0, businessId } = {}) {
  if (!db.isConnected()) return [];
  const { rows } = await db.query(
    "SELECT * FROM calls WHERE business_id = $1 ORDER BY created_at DESC LIMIT $2 OFFSET $3",
    [businessId, limit, offset]
  );
  return rows;
}

module.exports = { logCall, getCalls };
