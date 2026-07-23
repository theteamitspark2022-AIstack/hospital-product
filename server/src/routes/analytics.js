const express = require("express");
const router = express.Router();
const db = require("../models/db");

// GET /api/analytics — performance summary for the business
router.get("/", async (req, res) => {
  const businessId = req.auth?.businessId;
  if (!db.isConnected()) return res.json({});

  try {
    const [
      callsTotal,
      callsToday,
      callsYesterday,
      callsThisWeek,
      callsByDay,
      openConversations,
      openTickets,
      p1Tickets,
      appointmentsThisWeek,
      resolvedTicketsThisWeek,
    ] = await Promise.all([
      db.query("SELECT COUNT(*) FROM calls WHERE business_id = $1", [businessId]),
      db.query("SELECT COUNT(*) FROM calls WHERE business_id = $1 AND created_at >= CURRENT_DATE", [businessId]),
      db.query("SELECT COUNT(*) FROM calls WHERE business_id = $1 AND created_at >= CURRENT_DATE - INTERVAL '1 day' AND created_at < CURRENT_DATE", [businessId]),
      db.query("SELECT COUNT(*) FROM calls WHERE business_id = $1 AND created_at >= CURRENT_DATE - INTERVAL '7 days'", [businessId]),
      db.query(`
        SELECT DATE(created_at) AS day,
          COUNT(*) AS count,
          COUNT(*) FILTER (WHERE status = 'completed') AS answered,
          COUNT(*) FILTER (WHERE status IN ('no-answer','busy','failed','canceled')) AS missed
        FROM calls WHERE business_id = $1
          AND created_at >= CURRENT_DATE - INTERVAL '6 days'
        GROUP BY DATE(created_at) ORDER BY day ASC
      `, [businessId]),
      db.query("SELECT COUNT(*) FROM conversations WHERE business_id = $1 AND status = 'open'", [businessId]),
      db.query("SELECT COUNT(*) FROM tickets WHERE business_id = $1 AND status != 'resolved'", [businessId]),
      db.query("SELECT COUNT(*) FROM tickets WHERE business_id = $1 AND status != 'resolved' AND priority = 'P1'", [businessId]),
      db.query("SELECT COUNT(*) FROM appointments WHERE business_id = $1 AND created_at >= CURRENT_DATE - INTERVAL '7 days' AND status != 'cancelled'", [businessId]),
      db.query("SELECT COUNT(*) FROM tickets WHERE business_id = $1 AND resolved_at >= CURRENT_DATE - INTERVAL '7 days'", [businessId]),
    ]);

    const todayCount = parseInt(callsToday.rows[0].count);
    const yesterdayCount = parseInt(callsYesterday.rows[0].count);
    const callTrend = yesterdayCount === 0 ? null : Math.round(((todayCount - yesterdayCount) / yesterdayCount) * 100);

    res.json({
      callsTotal:            parseInt(callsTotal.rows[0].count),
      callsToday:            todayCount,
      callsYesterday:        yesterdayCount,
      callsTrend:            callTrend,
      callsThisWeek:         parseInt(callsThisWeek.rows[0].count),
      callsByDay:            callsByDay.rows,
      openConversations:     parseInt(openConversations.rows[0].count),
      openTickets:           parseInt(openTickets.rows[0].count),
      p1Tickets:             parseInt(p1Tickets.rows[0].count),
      appointmentsThisWeek:  parseInt(appointmentsThisWeek.rows[0].count),
      resolvedThisWeek:      parseInt(resolvedTicketsThisWeek.rows[0].count),
    });
  } catch (err) {
    console.error("Analytics error:", err.message);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
