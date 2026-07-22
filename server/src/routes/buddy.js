const express = require("express");
const router = express.Router();
const Groq = require("groq-sdk");

const SYSTEM_PROMPT = `You are Buddy — a helpful AI assistant for business owners and agents using the AIVoiceConnect dashboard.

You help with:
- Drafting WhatsApp reply messages to customers
- Summarising customer issues
- Suggesting how to handle difficult customer situations
- Answering questions about the business or platform
- General advice for running a small business

Keep replies concise and practical. When drafting messages, write them ready to copy-paste.`;

// POST /api/buddy/chat
router.post("/chat", async (req, res) => {
  const { message, history = [] } = req.body;
  if (!message) return res.status(400).json({ error: "message required" });

  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) return res.status(503).json({ error: "Buddy not configured — add GROQ_API_KEY" });

  try {
    const groq = new Groq({ apiKey });
    const completion = await groq.chat.completions.create({
      model: "llama-3.3-70b-versatile",
      max_tokens: 512,
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        ...history.slice(-10),
        { role: "user", content: message },
      ],
    });
    const reply = completion.choices[0]?.message?.content?.trim() || "Sorry, I couldn't come up with a response.";
    res.json({ reply });
  } catch (err) {
    console.error("Buddy chat error:", err.message);
    res.status(500).json({ error: "Buddy is having a moment — try again shortly." });
  }
});

module.exports = router;
