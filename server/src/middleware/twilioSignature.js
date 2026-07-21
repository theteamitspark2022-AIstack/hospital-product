const twilio = require("twilio");

function twilioSignature(req, res, next) {
  if (process.env.NODE_ENV !== "production" && !process.env.TWILIO_AUTH_TOKEN) {
    return next();
  }

  const signature = req.headers["x-twilio-signature"] || "";
  const url = `${req.protocol}://${req.get("host")}${req.originalUrl}`;
  const params = req.body || {};

  const valid = twilio.validateRequest(
    process.env.TWILIO_AUTH_TOKEN,
    signature,
    url,
    params
  );

  if (!valid) {
    console.warn("Rejected unsigned Twilio request from", req.ip);
    return res.status(403).json({ error: "Invalid Twilio signature" });
  }

  next();
}

module.exports = twilioSignature;
