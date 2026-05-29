// src/js/lib/utils.js
// ── Pure utility functions ────────────────────────────────────────────

/** Format Rupiah full */
export const fmt = (n) =>
  'Rp ' + Math.abs(n).toLocaleString('id-ID')

/** Format Rupiah short (1.2jt, 500rb) */
export const fmtShort = (n) => {
  const a = Math.abs(n)
  if (a >= 1e9) return 'Rp ' + (a / 1e9).toFixed(1) + 'M'
  if (a >= 1e6) return 'Rp ' + (a / 1e6).toFixed(1) + 'jt'
  if (a >= 1e3) return 'Rp ' + (a / 1e3).toFixed(0) + 'rb'
  return 'Rp ' + a
}

/** Format date to Indonesian locale */
export const fmtDate = (d) => {
  if (!d) return ''
  const dt = new Date(d)
  return dt.toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' })
}

/** Get YYYY-MM key from Date */
export const monthKey = (d) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`

/** Get month label in Indonesian */
export const monthLabel = (d) =>
  d.toLocaleDateString('id-ID', { month: 'long', year: 'numeric' })

/** Generate random id */
export const uid = () =>
  'custom_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6)

/** Debounce a function */
export const debounce = (fn, ms = 300) => {
  let timer
  return (...args) => {
    clearTimeout(timer)
    timer = setTimeout(() => fn(...args), ms)
  }
}

/** Clamp number between min and max */
export const clamp = (n, min, max) => Math.min(Math.max(n, min), max)

/** Get initials from name */
export const initials = (name = '') =>
  name.split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2)

/** Safe JSON parse */
export const safeJSON = (str, fallback = null) => {
  if (str === null || str === undefined) return fallback
  try { return JSON.parse(str) } catch { return fallback }
}
