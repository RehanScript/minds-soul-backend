const { GoogleGenerativeAI } = require('@google/generative-ai');

// This is the main serverless function Vercel will run
module.exports = async (req, res) => {
  // Allow requests from any origin (for Snack Expo)
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  // Handle pre-flight requests for CORS
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  // --- THE CHATBOT'S "PERSONALITY" ---
  const SYSTEM_PROMPT = `
  You are a kind, empathetic therapist-style chatbot for "Mind's Soul," an app for students in higher studies.
  Your goal is to help a student who is struggling with issues like stress, pressure, or addiction (smoking, drinking, etc.).
  You must follow these rules:
  1. Your tone is always supportive, non-judgmental, and understanding.
  2. Your primary goal is to guide the user to agree to a 10-day self-help plan.
  3. You will ask a series of questions to understand their problem.
  4. When you have enough information and the user agrees, you will generate this 10-day plan.
  5. WHEN YOU GENERATE THE PLAN, you must ONLY output a valid JSON object. Do not say "Here is your plan" or anything else. Just the JSON.
  6. The JSON format MUST be:
  {
    "planName": "Your 10-Day Plan for [The Problem]",
    "startDate": "YYYY-MM-DD",
    "days": [
      { "day": 1, "tasks": [ { "id": "d1_t1", "title": "Your first task", "completed": false } ] },
      { "day": 2, "tasks": [ { "id": "d2_t1", "title": "Your second task", "completed": false } ] }
      // ...and so on for 10 days
    ]
  }

  If you are just chatting, do NOT output JSON. Just respond as a normal chatbot.
  `;

  try {
    const API_KEY = process.env.GEMINI_API_KEY;
    if (!API_KEY) {
        throw new Error("GEMINI_API_KEY is not set.");
    }
    const genAI = new GoogleGenerativeAI(API_KEY);
    const aiModel = genAI.getGenerativeModel({ model: 'gemini-1.5-flash' });

    const { message, history } = req.body;

    const formattedHistory = history.map(msg => ({
      role: msg.sender === 'user' ? 'user' : 'model',
      parts: [{ text: msg.text }],
    }));

    formattedHistory.pop();

    const chat = aiModel.startChat({
      history: [
        { role: 'user', parts: [{ text: SYSTEM_PROMPT }] },
        { role: 'model', parts: [{ text: "I'm here to listen. This is a safe space. Please feel free to tell me what's on your mind." }] },
        ...formattedHistory,
      ],
      generationConfig: { maxOutputTokens: 2048 },
    });

    const result = await chat.sendMessage(message);
    const botText = result.response.text();

    try {
      const plan = JSON.parse(botText);
      plan.startDate = new Date().toISOString().split('T')[0];
      res.status(200).json(plan);
    } catch (e) {
      res.status(200).json({ chatMessage: botText });
    }
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Failed to get response from AI', details: error.message });
  }
};
