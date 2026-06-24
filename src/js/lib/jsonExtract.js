// src/js/lib/jsonExtract.js
// Robustly extract a JSON object from an AI text response that may be wrapped
// in markdown fences or have stray prose before/after the actual JSON.
//
// Why this exists: a naive `text.match(/\{[\s\S]*\}/)` is GREEDY — if the AI
// adds any explanation containing curly braces after the JSON, the match can
// overshoot past the real object's closing brace and grab trailing garbage,
// which then fails JSON.parse. This walks brace-depth from the FIRST '{' to
// find its true matching '}', so trailing text can never corrupt the result.

export function extractJsonObject(text) {
  if (!text || typeof text !== 'string') throw new Error('Respons AI kosong')

  // Strip markdown code fences first (common AI formatting habit)
  let cleaned = text.replace(/```json/gi, '').replace(/```/g, '').trim()

  // Fast path: well-behaved AI just returns clean JSON
  try { return JSON.parse(cleaned) } catch {}

  // Find the first '{' and walk forward counting brace depth until it
  // returns to zero — this is the TRUE matching closing brace, immune to
  // any extra '{'/'}' characters in prose that follows.
  const start = cleaned.indexOf('{')
  if (start === -1) throw new Error('Tidak ada JSON di respons AI')

  let depth = 0
  let end = -1
  for (let i = start; i < cleaned.length; i++) {
    const ch = cleaned[i]
    if (ch === '{') depth++
    else if (ch === '}') {
      depth--
      if (depth === 0) { end = i; break }
    }
  }
  if (end === -1) throw new Error('JSON tidak lengkap di respons AI')

  let jsonStr = cleaned.slice(start, end + 1)
  // Remove trailing commas before a closing brace/bracket — a common LLM slip
  jsonStr = jsonStr.replace(/,(\s*[}\]])/g, '$1')

  return JSON.parse(jsonStr)
}
