// src/js/pages/accounts.js
import { state }        from '../lib/store.js'
import { showToast }    from '../lib/toast.js'
import { navigate }     from '../lib/router.js'
import { fmt, fmtShort } from '../lib/utils.js'
import * as DB          from '../lib/supabase.js'

// ── Persistent prefs (localStorage) ──────────────────────────────────
const PREFS_KEY   = 'acct_prefs_v1'
const ORDER_KEY   = 'acct_order_v1'

function getPrefs() {
  try { return JSON.parse(localStorage.getItem(PREFS_KEY) || '{}') } catch { return {} }
}
function savePrefs(p) { localStorage.setItem(PREFS_KEY, JSON.stringify(p)) }
function getOrder() {
  try { return JSON.parse(localStorage.getItem(ORDER_KEY) || '[]') } catch { return [] }
}
function saveOrder(o) { localStorage.setItem(ORDER_KEY, JSON.stringify(o)) }

// ── Sort accounts by saved order ──────────────────────────────────────
function getSortedAccounts() {
  const order = getOrder()
  const accts  = [...state.accounts]
  if (!order.length) return accts
  return accts.sort((a, b) => {
    const ai = order.indexOf(a.id)
    const bi = order.indexOf(b.id)
    if (ai === -1 && bi === -1) return 0
    if (ai === -1) return 1
    if (bi === -1) return -1
    return ai - bi
  })
}

// ── Drag state ────────────────────────────────────────────────────────
let _dragId   = null
let _dragOver = null

// ── Render ────────────────────────────────────────────────────────────
function renderAccounts(area, actions) {
  const prefs = getPrefs()
  actions.innerHTML = `<button class="btn btn-accent btn-sm" onclick="openAddAccount()">+ Rekening</button>`

  const sorted = getSortedAccounts()
  const total  = sorted.reduce((s, a) => s + Number(a.balance), 0)

  // Group by category (preserve order of first appearance)
  const catOrder  = []
  const catGroups = {}
  sorted.forEach(a => {
    const cat = a.category || 'Lainnya'
    if (!catGroups[cat]) { catGroups[cat] = []; catOrder.push(cat) }
    catGroups[cat].push(a)
  })

  area.innerHTML = `
    <!-- Total hero -->
    <div class="card mb-16" style="background:linear-gradient(135deg,var(--bg3),var(--bg2))">
      <div class="stat-label">Total Saldo</div>
      <div style="font-size:30px;font-weight:800;color:var(--accent);margin:4px 0">${fmt(total)}</div>
      <div style="display:flex;gap:12px;flex-wrap:wrap;margin-top:8px">
        ${catOrder.map(cat => {
          const catTotal = catGroups[cat].reduce((s,a) => s+Number(a.balance), 0)
          return `<div style="font-size:12px;color:var(--text2)">📂 ${cat}: <span style="font-weight:600;color:var(--text)">${fmtShort(catTotal)}</span></div>`
        }).join('')}
      </div>
    </div>

    <!-- Groups -->
    ${catOrder.map(cat => {
      const accs     = catGroups[cat]
      const hidden   = prefs[`hide_${cat}`]
      const catTotal = accs.reduce((s,a) => s+Number(a.balance), 0)
      return `
        <div class="acct-group" id="grp-${cat.replace(/\s/g,'_')}">
          <div class="acct-group-header" onclick="toggleAcctGroup('${cat}')">
            <div style="display:flex;align-items:center;gap:8px">
              <span style="font-size:15px;font-weight:700">${cat}</span>
              <span style="font-size:12px;color:var(--text2)">${fmtShort(catTotal)}</span>
              <span style="font-size:11px;color:var(--text3)">(${accs.length})</span>
            </div>
            <span class="acct-group-chevron ${hidden?'':'open'}">▾</span>
          </div>
          <div class="acct-group-body ${hidden?'hidden':''}">
            <div class="grid-2 mb-8" id="grid-${cat.replace(/\s/g,'_')}">
              ${accs.map(a => renderAccountCard(a, prefs)).join('')}
            </div>
          </div>
        </div>`
    }).join('')}

    ${!state.accounts.length ? `<div class="empty-state"><div class="empty-icon">💳</div><p>Belum ada rekening.</p></div>` : ''}
  `

  // Attach drag events after render
  initDragDrop()
}

