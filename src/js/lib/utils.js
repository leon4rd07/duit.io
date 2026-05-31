// src/js/lib/utils.js
// ── Pure utility functions ────────────────────────────────────────────

/** Get current currency settings from localStorage */
function getCurrency() {
  try {
    const code = localStorage.getItem('currency') || 'IDR'
    const map = {
      'IDR': { symbol: 'Rp', locale: 'id-ID' },
      'USD': { symbol: '$',  locale: 'en-US' },
      'EUR': { symbol: '€',  locale: 'de-DE' },
      'JPY': { symbol: '¥',  locale: 'ja-JP' },
      'SGD': { symbol: 'S$', locale: 'en-SG' },
      'MYR': { symbol: 'RM', locale: 'ms-MY' },
      'GBP': { symbol: '£',  locale: 'en-GB' },
      'AUD': { symbol: 'A$', locale: 'en-AU' },
      'CNY': { symbol: '¥',  locale: 'zh-CN' },
      'KRW': { symbol: '₩',  locale: 'ko-KR' },
    }
    return map[code] || map['IDR']
  } catch { return { symbol: 'Rp', locale: 'id-ID' } }
}

/** Format money — full */
export const fmt = n => {
  const c = getCurrency()
  const num = Number(n) || 0
  const sign = num < 0 ? '-' : ''
  const abs = Math.abs(Math.round(num))
  return `${sign}${c.symbol} ${abs.toLocaleString(c.locale)}`
}

/** Format money short (1.2jt / 1.2M / 500rb / 500K) */
export const fmtShort = n => {
  const c = getCurrency()
  const num = Number(n) || 0
  const a = Math.abs(num)
  const sign = num < 0 ? '-' : ''
  // For non-IDR, use English short
  const isIDR = c.symbol === 'Rp'
  if (a >= 1e9) return `${sign}${c.symbol} ${(a/1e9).toFixed(1)}${isIDR ? 'M' : 'B'}`
  if (a >= 1e6) return `${sign}${c.symbol} ${(a/1e6).toFixed(1)}${isIDR ? 'jt' : 'M'}`
  if (a >= 1e3) return `${sign}${c.symbol} ${(a/1e3).toFixed(0)}${isIDR ? 'rb' : 'K'}`
  return `${sign}${c.symbol} ${a}`
}

/** Format date to user locale */
export const fmtDate = (d) => {
  if (!d) return ''
  const dt = new Date(d)
  const loc = getCurrency().locale
  return dt.toLocaleDateString(loc, { day: 'numeric', month: 'short', year: 'numeric' })
}

/** Get YYYY-MM key from Date */
export const monthKey = (d) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`

/** Get month name + year (e.g. "Mei 2025") */
export const monthLabel = (d) => {
  const loc = getCurrency().locale
  return d.toLocaleDateString(loc, { month: 'long', year: 'numeric' })
}

/** Safe JSON parse with fallback */
export const safeJSON = (str, fallback = null) => {
  if (str === null || str === undefined) return fallback
  try { return JSON.parse(str) } catch { return fallback }
}

/** Format Date to YYYY-MM-DD using LOCAL timezone (not UTC) */
export function toLocalDateString(d = new Date()) {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

/** Hide balance helpers */
export function isBalanceHidden(id) {
  if (id === 'total') {
    return localStorage.getItem('hide_total_balance') === '1'
  }
  const prefs = safeJSON(localStorage.getItem('acct_prefs_v1'), {}) || {}
  return prefs[`hide_bal_${id}`] === true
}

// ── Money input formatting ───────────────────────────────────────────
/** Format number with dots as thousand separator */
export function formatThousands(num) {
  if (num === '' || num == null) return ''
  const n = String(num).replace(/[^\d]/g, '')
  if (!n) return ''
  return n.replace(/\B(?=(\d{3})+(?!\d))/g, '.')
}

/** Parse formatted money string back to number */
export function parseMoneyInput(str) {
  if (!str) return 0
  return parseInt(String(str).replace(/[^\d]/g, '')) || 0
}

/** Attach auto-format to a text input */
export function attachMoneyFormatter(input) {
  if (!input || input._moneyFormatted) return
  input._moneyFormatted = true
  input.setAttribute('inputmode', 'numeric')
  input.type = 'text'
  input.addEventListener('input', e => {
    const cursor = e.target.selectionStart
    const oldLen = e.target.value.length
    e.target.value = formatThousands(e.target.value)
    const newLen = e.target.value.length
    const newPos = cursor + (newLen - oldLen)
    e.target.setSelectionRange(newPos, newPos)
  })
}
