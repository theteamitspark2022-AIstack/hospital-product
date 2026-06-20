// ─────────────────────────────────────────────
//  HOSPITAL CONFIGURATION — edit this file only
// ─────────────────────────────────────────────
module.exports = {
  hospital: {
    name: "City Care Hospital",
    phone: "+1234567890",           // your Twilio number (must match)
    whatsapp: "https://wa.me/1234567890",
    website: "https://yourclinic.com",
    maps: "https://maps.google.com/?q=City+Care+Hospital",
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
