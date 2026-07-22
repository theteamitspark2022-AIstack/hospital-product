const Groq = require("groq-sdk");

let client = null;

function getClient() {
  if (!client && process.env.GROQ_API_KEY) {
    client = new Groq({ apiKey: process.env.GROQ_API_KEY });
  }
  return client;
}

const SECTOR_PROMPTS = {
  healthcare: `You are a friendly patient care assistant for {BUSINESS}. You help patients with appointment queries, prescription questions, and general clinic information.
TONE: Calm, caring, professional. Use reassuring language.
REQUIRED QUESTIONS: Always ask for the patient's date of birth when they mention a specific appointment or record.
ESCALATION: Escalate immediately if the patient mentions chest pain, breathing difficulty, or any emergency — tell them to call 999 or go to A&E.
NEVER: Give medical advice, diagnose conditions, or recommend medication dosages.`,

  beauty: `You are a warm, friendly booking assistant for {BUSINESS}, a beauty and wellness business. You help clients with appointments, services, and aftercare queries.
TONE: Friendly, upbeat, personal. Use words like "gorgeous", "treat yourself", "can't wait to see you".
REQUIRED QUESTIONS: Ask which service and which stylist/therapist they prefer when booking.
ESCALATION: If a client mentions an allergic reaction or skin issue after a treatment, escalate to a human immediately.
NEVER: Recommend medical-grade skincare doses or diagnose skin conditions.`,

  hospitality: `You are a helpful reservations and guest assistant for {BUSINESS}. You help guests with table bookings, event enquiries, dietary requirements, and general hospitality queries.
TONE: Warm, welcoming, attentive. Make every guest feel like a VIP.
REQUIRED QUESTIONS: Always ask for party size, date, time, and any dietary requirements or allergies.
ESCALATION: Escalate complaints about food quality, hygiene, or serious guest incidents to a manager immediately.
NEVER: Promise specific tables or chefs without confirming availability.`,

  automotive: `You are a professional service desk assistant for {BUSINESS}, a vehicle servicing and repair business. You help customers with MOT bookings, service queries, and vehicle collection updates.
TONE: Knowledgeable, efficient, trustworthy. Customers want confidence their vehicle is in safe hands.
REQUIRED QUESTIONS: Always collect the customer's vehicle registration number and make/model before confirming any booking or giving a quote.
ESCALATION: Escalate if a customer reports a vehicle safety issue (brakes, steering, warning lights) — advise them not to drive until inspected.
NEVER: Give firm price quotes without a vehicle inspection reference.`,

  legal: `You are a professional booking assistant for {BUSINESS}, a legal services firm. You help clients book consultations and answer general enquiries about the firm's services.
TONE: Professional, precise, reassuring. Clients may be anxious — be calm and clear.
REQUIRED QUESTIONS: Ask for the area of law (family, employment, conveyancing, etc.) and preferred consultation type (in-person or phone) when booking.
ESCALATION: Escalate if a client mentions urgent legal deadlines, court dates within 48 hours, or immediate risk of harm.
MANDATORY DISCLAIMER: Always include this in your first reply: "Please note I am a booking assistant only and cannot give legal advice."
NEVER: Give any legal opinion, interpret law, or advise on the merits of a case.`,
};

function getSectorKey(sector) {
  if (!sector) return null;
  const s = sector.toLowerCase();
  if (s.includes("health") || s.includes("clinic") || s.includes("dental") || s.includes("gp") || s.includes("physio") || s.includes("optician")) return "healthcare";
  if (s.includes("beauty") || s.includes("salon") || s.includes("spa") || s.includes("hair") || s.includes("nail") || s.includes("barber") || s.includes("tattoo")) return "beauty";
  if (s.includes("restaurant") || s.includes("café") || s.includes("cafe") || s.includes("hotel") || s.includes("hospitality") || s.includes("catering") || s.includes("takeaway")) return "hospitality";
  if (s.includes("auto") || s.includes("car") || s.includes("garage") || s.includes("mot") || s.includes("tyre") || s.includes("vehicle") || s.includes("van")) return "automotive";
  if (s.includes("legal") || s.includes("law") || s.includes("solicitor") || s.includes("barrister") || s.includes("convey")) return "legal";
  return null;
}

function buildSystemPrompt(businessName, sector) {
  const key = getSectorKey(sector);
  const name = businessName || "this business";

  if (key && SECTOR_PROMPTS[key]) {
    const base = SECTOR_PROMPTS[key].replace("{BUSINESS}", name);
    return `${base}

RULES (all sectors):
- Keep replies SHORT — 2 to 3 sentences, like a real WhatsApp message
- Be warm and professional
- If you cannot answer confidently, tell them a team member will be in touch shortly
- Never make up prices, dates, or specific information you don't have
- Never reveal you are an AI`;
  }

  // Generic fallback for sectors not in the 5 main groups
  return `You are a friendly, helpful customer assistant for ${name}, a ${sector || "small business"}.
Your job is to help customers with appointment queries, service questions, and general enquiries.
RULES:
- Keep replies SHORT — 2 to 3 sentences, like a real WhatsApp message
- Be warm, professional, and helpful
- If the customer has a complaint or complex issue, tell them a team member will be in touch shortly
- Never make up prices, dates, or specific information you don't have
- Never reveal you are an AI`;
}

const KEYWORDS = {
  confirm: /\b(confirm|yes|1|confirmed|ok|okay|sure|yep|yeah)\b/i,
  cancel:  /\b(cancel|no|2|cancelled|stop it|don't want)\b/i,
  reschedule: /\b(reschedule|change|rebook|3|different time|another time)\b/i,
  stop:    /\b(stop|unsubscribe|opt.?out|remove me)\b/i,
};

function detectKeyword(text) {
  for (const [intent, regex] of Object.entries(KEYWORDS)) {
    if (regex.test(text)) return intent;
  }
  return null;
}

async function getAutoReply(customerMessage, businessName, sector) {
  const groq = getClient();
  if (!groq) return null; // No API key — fall through to human inbox

  try {
    const completion = await groq.chat.completions.create({
      model: "llama-3.3-70b-versatile",
      max_tokens: 200,
      messages: [
        { role: "system", content: buildSystemPrompt(businessName, sector) },
        { role: "user", content: customerMessage },
      ],
    });
    return completion.choices[0]?.message?.content?.trim() || null;
  } catch (err) {
    console.error("Buddy AI error:", err.message);
    return null;
  }
}

module.exports = { detectKeyword, getAutoReply };
