const db = require("../models/db");
const twilio = require("twilio");

const client = twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);
const FROM = process.env.TWILIO_FROM_NUMBER;
const CHANNEL = process.env.CHANNEL || "whatsapp";

function toAddress(number) {
  return CHANNEL === "whatsapp" ? `whatsapp:${number}` : number;
}

function formatDateTime(date) {
  return new Date(date).toLocaleString("en-GB", {
    weekday: "long", day: "numeric", month: "long",
    hour: "2-digit", minute: "2-digit", timeZone: "Europe/London",
  });
}

async function sendReminder(appt, type) {
  const label = type === "24h" ? "tomorrow" : "in 2 hours";
  const name = appt.customer_name ? `, ${appt.customer_name}` : "";
  const body = `Hi${name} 👋 This is a reminder that you have an appointment *${label}* on ${formatDateTime(appt.appointment_at)}.${appt.notes ? `\n\nNote: ${appt.notes}` : ""}\n\nReply *CONFIRM* to confirm or *CANCEL* to cancel.`;

  try {
    await client.messages.create({
      from: toAddress(FROM),
      to: toAddress(appt.customer_number),
      body,
    });

    await db.query(
      `UPDATE appointments SET ${type === "24h" ? "reminder_24h_sent_at" : "reminder_2h_sent_at"} = NOW() WHERE id = $1`,
      [appt.id]
    );
    console.log(`[reminders] ${type} reminder sent to ${appt.customer_number} for appt #${appt.id}`);
  } catch (err) {
    console.error(`[reminders] Failed to send ${type} reminder for appt #${appt.id}:`, err.message);
  }
}

async function runReminderCheck() {
  if (!db.isConnected()) return;
  try {
    // 24h reminders: appointment is 23-25h away and not yet sent
    const { rows: due24h } = await db.query(`
      SELECT * FROM appointments
      WHERE status = 'confirmed'
        AND appointment_at BETWEEN NOW() + INTERVAL '23 hours' AND NOW() + INTERVAL '25 hours'
        AND reminder_24h_sent_at IS NULL
    `);

    // 2h reminders: appointment is 1h50m-2h10m away and not yet sent
    const { rows: due2h } = await db.query(`
      SELECT * FROM appointments
      WHERE status = 'confirmed'
        AND appointment_at BETWEEN NOW() + INTERVAL '110 minutes' AND NOW() + INTERVAL '130 minutes'
        AND reminder_2h_sent_at IS NULL
    `);

    for (const appt of due24h) await sendReminder(appt, "24h");
    for (const appt of due2h)  await sendReminder(appt, "2h");
  } catch (err) {
    console.error("[reminders] Check failed:", err.message);
  }
}

function startReminderScheduler() {
  console.log("[reminders] Scheduler started — checking every 5 minutes");
  runReminderCheck();
  setInterval(runReminderCheck, 5 * 60 * 1000);
}

module.exports = { startReminderScheduler };
