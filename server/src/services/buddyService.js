const Groq = require("groq-sdk");

let client = null;

function getClient() {
  if (!client && process.env.GROQ_API_KEY) {
    client = new Groq({ apiKey: process.env.GROQ_API_KEY });
  }
  return client;
}

function buildSystemPrompt(businessName, sector) {
  return `You are a friendly, helpful customer assistant for ${businessName || "this business"}, a ${sector || "small business"}.

Your job is to help customers who have replied to a WhatsApp message — they may want to:
- Ask a question about their appointment or booking
- Request a callback
- Ask about opening hours, services, or prices
- Share feedback or a complaint

RULES:
- Keep replies SHORT — 2 to 3 sentences, like a real WhatsApp message
- Be warm, professional, and helpful
- If you can answer confidently, do so
- If the customer has a complaint or complex issue, acknowledge it warmly and tell them a team member will be in touch shortly
- Never make up prices, dates, or specific information you don't have
- Sign off naturally — no "AI assistant" mentions
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
