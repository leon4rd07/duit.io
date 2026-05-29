// src/js/lib/toast.js
// ── Toast notification system ─────────────────────────────────────────

let _timer = null

/**
 * Show a toast message
 * @param {string} msg
 * @param {'success'|'error'|'info'} type
 * @param {number} duration ms
 */
export function showToast(msg, type = 'success', duration = 2800) {
  const el = document.getElementById('toast')
  if (!el) return
  el.textContent = msg
  el.className = `show ${type}`
  clearTimeout(_timer)
  _timer = setTimeout(() => { el.className = '' }, duration)
}
