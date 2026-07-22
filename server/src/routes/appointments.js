const express = require("express");
const router = express.Router();
const db = require("../models/db");
const { runReminderCheck } = require("../services/reminderService");

// POST /api/appointments — book an appointment
router.post("/", async (req, res) => {
  const businessId = req.auth?.businessId;
  const { customerNumber, customerName, appointmentAt, notes } = req.body;
  if (!customerNumber || !appointmentAt) {
    return res.status(400).json({ error: "customerNumber and appointmentAt are required" });
  }
  const apptDate = new Date(appointmentAt);
  if (isNaN(apptDate)) return res.status(400).json({ error: "Invalid appointmentAt date" });

  try {
    const { rows } = await db.query(
      `INSERT INTO appointments (business_id, customer_number, customer_name, appointment_at, notes)
       VALUES ($1, $2, $3, $4, $5) RETURNING *`,
      [businessId, customerNumber, customerName || null, apptDate, notes || null]
    );
    res.status(201).json(rows[0]);
  } catch (err) {
    console.error("Appointment create failed:", err.message);
    res.status(500).json({ error: err.message });
  }
});

// GET /api/appointments — list upcoming appointments for this business
router.get("/", async (req, res) => {
  const businessId = req.auth?.businessId;
  const { past } = req.query;
  try {
    const { rows } = await db.query(
      `SELECT * FROM appointments
       WHERE business_id = $1
         AND appointment_at ${past ? "<" : ">="} NOW()
         AND status != 'cancelled'
       ORDER BY appointment_at ASC
       LIMIT 100`,
      [businessId]
    );
    res.json(rows);
  } catch (err) {
    res.json([]);
  }
});

// DELETE /api/appointments/:id — cancel appointment
router.delete("/:id", async (req, res) => {
  const businessId = req.auth?.businessId;
  try {
    await db.query(
      "UPDATE appointments SET status = 'cancelled' WHERE id = $1 AND business_id = $2",
      [req.params.id, businessId]
    );
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/appointments/test-reminder/:id — manually send reminder for testing
router.post("/test-reminder/:id", async (req, res) => {
  const businessId = req.auth?.businessId;
  try {
    const { rows } = await db.query(
      "SELECT * FROM appointments WHERE id = $1 AND business_id = $2",
      [req.params.id, businessId]
    );
    if (!rows.length) return res.status(404).json({ error: "Appointment not found" });
    const { sendReminder } = require("../services/reminderService");
    await sendReminder(rows[0], "24h");
    res.json({ ok: true, message: "Test reminder sent" });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
