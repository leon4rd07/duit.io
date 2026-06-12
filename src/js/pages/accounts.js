// src/js/pages/accounts.js
import { state }        from '../lib/store.js'
import { showToast }    from '../lib/toast.js'
import { navigate }     from '../lib/router.js'
import { fmt, fmtShort, toLocalDateString } from '../lib/utils.js'
import { BANK_ICONS } from '../lib/config.js'
import * as DB          from '../lib/supabase.js'
import { t }            from '../lib/i18n.js'

// ── Persistent prefs ─────────────────────────────────────────────────
const PREFS_KEY    = 'acct_prefs_v1'
const ORDER_KEY    = 'acct_order_v1'
const GRP_ORDER_KEY = 'acct_group_order_v1'

const getPrefs = () => { try { return JSON.parse(localStorage.getItem(PREFS_KEY)||'{}') } catch { return {} } }
const savePrefs = p => localStorage.setItem(PREFS_KEY, JSON.stringify(p))
const getOrder = () => { try { return JSON.parse(localStorage.getItem(ORDER_KEY)||'[]') } catch { return [] } }
const saveOrder = o => localStorage.setItem(ORDER_KEY, JSON.stringify(o))
const getGroupOrder = () => { try { return JSON.parse(localStorage.getItem(GRP_ORDER_KEY)||'[]') } catch { return [] } }
const saveGroupOrder = o => localStorage.setItem(GRP_ORDER_KEY, JSON.stringify(o))

function getSortedAccounts() {
  const order = getOrder()
  const accts = [...state.accounts]
  if (!order.length) return accts
  return accts.sort((a,b) => {
    const ai = order.indexOf(a.id), bi = order.indexOf(b.id)
    if (ai === -1 && bi === -1) return 0
    if (ai === -1) return 1
    if (bi === -1) return -1
    return ai - bi
  })
}

function getSortedGroups(allCats) {
  const savedOrder = getGroupOrder()
  if (!savedOrder.length) return allCats
  const sorted = [...savedOrder.filter(c => allCats.includes(c))]
  allCats.forEach(c => { if (!sorted.includes(c)) sorted.push(c) })
  return sorted
}

let _dragId = null
let _dragGroup = null

function renderAccounts(area, actions) {
  const prefs = getPrefs()
  const hideTotal = localStorage.getItem('hide_total_balance') === '1'

  actions.innerHTML = `<button class="btn btn-accent btn-sm" onclick="window.openAddAccount && window.openAddAccount()">${t('acct.add_btn')}</button>`

  const sorted = getSortedAccounts()
  const total = sorted.reduce((s,a) => s + Number(a.balance), 0)

  // Group by category
  const catGroups = {}
  sorted.forEach(a => {
    const cat = a.category || t('acct.uncategorized')
    if (!catGroups[cat]) catGroups[cat] = []
    catGroups[cat].push(a)
  })

  const catOrder = getSortedGroups(Object.keys(catGroups))

  area.innerHTML = `
    <div class="card mb-16" style="background:linear-gradient(135deg,var(--bg3),var(--bg2));position:relative">
      <div style="display:flex;justify-content:space-between;align-items:flex-start">
        <div>
          <div class="stat-label">${t('acct.total_balance')}</div>
          <div style="font-size:30px;font-weight:800;color:var(--accent);margin:4px 0">
            ${hideTotal ? '••••••••' : fmt(total)}
          </div>
        </div>
        <button class="btn-icon" onclick="toggleHideTotal()" title="${hideTotal ? t('acct.show_all') : t('acct.hide_all')}">
          ${hideTotal ? '👁‍🗨' : '👁'}
        </button>
      </div>
      <div style="display:flex;gap:12px;flex-wrap:wrap;margin-top:8px">
        ${catOrder.map(cat => {
          const catTotal = catGroups[cat].reduce((s,a) => s+Number(a.balance), 0)
          return `<div style="font-size:12px;color:var(--text2)">📂 ${cat}: <span style="font-weight:600;color:var(--text)">${hideTotal ? '•••' : fmtShort(catTotal)}</span></div>`
        }).join('')}
      </div>
    </div>

    ${catOrder.map(cat => {
      const accs = catGroups[cat]
      const collapsed = prefs[`collapse_${cat}`]
      const catTotal = accs.reduce((s,a) => s+Number(a.balance), 0)
      const safeId = cat.replace(/\s+/g,'_')
      return `
        <div class="acct-group"
          id="grp-${safeId}"
          draggable="true"
          ondragstart="grpDragStart(event,'${cat}')"
          ondragend="grpDragEnd(event)"
          ondragover="grpDragOver(event,'${cat}')"
          ondrop="grpDrop(event,'${cat}')">
          <div class="acct-group-header" onclick="toggleAcctGroup('${cat}')">
            <div style="display:flex;align-items:center;gap:8px;flex:1">
              <span class="grp-drag-handle" title="${t('acct.drag_hint')}" onclick="event.stopPropagation()">⠿</span>
              <span style="font-size:15px;font-weight:700">${cat}</span>
              <span style="font-size:12px;color:var(--text2)">${hideTotal ? '•••' : fmtShort(catTotal)}</span>
              <span style="font-size:11px;color:var(--text3)">(${accs.length})</span>
            </div>
            <span style="font-size:18px;color:var(--text3);display:inline-block;transform:${collapsed?'rotate(-90deg)':'rotate(0)'}">▾</span>
          </div>
          <div class="acct-group-body" style="${collapsed?'display:none':''}">
            <div class="grid-2 mb-8" ondragover="event.preventDefault()" ondrop="acctDropOnGroup(event,'${cat}')">
              ${accs.map(a => renderAccountCard(a, prefs, hideTotal)).join('')}
            </div>
          </div>
        </div>`
    }).join('')}

    ${!state.accounts.length ? `<div class="empty-state"><div class="empty-icon">💳</div><p>${t('acct.empty_dot')}</p></div>` : ''}
  `
}

