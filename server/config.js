// ─────────────────────────────────────────────
//  HOSPITAL CONFIGURATION — edit this file only
// ─────────────────────────────────────────────
module.exports = {
  hospital: {
    name: "TheTeamITSpark",
    phone: "+14244764956",
    whatsapp: "https://wa.me/447746134132",
    website: "https://darling-pika-71905f.netlify.app",
    maps: "https://maps.google.com/maps?daddr=9+Foxglove+Ave,+Chelmsford+CM1+4FX",
    services: [
      "General Consultation",
      "Emergency Care",
      "Maternity & Child Health",
      "Diagnostics & Lab Tests",
      "Physiotherapy",
    ],
    bookingInstruction:
      "Reply to this message or tap the WhatsApp button to book an appointment. We respond within minutes.",
  },

  message: {
    // Sent via WhatsApp/SMS after a missed call
    template: (name) =>
      `Hi${name ? " " + name : ""}! You recently called *{HOSPITAL_NAME}* and we missed you.\n\n` +
      `We're here to help. Tap below to connect:\n\n` +
      `📍 Find us: {MAPS}\n` +
      `🌐 Website: {WEBSITE}\n` +
      `💬 Chat on WhatsApp: {WHATSAPP}\n\n` +
      `{BOOKING}`,
  },
};
