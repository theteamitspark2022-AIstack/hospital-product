const express = require("express");
const router = express.Router();
const db = require("../models/db");

// POST /api/seed — insert test data (protected by SUPERADMIN_SECRET header)
router.post("/", async (req, res) => {
  const secret = req.headers["x-superadmin-secret"];
  if (!secret || secret !== process.env.SUPERADMIN_SECRET) {
    return res.status(403).json({ error: "Forbidden" });
  }

  const businessId = req.query.businessId;
  if (!businessId) return res.status(400).json({ error: "businessId query param required" });

  try {
    // ── Calls (last 7 days) ──────────────────────────────────────────
    const callData = [
      { daysAgo: 6, status: "completed",  duration: 180, name: "Sarah Mitchell" },
      { daysAgo: 6, status: "no-answer",  duration: 0,   name: "James Patel" },
      { daysAgo: 5, status: "completed",  duration: 240, name: "Emily Johnson" },
      { daysAgo: 5, status: "completed",  duration: 95,  name: "Robert Ahmed" },
      { daysAgo: 5, status: "no-answer",  duration: 0,   name: "Linda Foster" },
      { daysAgo: 4, status: "busy",       duration: 0,   name: "Michael Clarke" },
      { daysAgo: 4, status: "completed",  duration: 310, name: "Priya Sharma" },
      { daysAgo: 3, status: "completed",  duration: 150, name: "Tom Williams" },
      { daysAgo: 3, status: "no-answer",  duration: 0,   name: "Grace Okafor" },
      { daysAgo: 3, status: "completed",  duration: 220, name: "David Lee" },
      { daysAgo: 2, status: "completed",  duration: 400, name: "Karen Brown" },
      { daysAgo: 2, status: "no-answer",  duration: 0,   name: "Steve Thompson" },
      { daysAgo: 1, status: "completed",  duration: 175, name: "Aisha Malik" },
      { daysAgo: 1, status: "completed",  duration: 290, name: "Chris Davis" },
      { daysAgo: 1, status: "busy",       duration: 0,   name: "Rachel Green" },
      { daysAgo: 0, status: "completed",  duration: 130, name: "Omar Hassan" },
      { daysAgo: 0, status: "no-answer",  duration: 0,   name: "Sophie Turner" },
    ];

    for (const c of callData) {
      const createdAt = new Date();
      createdAt.setDate(createdAt.getDate() - c.daysAgo);
      createdAt.setHours(9 + Math.floor(Math.random() * 8), Math.floor(Math.random() * 60));
      const sid = `CA_seed_${Date.now()}_${Math.random().toString(36).slice(2)}`;
      const from = `+4477${String(Math.floor(Math.random() * 100000000)).padStart(8,"0")}`;
      await db.query(
        `INSERT INTO calls (call_sid, from_number, to_number, business_id, status, caller_name, duration, created_at)
         VALUES ($1,$2,'+447746134132',$3,$4,$5,$6,$7)
         ON CONFLICT (call_sid) DO NOTHING`,
        [sid, from, businessId, c.status, c.name, c.duration, createdAt]
      );
    }

    // ── Conversations + Messages ─────────────────────────────────────
    const conversations = [
      {
        number: "+447700111001", name: "Sarah Mitchell", status: "open",
        messages: [
          { dir: "inbound",  body: "Hi, I missed your call earlier. Is this the dental clinic?" },
          { dir: "outbound", body: "Hi Sarah! Yes, this is Hospital. We tried calling you about your upcoming appointment. How can we help?" },
          { dir: "inbound",  body: "I wanted to reschedule my appointment for next week if possible?" },
          { dir: "outbound", body: "Of course! We have slots available on Monday at 10am or Wednesday at 2pm. Which works for you?" },
          { dir: "inbound",  body: "Wednesday at 2pm would be perfect, thank you!" },
        ]
      },
      {
        number: "+447700111002", name: "James Patel", status: "open",
        messages: [
          { dir: "inbound",  body: "Hello, I received a WhatsApp from you. I was calling about a prescription refill." },
          { dir: "outbound", body: "Hi James! Thanks for getting back to us. Our team will arrange your prescription refill and call you back within the hour." },
          { dir: "inbound",  body: "Thank you. Also, do you have any appointments available this week?" },
        ]
      },
      {
        number: "+447700111003", name: "Emily Johnson", status: "open",
        messages: [
          { dir: "inbound",  body: "I have a complaint. I waited 45 minutes past my appointment time last visit." },
          { dir: "outbound", body: "Hi Emily, we sincerely apologise for the wait. We've logged your feedback and a senior team member will call you today to discuss this." },
          { dir: "inbound",  body: "I hope something is done about it. This is the second time." },
          { dir: "outbound", body: "We completely understand your frustration. This has been escalated as a priority. You'll hear from us within the next 2 hours." },
        ]
      },
      {
        number: "+447700111004", name: "Priya Sharma", status: "open",
        messages: [
          { dir: "inbound",  body: "Hi! I saw your WhatsApp message. Can I book an appointment for a general check-up?" },
          { dir: "outbound", body: "Hi Priya! Absolutely. We have availability tomorrow at 11am and Thursday at 3pm. Would either of those suit you?" },
          { dir: "inbound",  body: "Tomorrow at 11am works great!" },
          { dir: "outbound", body: "Confirmed! You're booked for tomorrow at 11am. We'll send a reminder the evening before. See you then!" },
        ]
      },
      {
        number: "+447700111005", name: "David Lee", status: "resolved",
        messages: [
          { dir: "inbound",  body: "Just calling to confirm my appointment on Friday." },
          { dir: "outbound", body: "Hi David! Your appointment is confirmed for Friday at 9:30am. See you then!" },
          { dir: "inbound",  body: "Perfect, thanks!" },
        ]
      },
    ];

    const convIds = {};
    for (const cv of conversations) {
      const createdAt = new Date();
      createdAt.setDate(createdAt.getDate() - Math.floor(Math.random() * 3));
      const lastMsg = cv.messages[cv.messages.length - 1].body;

      const { rows } = await db.query(
        `INSERT INTO conversations (customer_number, status, last_message, last_message_at, opt_in_whatsapp, opt_in_at, business_id, created_at)
         VALUES ($1,$2,$3,NOW(),true,NOW(),$4,$5)
         ON CONFLICT (customer_number) DO UPDATE SET
           status=$2, last_message=$3, last_message_at=NOW(), business_id=$4
         RETURNING id`,
        [cv.number, cv.status, lastMsg, businessId, createdAt]
      );
      const convId = rows[0].id;
      convIds[cv.number] = convId;

      // Clear old seed messages and re-insert
      await db.query("DELETE FROM messages WHERE conversation_id = $1", [convId]);
      for (let i = 0; i < cv.messages.length; i++) {
        const m = cv.messages[i];
        const msgTime = new Date(createdAt);
        msgTime.setMinutes(msgTime.getMinutes() + i * 3);
        await db.query(
          `INSERT INTO messages (conversation_id, direction, body, twilio_sid, created_at)
           VALUES ($1,$2,$3,$4,$5)`,
          [convId, m.dir, m.body, `SM_seed_${Date.now()}_${i}`, msgTime]
        );
      }
    }

    // ── Tickets ──────────────────────────────────────────────────────
    await db.query("DELETE FROM tickets WHERE business_id = $1 AND customer_number LIKE '+4477001110%'", [businessId]);

    const tickets = [
      { number: "+447700111003", priority: "P1", status: "open",        desc: "Patient complaint — waited 45+ mins past appointment. Second occurrence. Escalated by auto-system.", convId: convIds["+447700111003"] },
      { number: "+447700111001", priority: "P2", status: "in_progress", desc: "Patient requesting appointment reschedule. Awaiting confirmation of new slot.", convId: convIds["+447700111001"] },
      { number: "+447700111002", priority: "P2", status: "open",        desc: "Prescription refill request. Patient also asking about available appointments this week.", convId: convIds["+447700111002"] },
      { number: "+447700111005", priority: "P3", status: "resolved",    desc: "Appointment confirmation request. Resolved — confirmed Friday 9:30am slot.", convId: convIds["+447700111005"] },
    ];

    for (const t of tickets) {
      const slaResponse = new Date(Date.now() + (t.priority === "P1" ? 30 : t.priority === "P2" ? 120 : 240) * 60000);
      const slaResolve  = new Date(Date.now() + (t.priority === "P1" ? 240 : t.priority === "P2" ? 1440 : 2880) * 60000);
      const resolvedAt  = t.status === "resolved" ? new Date() : null;
      await db.query(
        `INSERT INTO tickets (conversation_id, customer_number, description, priority, status, sla_response_at, sla_resolve_at, resolved_at, business_id)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
        [t.convId || null, t.number, t.desc, t.priority, t.status, slaResponse, slaResolve, resolvedAt, businessId]
      );
    }

    // ── Appointments ─────────────────────────────────────────────────
    await db.query("DELETE FROM appointments WHERE business_id = $1 AND customer_number LIKE '+4477001110%'", [businessId]);

    const appts = [
      { number: "+447700111004", name: "Priya Sharma",   days: 1,  hour: 11, notes: "General check-up",         status: "confirmed" },
      { number: "+447700111001", name: "Sarah Mitchell", days: 2,  hour: 14, notes: "Rescheduled appointment",   status: "confirmed" },
      { number: "+447700111002", name: "James Patel",    days: 3,  hour: 10, notes: "Follow-up consultation",    status: "confirmed" },
      { number: "+447700111006", name: "Karen Brown",    days: 4,  hour: 9,  notes: "Annual health review",      status: "confirmed" },
      { number: "+447700111007", name: "Omar Hassan",    days: 5,  hour: 15, notes: "Physiotherapy session",     status: "confirmed" },
      { number: "+447700111005", name: "David Lee",      days: -1, hour: 9,  notes: "Appointment confirmed",     status: "confirmed" },
    ];

    for (const a of appts) {
      const apptAt = new Date();
      apptAt.setDate(apptAt.getDate() + a.days);
      apptAt.setHours(a.hour, 0, 0, 0);
      await db.query(
        `INSERT INTO appointments (business_id, customer_number, customer_name, appointment_at, notes, status)
         VALUES ($1,$2,$3,$4,$5,$6)`,
        [businessId, a.number, a.name, apptAt, a.notes, a.status]
      );
    }

    res.json({
      ok: true,
      inserted: {
        calls: callData.length,
        conversations: conversations.length,
        tickets: tickets.length,
        appointments: appts.length,
      }
    });
  } catch (err) {
    console.error("Seed error:", err.message);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