function renderAccountCard(a, prefs, hideTotal) {
  const txCount = state.transactions.filter(t => t.account_id===a.id || t.to_account_id===a.id).length
  const accColor = a.color || 'var(--accent)'
  // Note: prefer Supabase-synced value (a.note), fallback to local prefs
  const note = (a.note !== undefined && a.note !== null && a.note !== '')
    ? a.note
    : (prefs[`note_${a.id}`] || '')
  const hideThis = prefs[`hide_bal_${a.id}`] || hideTotal

  return `<div class="account-card acct-draggable"
    data-id="${a.id}"
    draggable="true"
    style="border-top:3px solid ${accColor};position:relative"
    ondragstart="acctDragStart(event,'${a.id}')"
    ondragend="acctDragEnd(event)"
    ondragover="acctDragOver(event,'${a.id}')"
    ondrop="acctDrop(event,'${a.id}')">

    <div style="position:absolute;top:8px;right:8px;display:flex;gap:4px;z-index:2">
      <button class="acct-icon-btn" onclick="event.stopPropagation();toggleHideBalance('${a.id}')" title="${hideThis ? t('acct.show_balance') : t('acct.hide_balance')}">
        ${hideThis ? '👁‍🗨' : '👁'}
      </button>
    </div>

    <div style="cursor:pointer" onclick="window.openAccountDetail && window.openAccountDetail('${a.id}')">
      <div class="account-bank">${a.icon || BANK_ICONS[a.bank] || '🏦'} ${a.bank}</div>
      <div class="account-name">${a.name}</div>
      <div class="account-balance" style="color:${accColor}">
        ${hideThis ? '••••••' : fmt(a.balance)}
      </div>
      <div style="margin-top:6px;display:flex;gap:5px;flex-wrap:wrap">
        ${a.acct_type ? `<span style="font-size:10px;font-weight:600;background:var(--bg4);color:var(--text3);padding:2px 6px;border-radius:6px">${a.acct_type}</span>` : ''}
        <span style="font-size:10px;color:var(--text3)">${t('acct.tx_count', { count: txCount })}</span>
      </div>
    </div>

    <div class="acct-note-wrap" onclick="event.stopPropagation()">
      <textarea class="acct-note-input" placeholder="${t('acct.note_placeholder')}" rows="2" oninput="saveAcctNote('${a.id}',this.value)">${note}</textarea>
    </div>
  </div>`
}

// ── Toggles ───────────────────────────────────────────────────────────
function toggleHideTotal() {
  const cur = localStorage.getItem('hide_total_balance') === '1'
  localStorage.setItem('hide_total_balance', cur ? '0' : '1')
  navigate('accounts')
}

function toggleHideBalance(id) {
  const prefs = getPrefs()
  prefs[`hide_bal_${id}`] = !prefs[`hide_bal_${id}`]
  savePrefs(prefs)
  navigate('accounts')
}

function toggleAcctGroup(cat) {
  const prefs = getPrefs()
  prefs[`collapse_${cat}`] = !prefs[`collapse_${cat}`]
  savePrefs(prefs)
  navigate('accounts')
}

