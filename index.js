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
// --- FIX 1: Correct model name ---
const aiModel = genAI.getGenerativeModel({ model: 'gemini-2.0-flash' }); 

// --- HEALTH CHECK ENDPOINT ---
app.get('/', (req, res) => {
  res.send("Mind's Soul AI Backend is running on Render with Gemini!");
});

// --- THE CHATBOT'S "PERSONALITY" (System Prompt) ---
const SYSTEM_PROMPT = `
You are a kind, empathetic therapist-style chatbot for "Mind's Soul," an app for students in higher studies.
Your goal is to help a student agree to a 10-day self-help plan for issues like stress or addiction.
When you have enough information and the user agrees, you will generate this 10-day plan.
WHEN YOU GENERATE THE PLAN, you must ONLY output a valid JSON object. Do not say "Here is your plan" or anything else. Just the JSON.
The JSON format MUST be:
{
  "planName": "Your 10-Day Plan for [The Problem]",
  "startDate": "YYYY-MM-DD",
  "days": [
    { "day": 1, "tasks": [ { "id": "d1_t1", "title": "Your first task", "completed": false } ] }
    // ...and so on for 10 days
  ]
}
If you are just chatting, do NOT output JSON. Just respond as a normal chatbot.
`;

// --- API ENDPOINT ---
app.post('/api/chat', async (req, res) => {
  try {
    const { message, history } = req.body;
    if (!message || !history) {
      return res.status(400).json({ error: "Request body must contain 'message' and 'history'." });
    }

    const formattedHistory = history.map(msg => ({
      role: msg.sender === 'user' ? 'user' : 'model',
      parts: [{ text: msg.text }],
    }));

    // Remove the latest user message from the history to avoid duplication
    formattedHistory.pop();

    const chat = aiModel.startChat({
      history: [
        { role: 'user', parts: [{ text: SYSTEM_PROMPT }] },
        { role: 'model', parts: [{ text: "I'm here to listen. This is a safe space. Please feel free to tell me what's on your mind." }] },
        ...formattedHistory,
      ],
      generationConfig: { maxOutputTokens: 2048 },
    });
    
    // The Gemini library expects the message to be an array for chat sessions
    const result = await chat.sendMessage([message]); 
    const botText = result.response.text();

    // --- FIX 2: Added JSON cleaning logic ---
    // This removes the markdown code fences (```json) from the AI's response.
    const cleanedBotText = botText
      .replace(/^```json\s*/, '')
      .replace(/```$/, '');

    // Now, we try to parse the CLEANED text.
    try {
      const plan = JSON.parse(cleanedBotText);
      plan.startDate = new Date().toISOString().split('T')[0];
      res.json(plan); // Success! Send the clean plan to the app.
    } catch (e) {
      // If parsing fails, it was just a regular chat message.
      res.json({ chatMessage: botText });
    }

  } catch (error) {
    console.error("Error in /api/chat:", error);
    res.status(500).json({ error: 'Failed to get response from AI' });
  }
});

// --- START SERVER ---
const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
  console.log(`✅ Server is running on port ${PORT}`);
});

