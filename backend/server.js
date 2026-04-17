require('dotenv').config();
const express = require('express');
const cors = require('cors');
const mongoose = require('mongoose');
const axios = require('axios');

const app = express();
app.use(cors());
app.use(express.json({ limit: '10mb' }));

// MongoDB Connect
mongoose.connect(process.env.MONGODB_URI, {
  useNewUrlParser: true,
  useUnifiedTopology: true
}).then(() => console.log('✅ MongoDB Connected'))
  .catch(err => console.error('❌ DB Error:', err));

// Schema: User Usage Tracking
const userUsageSchema = new mongoose.Schema({
  userId: { type: String, required: true, unique: true },
  deepThinkingUsed: { type: Number, default: 0 },
  advancedUsed: { type: Number, default: 0 },
  lastResetDate: { type: Date, default: Date.now },
  totalQuestions: { type: Number, default: 0 },
  subjects: [String]
});
const UserUsage = mongoose.model('UserUsage', userUsageSchema);

// Helper: Extract Keywords
const extractKeywords = (q) => q.split(/\s+/).filter(w => w.length > 3).slice(0, 3).join('+');
const getGreeting = () => {
  const h = new Date().getHours();
  return h < 12 ? 'Good Morning 🌅' : h < 17 ? 'Good Afternoon ☀️' : 'Good Evening 🌙';
};

// API 1: GROQ (Fast)
const callGroq = async (q) => {
  const res = await axios.post('https://api.groq.com/openai/v1/chat/completions', {
    model: 'llama3-8b-8192',
    messages: [{ role: 'system', content: 'Concise answer in 2-3 sentences.' }, { role: 'user', content: q }],
    max_tokens: 200, temperature: 0.3
  }, { headers: { Authorization: `Bearer ${process.env.GROQ_API_KEY}` }, timeout: 5000 });
  return res.data.choices[0].message.content;
};

// API 2: GEMINI (Deep/Advanced)
const callGemini = async (q, mode) => {
  const prompt = mode === 'deep' 
    ? `Detailed step-by-step explanation for: ${q}`
    : `Explain with 2 alternative methods for: ${q}`;  const res = await axios.post(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-pro:generateContent?key=${process.env.GEMINI_API_KEY}`,
    { contents: [{ parts: [{ text: prompt }] }], generationConfig: { maxOutputTokens: 800 } },
    { timeout: 25000 }
  );
  return res.data.candidates[0].content.parts[0].text;
};

// API 3: HUGGING FACE (Motivation/Analysis)
const getMotivation = async (userId, history) => {
  try {
    const res = await axios.post(
      'https://api-inference.huggingface.co/models/mistralai/Mistral-7B-Instruct-v0.2',
      { inputs: `Student history: ${JSON.stringify(history)}. Give 1 line Hinglish motivation.`, parameters: { max_new_tokens: 100 } },
      { headers: { Authorization: `Bearer ${process.env.HUGGINGFACE_API_KEY}` } }
    );
    return res.data[0]?.generated_text || 'आज का दिन learning के लिए perfect है! 💪';
  } catch {
    return 'हर दिन नया सीखने का दिन है! 🌟';
  }
};

// Image Search (Internet se, generate nahi)
const searchImage = async (q) => {
  try {
    const res = await axios.get('https://api.bing.microsoft.com/v7.0/images/search', {
      params: { q: `${extractKeywords(q)} educational diagram`, count: 1, safeSearch: 'Moderate' },
      headers: { 'Ocp-Apim-Subscription-Key': process.env.BING_SEARCH_API_KEY }
    });
    if (res.data.value?.length) return { url: res.data.value[0].contentUrl, source: 'Bing' };
  } catch {
    try {
      const uns = await axios.get(`https://api.unsplash.com/search/photos?query=${extractKeywords(q)}&per_page=1`, {
        headers: { Authorization: `Client-ID ${process.env.UNSPLASH_ACCESS_KEY}` }
      });
      if (uns.data.results?.length) return { url: uns.data.results[0].urls.regular, source: 'Unsplash' };
    } catch {}
  }
  return null;
};

// Limit Reset Helper
const checkLimits = async (userId) => {
  const today = new Date(); today.setHours(0,0,0,0);
  let u = await UserUsage.findOne({ userId });
  if (!u) u = new UserUsage({ userId });
  const last = new Date(u.lastResetDate); last.setHours(0,0,0,0);
  if (last < today) { u.deepThinkingUsed = 0; u.advancedUsed = 0; u.lastResetDate = today; await u.save(); }
  return u;
};
// ROUTES
app.post('/api/ask', async (req, res) => {
  const { question, mode, userId, includeImage } = req.body;
  if (!question || !userId) return res.status(400).json({ error: 'Missing fields' });
  
  const u = await checkLimits(userId);
  const start = Date.now();
  let ans, img = null;

  if (mode === 'fast') {
    ans = await callGroq(question);
    return res.json({ answer: ans, mode: 'fast', responseTime: `${Date.now()-start}ms` });
  }
  if (mode === 'deep') {
    if (u.deepThinkingUsed >= 2) return res.status(429).json({ error: 'Deep limit reached (2/day)', remaining: 0 });
    ans = await callGemini(question, 'deep');
    u.deepThinkingUsed++; u.totalQuestions++; await u.save();
    return res.json({ answer: ans, mode: 'deep', remainingDeep: 2 - u.deepThinkingUsed, responseTime: `${Date.now()-start}ms` });
  }
  if (mode === 'advanced') {
    if (u.advancedUsed >= 2) return res.status(429).json({ error: 'Advanced limit reached (2/day)', remaining: 0 });
    ans = await callGemini(question, 'advanced');
    if (includeImage || /image|photo|diagram/i.test(question)) img = await searchImage(question);
    u.advancedUsed++; u.totalQuestions++; await u.save();
    return res.json({ answer: ans, image: img, mode: 'advanced', remainingAdvanced: 2 - u.advancedUsed });
  }
  res.status(400).json({ error: 'Invalid mode' });
});

app.get('/api/motivation/:userId', async (req, res) => {
  const u = await UserUsage.findOne({ userId });
  const msg = await getMotivation(req.params.userId, u);
  res.json({ greeting: getGreeting(), motivationalLine: msg });
});

app.get('/health', (req, res) => res.json({ status: 'OK', apis: ['Groq', 'Gemini', 'HF'] }));

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`🚀 Server running on port ${PORT}`));
