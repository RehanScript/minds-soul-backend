require('dotenv').config();
const express = require('express');
const cors = require('cors');
const { GoogleGenerativeAI } = require('@google/generative-ai');

// --- SETUP ---
const app = express();
app.use(express.json());
app.use(cors());

// Get API key from Environment Variables
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
if (!GEMINI_API_KEY) {
  console.error('FATAL ERROR: GEMINI_API_KEY is not set!');
}
const genAI = new GoogleGenerativeAI(GEMINI_API_KEY);
const aiModel = genAI.getGenerativeModel({ model: 'gemini-1.5-flash' });

// --- HEALTH CHECK ENDPOINT ---
app.get('/', (req, res) => {
  res.send("Mind's Soul AI Backend is running on Render with Gemini!");
});

// --- THE CHATBOT'S "PERSONALITY" (System Prompt) ---
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

// --- API ENDPOINT ---
app.post('/api/chat', async (req, res) => {
  try {
    // Use 'let' so we can modify the variables if needed
    let { message, history } = req.body;

    // --- PERMANENT FIX ---
    // If the 'message' field wasn't sent from the app,
    // we extract the latest user message from the history.
    if (!message && history && history.length > 0) {
      message = history[history.length - 1].text;
    }

    // Final check to ensure we have a message to send.
    if (!message) {
      return res.status(400).json({ error: "message is required and was not found." });
    }
    // --- END FIX ---

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
      res.json(plan);
    } catch (e) {
      res.json({ chatMessage: botText });
    }

  } catch (error) {
    console.error("Error in /api/chat:", error); // More detailed logging
    res.status(500).json({ error: 'Failed to get response from AI' });
  }
});

// --- START SERVER ---
const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
  console.log(`✅ Server is running on port ${PORT}`);
});

