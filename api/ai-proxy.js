// api/ai-proxy.js — Vercel Serverless Function (ES module)

const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const ALLOWED_TASKS = ['scan_receipt', 'split_bill_scan', 'financial_advisor'];

const rateMap = new Map();
function checkRate(ip) {
  const now = Date.now();
  const e = rateMap.get(ip) || { count: 0, t: now };
  if (now - e.t > 60000) { rateMap.set(ip, { count: 1, t: now }); return true; }
  if (e.count >= 20) return false;
  e.count++;
  rateMap.set(ip, e);
  return true;
}

// Cache discovered models across invocations (warm lambda)
let _cachedModels = null;
async function getAvailableModels() {
  if (_cachedModels) return _cachedModels;
  try {
    const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${GEMINI_API_KEY}`);
    const d = await r.json();
    const all = (d.models || [])
      .filter(m => (m.supportedGenerationMethods || []).includes('generateContent'))
      .map(m => m.name.replace('models/', ''));
    // Prefer flash models (fast + cheap), in priority order
    const priority = ['gemini-2.5-flash', 'gemini-2.0-flash', 'gemini-2.0-flash-001', 'gemini-2.0-flash-lite', 'gemini-1.5-flash', 'gemini-1.5-flash-latest'];
    const ordered = [
      ...priority.filter(p => all.includes(p)),
      ...all.filter(m => m.includes('flash') && !priority.includes(m)),
      ...all.filter(m => !m.includes('flash')),
    ];
    _cachedModels = ordered.length ? ordered : all;
    return _cachedModels;
  } catch (e) {
    // Fallback to a reasonable default list
    return ['gemini-2.0-flash', 'gemini-1.5-flash'];
  }
}

export default async function handler(req, res) {
  const origin = req.headers.origin || '';
  const allowedOrigin = origin.endsWith('.vercel.app') || origin.includes('localhost') ? origin : '*';
  res.setHeader('Access-Control-Allow-Origin', allowedOrigin);
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('X-Content-Type-Options', 'nosniff');

  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const ip = (req.headers['x-forwarded-for'] || 'unknown').split(',')[0].trim();
  if (!checkRate(ip)) return res.status(429).json({ error: 'Terlalu banyak permintaan, coba lagi sebentar.' });
  if (!GEMINI_API_KEY) return res.status(500).json({ error: 'GEMINI_API_KEY not set' });

  let body = req.body;
  if (typeof body === 'string') {
    try { body = JSON.parse(body); } catch { return res.status(400).json({ error: 'Invalid JSON' }); }
  }

  const { task, prompt, imageData, mimeType } = body || {};
  if (!task || !prompt) return res.status(400).json({ error: 'Missing fields' });
  if (!ALLOWED_TASKS.includes(task)) return res.status(400).json({ error: 'Invalid task' });

  const parts = [];
  if (imageData && mimeType) parts.push({ inlineData: { mimeType, data: imageData } });
  parts.push({ text: prompt });

  const MODELS = await getAvailableModels();
  if (!MODELS.length) {
    return res.status(502).json({ error: 'Tidak ada model AI tersedia untuk API key ini.' });
  }

  let lastErr = '';
  for (const model of MODELS) {
    try {
      const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${GEMINI_API_KEY}`;
      const r = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts }],
          generationConfig: { temperature: 0.1, maxOutputTokens: 1200 },
        }),
      });

      if (r.ok) {
        const d = await r.json();
        const text = d.candidates?.[0]?.content?.parts?.[0]?.text || '';
        if (text) return res.status(200).json({ text, model });
        lastErr = `${model}: empty response`;
      } else {
        lastErr = `${model}: ${r.status}`;
        const errText = await r.text();
        console.error(`${model}: ${r.status} ${errText}`);
        // If model not found, reset cache so next call re-discovers
        if (r.status === 404) _cachedModels = null;
      }
    } catch (e) {
      lastErr = `${model}: ${e.message}`;
      console.error(`${model} error:`, e.message);
    }
  }

  return res.status(502).json({ error: `Semua model gagal (${lastErr}). Models dicoba: ${MODELS.slice(0,3).join(', ')}` });
};
