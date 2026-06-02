// src/js/lib/ai.js
// All AI calls go through the secure Vercel server function
// The Gemini API key NEVER reaches the browser

const AI_PROXY_URL = '/api/ai-proxy'

/**
 * Call the AI proxy
 * @param {'scan_receipt'|'split_bill_scan'|'financial_advisor'} task
 * @param {string} prompt
 * @param {string|null} imageData - base64 image data
 * @param {string} mimeType
 * @returns {Promise<string>} AI response text
 */
export async function callAI(task, prompt, imageData = null, mimeType = null) {
  const body = { task, prompt }
  if (imageData) {
    body.imageData = imageData
    body.mimeType  = mimeType || 'image/jpeg'
  }

  const res = await fetch(AI_PROXY_URL, {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body:    JSON.stringify(body),
  })

  if (!res.ok) {
    let errMsg = `HTTP ${res.status}`
    try {
      const err = await res.json()
      if (typeof err.error === 'string') errMsg = err.error
      else if (err.error && typeof err.error === 'object') errMsg = JSON.stringify(err.error)
      else if (err.message) errMsg = err.message
      else errMsg = JSON.stringify(err)
      // Append detail if present (for debugging)
      if (err.detail) errMsg += ` — ${err.detail}`
    } catch {
      try { errMsg = await res.text() } catch {}
    }
    throw new Error(errMsg)
  }

  const data = await res.json()
  return data.text || ''
}