let _noteSaveTimers = {}
function saveAcctNote(id, value) {
  // Optimistic: update local state + localStorage immediately
  const prefs = getPrefs()
  prefs[`note_${id}`] = value
  savePrefs(prefs)
  const acct = state.accounts.find(a => a.id === id)
  if (acct) acct.note = value

  // Debounced Supabase sync (so notes appear on other devices)
  clearTimeout(_noteSaveTimers[id])
  _noteSaveTimers[id] = setTimeout(async () => {
    try {
      await DB.updateAccount(id, { note: value })
    } catch (e) {
      // If column doesn't exist yet or offline, localStorage still has it
      console.warn('Note sync failed (using local copy):', e.message)
    }
  }, 600)
}

// ── Drag & drop cards ─────────────────────────────────────────────────
function acctDragStart(e, id) {
  e.stopPropagation()
  _dragId = id
  _dragGroup = null
  e.currentTarget.classList.add('dragging')
  e.dataTransfer.effectAllowed = 'move'
}
function acctDragEnd(e) {
  e.currentTarget.classList.remove('dragging')
  document.querySelectorAll('.acct-draggable').forEach(c => c.classList.remove('drag-over'))
  _dragId = null
}
function acctDragOver(e, id) {
  if (!_dragId) return
  e.preventDefault()
  e.stopPropagation()
  if (id === _dragId) return
  document.querySelectorAll('.acct-draggable').forEach(c => c.classList.remove('drag-over'))
  e.currentTarget.classList.add('drag-over')
}
function acctDrop(e, targetId) {
  e.preventDefault()
  e.stopPropagation()
  if (!_dragId || _dragId === targetId) return
  const sorted = getSortedAccounts()
  const ids = sorted.map(a => a.id)
  const fromI = ids.indexOf(_dragId), toI = ids.indexOf(targetId)
  if (fromI === -1 || toI === -1) return
  ids.splice(fromI, 1)
  ids.splice(toI, 0, _dragId)
  saveOrder(ids)
  showToast('Urutan disimpan')
  navigate('accounts')
}
async function acctDropOnGroup(e, category) {
  e.preventDefault()
  if (!_dragId) return
  const acct = state.accounts.find(a => a.id === _dragId)
  if (!acct || acct.category === category) return
  try {
    await DB.updateAccount(_dragId, { category })
    showToast(`Dipindah ke ${category}`)
    navigate('accounts')
  } catch(err) { showToast('Gagal memindah: ' + err.message, 'error') }
}

// ── Drag & drop groups ────────────────────────────────────────────────
function grpDragStart(e, cat) {
  // Only allow drag if started from header (not from card)
  if (e.target.closest('.account-card')) return
  _dragGroup = cat
  _dragId = null
  e.currentTarget.classList.add('grp-dragging')
  e.dataTransfer.effectAllowed = 'move'
}
function grpDragEnd(e) {
  e.currentTarget.classList.remove('grp-dragging')
  document.querySelectorAll('.acct-group').forEach(g => g.classList.remove('grp-drag-over'))
  _dragGroup = null
}
function grpDragOver(e, cat) {
  if (!_dragGroup) return
  e.preventDefault()
  if (cat === _dragGroup) return
  document.querySelectorAll('.acct-group').forEach(g => g.classList.remove('grp-drag-over'))
  e.currentTarget.classList.add('grp-drag-over')
}
function grpDrop(e, targetCat) {
  e.preventDefault()
  e.stopPropagation()
  if (!_dragGroup || _dragGroup === targetCat) return

  const catGroups = {}
  state.accounts.forEach(a => { catGroups[a.category || 'Lainnya'] = true })
  const allCats = Object.keys(catGroups)
  const order = getSortedGroups(allCats)
  const fromI = order.indexOf(_dragGroup), toI = order.indexOf(targetCat)
  if (fromI === -1 || toI === -1) return
  order.splice(fromI, 1)
  order.splice(toI, 0, _dragGroup)
  saveGroupOrder(order)
  showToast('Urutan grup disimpan')
  navigate('accounts')
}

export { renderAccounts }

window.toggleHideTotal   = toggleHideTotal
window.toggleHideBalance = toggleHideBalance
window.toggleAcctGroup   = toggleAcctGroup
window.saveAcctNote      = saveAcctNote
window.acctDragStart     = acctDragStart
window.acctDragEnd       = acctDragEnd
window.acctDragOver      = acctDragOver
window.acctDrop          = acctDrop
window.acctDropOnGroup   = acctDropOnGroup
window.grpDragStart      = grpDragStart
window.grpDragEnd        = grpDragEnd
window.grpDragOver       = grpDragOver
window.grpDrop           = grpDrop
