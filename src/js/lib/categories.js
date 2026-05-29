// src/js/lib/categories.js
// ── Category management ───────────────────────────────────────────────
export { DEFAULT_CATS, GROUP_ORDER_EXPENSE, GROUP_ORDER_INCOME } from './config.js'
import { safeJSON } from './utils.js'

// ── Persistence ───────────────────────────────────────────────────────

const STORAGE_KEY       = 'custom_cats_v2'
const HIDDEN_KEY        = 'hidden_cats'
const GROUP_ORDER_KEY   = (type) => `group_order_${type}`

export const getCustomCats  = () => safeJSON(localStorage.getItem(STORAGE_KEY), [])
export const getHiddenCats  = () => safeJSON(localStorage.getItem(HIDDEN_KEY), [])
export const saveCustomCats = (cats) => localStorage.setItem(STORAGE_KEY, JSON.stringify(cats))
export const saveHiddenCats = (ids)  => localStorage.setItem(HIDDEN_KEY, JSON.stringify(ids))

// ── Read all active categories ────────────────────────────────────────

export function getAllCats() {
  const hidden = getHiddenCats()
  const custom = getCustomCats()
  const defaults = DEFAULT_CATS.filter(c => !hidden.includes(c.id))
  return [...defaults, ...custom]
}

// ── Get cat object by full name (icon + name) ─────────────────────────

export function getCatObj(fullName = '') {
  return getAllCats().find(c =>
    (c.icon + ' ' + c.name) === fullName || c.name === fullName
  ) || { icon: '📦', color: '#636e72', group: 'Ungrouped' }
}

// ── Get categories grouped by group, in preferred order ───────────────

export function getCatGroups(type) {
  const cats = getAllCats().filter(c => c.type === type || c.type === 'both')
  const raw = {}
  cats.forEach(c => {
    if (!raw[c.group]) raw[c.group] = []
    raw[c.group].push(c)
  })
  const order = getGroupOrder(type)
  const sorted = {}
  order.forEach(g => { if (raw[g]) sorted[g] = raw[g] })
  Object.keys(raw).forEach(g => { if (!sorted[g]) sorted[g] = raw[g] })
  return sorted
}

// ── CATEGORIES compat helper (returns flat name list) ─────────────────

export const CATEGORIES = {
  get expense() { return getAllCats().filter(c => c.type === 'expense').map(c => c.icon + ' ' + c.name) },
  get income()  { return getAllCats().filter(c => c.type === 'income').map(c => c.icon + ' ' + c.name) },
}

// ── Group order management ────────────────────────────────────────────

export function getGroupOrder(type) {
  const saved = safeJSON(localStorage.getItem(GROUP_ORDER_KEY(type)), null)
  if (saved) return saved
  return type === 'income' ? [...GROUP_ORDER_INCOME] : [...GROUP_ORDER_EXPENSE]
}

export function saveGroupOrder(type, order) {
  localStorage.setItem(GROUP_ORDER_KEY(type), JSON.stringify(order))
}

export function getAllGroupsOrdered(type) {
  const order = getGroupOrder(type)
  const all   = getAllCats()
  const catGroups = [...new Set(all.filter(c => c.type === type).map(c => c.group))]
  catGroups.forEach(g => { if (!order.includes(g)) order.push(g) })
  return order
}

// ── CRUD ──────────────────────────────────────────────────────────────

export function addCategory(cat) {
  const custom = getCustomCats()
  custom.push(cat)
  saveCustomCats(custom)
}

export function updateCategory(id, updates) {
  const isDefault = DEFAULT_CATS.find(c => c.id === id)
  const custom = getCustomCats()

  if (isDefault) {
    // Hide original, save override with same id
    const hidden = getHiddenCats()
    if (!hidden.includes(id)) { hidden.push(id); saveHiddenCats(hidden) }
    const idx = custom.findIndex(c => c.id === id)
    if (idx >= 0) Object.assign(custom[idx], updates)
    else custom.push({ ...isDefault, ...updates })
  } else {
    const idx = custom.findIndex(c => c.id === id)
    if (idx >= 0) Object.assign(custom[idx], updates)
  }
  saveCustomCats(custom)
}

export function deleteCategory(id) {
  const isDefault = DEFAULT_CATS.find(c => c.id === id)
  if (isDefault) {
    const hidden = getHiddenCats()
    if (!hidden.includes(id)) { hidden.push(id); saveHiddenCats(hidden) }
  } else {
    saveCustomCats(getCustomCats().filter(c => c.id !== id))
  }
}

export function moveCatToGroup(catId, newGroup) {
  updateCategory(catId, { group: newGroup })
}

export function addGroup(type, name) {
  const order = getGroupOrder(type)
  const uIdx = order.indexOf('Ungrouped')
  if (uIdx >= 0) order.splice(uIdx, 0, name)
  else order.push(name)
  saveGroupOrder(type, order)
}

export function deleteGroup(type, name) {
  // Move all cats in this group to Ungrouped
  const groups = getCatGroups(type)
  ;(groups[name] || []).forEach(c => moveCatToGroup(c.id, 'Ungrouped'))
  const order = getGroupOrder(type).filter(g => g !== name)
  saveGroupOrder(type, order)
}

export function renameGroup(type, oldName, newName) {
  const order = getGroupOrder(type)
  const idx = order.indexOf(oldName)
  if (idx >= 0) order[idx] = newName
  saveGroupOrder(type, order)
  const custom = getCustomCats()
  custom.forEach(c => { if (c.group === oldName) c.group = newName })
  saveCustomCats(custom)
}

// Alias
export const deleteCat = deleteCategory

// Compatibility proxies for legacy code
export const CAT_ICONS  = new Proxy({}, { get: (_, k) => getCatObj(k).icon  || '📦' })
export const CAT_COLORS = new Proxy({}, { get: (_, k) => getCatObj(k).color || '#636e72' })
