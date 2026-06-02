// api/health.js — diagnostic endpoint (safe, doesn't expose the key)
module.exports = function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  const key = process.env.GEMINI_API_KEY;
  res.status(200).json({
    ok: true,
    gemini_key_present: !!key,
    gemini_key_length: key ? key.length : 0,
    gemini_key_prefix: key ? key.slice(0, 4) + '...' : null,
    node_version: process.version,
    timestamp: new Date().toISOString(),
  });
};