function renderAccountCard(a, prefs) {
  const txCount  = state.transactions.filter(t => t.account_id===a.id || t.to_account_id===a.id).length
  const accColor = a.color || 'var(--accent)'
  const note     = prefs[`note_${a.id}`] || ''
  const noteId   = `note-${a.id}`

  return `<div class="account-card acct-draggable"
    data-id="${a.id}"
    draggable="true"
    style="border-top:3px solid ${accColor};position:relative;user-select:none"
    ondragstart="acctDragStart(event,'${a.id}')"
    ondragend="acctDragEnd(event)"
    ondragover="acctDragOver(event,'${a.id}')"
    ondrop="acctDrop(event,'${a.id}')">

    <!-- Drag handle -->
    <div class="acct-drag-handle" title="Drag untuk atur urutan" onclick="event.stopPropagation()">⠿</div>

    <!-- Hide button -->
    <div class="acct-hide-btn" onclick="event.stopPropagation();toggleAcctCard('${a.id}')" title="Sembunyikan">
      ${prefs[`hide_card_${a.id}`] ? '👁‍🗨' : '👁'}
    </div>

    <!-- Card content (clickable to edit) -->
    <div onclick="openEditAccount('${a.id}')">
      <div class="account-bank">${a.icon||'🏦'} ${a.bank}</div>
      <div class="account-name">${a.name}</div>
      <div class="account-balance" style="color:${accColor}">${fmt(a.balance)}</div>
      <div style="margin-top:6px;display:flex;gap:5px;flex-wrap:wrap">
        ${a.acct_type ? `<span style="font-size:10px;font-weight:600;background:var(--bg4);color:var(--text3);padding:2px 6px;border-radius:6px">${a.acct_type}</span>` : ''}
        <span style="font-size:10px;color:var(--text3)">${txCount} transaksi</span>
      </div>
    </div>

    <!-- Notes -->
    <div class="acct-note-wrap" onclick="event.stopPropagation()">
      <textarea
        id="${noteId}"
        class="acct-note-input"
        placeholder="Tambah catatan..."
        rows="2"
        oninput="saveAcctNote('${a.id}',this.value)"
      >${note}</textarea>
    </div>
  </div>`
}

// ── Show/hide group ───────────────────────────────────────────────────
function toggleAcctGroup(cat) {
  const prefs  = getPrefs()
  const key    = `hide_${cat}`
  prefs[key]   = !prefs[key]
  savePrefs(prefs)

  const grpId  = `grp-${cat.replace(/\s/g,'_')}`
  const body   = document.querySelector(`#${grpId} .acct-group-body`)
  const chev   = document.querySelector(`#${grpId} .acct-group-chevron`)
  if (body) body.classList.toggle('hidden', prefs[key])
  if (chev) chev.classList.toggle('open', !prefs[key])
}

// ── Show/hide individual card ─────────────────────────────────────────
function toggleAcctCard(id) {
  const prefs = getPrefs()
  const key   = `hide_card_${id}`
  prefs[key]  = !prefs[key]
  savePrefs(prefs)

  const card = document.querySelector(`[data-id="${id}"]`)
  if (card) {
    card.style.opacity = prefs[key] ? '0.35' : '1'
    const btn = card.querySelector('.acct-hide-btn')
    if (btn) btn.textContent = prefs[key] ? '👁‍🗨' : '👁'
  }
}

// ── Notes ─────────────────────────────────────────────────────────────
function saveAcctNote(id, value) {
  const prefs    = getPrefs()
  prefs[`note_${id}`] = value
  savePrefs(prefs)
}

// ── Drag & drop ───────────────────────────────────────────────────────
function initDragDrop() {
  const prefs = getPrefs()
  // Apply hidden state to cards
  document.querySelectorAll('.acct-draggable').forEach(card => {
    const id = card.dataset.id
    if (prefs[`hide_card_${id}`]) card.style.opacity = '0.35'
  })
}

function acctDragStart(e, id) {
  _dragId = id
  e.currentTarget.classList.add('dragging')
  e.dataTransfer.effectAllowed = 'move'
}

function acctDragEnd(e) {
  e.currentTarget.classList.remove('dragging')
  document.querySelectorAll('.acct-draggable').forEach(c => c.classList.remove('drag-over'))
  _dragId   = null
  _dragOver = null
}

function acctDragOver(e, id) {
  e.preventDefault()
  if (id === _dragId) return
  _dragOver = id
  document.querySelectorAll('.acct-draggable').forEach(c => c.classList.remove('drag-over'))
  e.currentTarget.classList.add('drag-over')
}

function acctDrop(e, targetId) {
  e.preventDefault()
  if (!_dragId || _dragId === targetId) return

  const sorted = getSortedAccounts()
  const ids    = sorted.map(a => a.id)
  const fromI  = ids.indexOf(_dragId)
  const toI    = ids.indexOf(targetId)
  if (fromI === -1 || toI === -1) return

  ids.splice(fromI, 1)
  ids.splice(toI, 0, _dragId)
  saveOrder(ids)
  showToast('Urutan disimpan')
  navigate('accounts')
}

export { renderAccounts }

// Expose to window
window.toggleAcctGroup = toggleAcctGroup
window.toggleAcctCard  = toggleAcctCard
window.saveAcctNote    = saveAcctNote
window.acctDragStart   = acctDragStart
window.acctDragEnd     = acctDragEnd
window.acctDragOver    = acctDragOver
window.acctDrop        = acctDrop
