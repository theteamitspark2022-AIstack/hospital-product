const twilio = require("twilio");
const config = require("../../config");

const client = twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);
const CHANNEL = process.env.CHANNEL || "whatsapp";
const FROM = process.env.TWILIO_FROM_NUMBER;

function buildMessage(callerName) {
  const h = config.hospital;
  return config.message.template(callerName)
    .replace("{HOSPITAL_NAME}", h.name)
    .replace("{MAPS}", h.maps)
    .replace("{WEBSITE}", h.website)
    .replace("{WHATSAPP}", h.whatsapp)
    .replace("{BOOKING}", h.bookingInstruction);
}

function toAddress(number) {
  return CHANNEL === "whatsapp" ? `whatsapp:${number}` : number;
}

async function sendMissedCallMessage(patientNumber, callerName) {
  const body = buildMessage(callerName || null);
  await client.messages.create({
    from: toAddress(FROM),
    to: toAddress(patientNumber),
    body,
  });
}

module.exports = { sendMissedCallMessage };
