require('dotenv').config();
const express = require('express');
const http = require('http');
const { Server } = require("socket.io");
const cors = require('cors');
const { GoogleGenerativeAI } = require('@google/generative-ai');

// --- SETUP ---
const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: "*", // Allows connections from your Snack app
    methods: ["GET", "POST"]
  }
});

app.use(express.json());
app.use(cors());

// --- GEMINI AI SETUP ---
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
if (!GEMINI_API_KEY) {
  console.error('FATAL ERROR: GEMINI_API_KEY is not set in your environment variables!');
}
const genAI = new GoogleGenerativeAI(GEMINI_API_KEY);
// Corrected model name for the free tier
const aiModel = genAI.getGenerativeModel({ model: 'gemini-1.5-flash' });

// --- HEALTH CHECK ENDPOINT ---
app.get('/', (req, res) => {
  res.send("Mind's Soul AI & Chat Backend is running on Render!");
});

// --- AI CHATBOT LOGIC (/api/chat) ---
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
  ]
}
If you are just chatting, do NOT output JSON.
`;

app.post('/api/chat', async (req, res) => {
  try {
    const { message, history } = req.body;
    if (!message || !history) {
      return res.status(400).json({ error: "Request body must contain 'message' and 'history'." });
    }

    const formattedHistory = history.map(msg => ({
      role: msg.sender === 'user' ? 'user' : 'model',
      parts: [{ text: msg.text }],
    })).slice(0, -1); // Remove the last message (current user input)

    const chat = aiModel.startChat({
      history: [
        { role: 'user', parts: [{ text: SYSTEM_PROMPT }] },
        { role: 'model', parts: [{ text: "I'm here to listen..." }] },
        ...formattedHistory,
      ],
      generationConfig: { maxOutputTokens: 2048 },
    });
    
    const result = await chat.sendMessage(message);
    const botText = result.response.text();
    
    // Clean potential markdown from the AI's response
    const cleanedBotText = botText.replace(/^```json\s*/, '').replace(/```$/, '');

    try {
      const plan = JSON.parse(cleanedBotText);
      plan.startDate = new Date().toISOString().split('T')[0];
      res.json(plan);
    } catch (e) {
      res.json({ chatMessage: botText });
    }

  } catch (error) {
    console.error("Error in /api/chat:", error);
    res.status(500).json({ error: 'Failed to get response from AI' });
  }
});


// --- ANONYMOUS REAL-TIME CHAT LOGIC (socket.io) ---
// This listener is now correctly placed at the top level.
io.on('connection', (socket) => {
  console.log('a user connected to anonymous chat:', socket.id);

  socket.on('join_room', (data) => {
    const { roomName, alias } = data;
    socket.join(roomName);
    console.log(`${alias} (${socket.id}) joined room: ${roomName}`);
  });

  socket.on('send_message', (data) => {
    // When a message is received, broadcast it to others in the same room.
    socket.to(data.room).emit('new_message', data);
  });

  socket.on('disconnect', () => {
    console.log('user disconnected from anonymous chat:', socket.id);
  });
});


// --- START THE SERVER (ONCE) ---
// This is now correctly placed at the end of the file.
const PORT = process.env.PORT || 3001;
server.listen(PORT, () => {
  console.log(`✅ Server is running on port ${PORT}`);
});

