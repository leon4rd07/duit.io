// src/js/lib/i18n.js
// Lightweight i18n — no external dependencies.
//
// Usage:
//   import { t, setLang, getLang } from './i18n.js'
//   t('btn.save')                          → "Save" / "Simpan"
//   t('greet.hello', { name: 'Leo' })      → interpolation: {name} → "Leo"
//   t('count.items', { count: 3, _plural: { id: 'satu|banyak', en: 'one|many' } })
//
// Falls back: en → id → key itself (so missing keys are visible, not silent).

import { translations } from './translations.js'

const LS_KEY = 'app_lang'

function detectLang() {
  const stored = localStorage.getItem(LS_KEY)
  if (stored === 'en' || stored === 'id') return stored
  try {
    const browserLang = (navigator.language || 'id').slice(0, 2).toLowerCase()
    return browserLang === 'en' ? 'en' : 'id' // default to ID for everything else
  } catch {
    return 'id'
  }
}

let _currentLang = detectLang()

export function getLang() {
  return _currentLang
}

export function setLang(lang) {
  if (lang !== 'en' && lang !== 'id') return
  _currentLang = lang
  localStorage.setItem(LS_KEY, lang)
  try { document.documentElement.lang = lang } catch {}
  // Notify subscribers (re-render hooks)
  _listeners.forEach(fn => { try { fn(lang) } catch (e) { console.warn(e) } })
}

// Subscribe to language changes (e.g. re-render current page)
const _listeners = new Set()
export function onLangChange(fn) {
  _listeners.add(fn)
  return () => _listeners.delete(fn)
}

/**
 * Translate a key with optional interpolation.
 * @param {string} key — dot-notation key, e.g. "nav.dashboard"
 * @param {object} [vars] — interpolation vars + reserved `_plural` map
 */
export function t(key, vars) {
  const dict = translations[_currentLang] || translations.id
  const fallback = translations.id
  let str = dict[key]
  if (str === undefined) str = fallback[key]
  if (str === undefined) {
    // In dev, log missing key (silent in prod)
    if (typeof window !== 'undefined' && window.location?.hostname === 'localhost') {
      console.warn(`[i18n] Missing key: "${key}" (${_currentLang})`)
    }
    return key
  }

  if (vars && typeof vars === 'object') {
    // Plural handling: vars.count + vars._plural = { id: 'one|many', en: 'one|many' }
    if (vars._plural && typeof vars.count === 'number') {
      const pluralStr = vars._plural[_currentLang] || vars._plural.id
      if (pluralStr) {
        const [one, many] = pluralStr.split('|')
        str = vars.count === 1 ? one : many
      }
    }
    // Interpolation: replace {key} with vars[key]
    str = str.replace(/\{(\w+)\}/g, (match, name) => {
      return vars[name] !== undefined ? vars[name] : match
    })
  }
  return str
}

// Initialize document lang attribute on load
try { document.documentElement.lang = _currentLang } catch {}
