// src/js/pages/accounts.js
import { state }        from '../lib/store.js'
import { showToast }    from '../lib/toast.js'
import { navigate }     from '../lib/router.js'
import { fmt, fmtShort } from '../lib/utils.js'
import * as DB          from '../lib/supabase.js'

// ── Persistent prefs (localStorage) ──────────────────────────────────
const PREFS_KEY = 'acct_prefs_v1'
const ORDER_KEY = 'acct_order_v1'

const getPrefs = () => { try { return JSON.parse(localStorage.getItem(PREFS_KEY)||'{}') } catch { return {} } }
const savePrefs = p => localStorage.setItem(PREFS_KEY, JSON.stringify(p))
const getOrder = () => { try { return JSON.parse(localStorage.getItem(ORDER_KEY)||'[]') } catch { return [] } }
const saveOrder = o => localStorage.setItem(ORDER_KEY, JSON.stringify(o))

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

let _dragId = null

function renderAccounts(area, actions) {
  const prefs = getPrefs()
  actions.innerHTML = `<button class="btn btn-accent btn-sm" onclick="window.openAddAccount && window.openAddAccount()">+ Rekening</button>`

  const sorted = getSortedAccounts()
  const total = sorted.reduce((s,a) => s + Number(a.balance), 0)
  const hideTotalBalance = prefs.hideTotal

  // Group by category
  const catOrder = []
  const catGroups = {}
  sorted.forEach(a => {
    const cat = a.category || 'Lainnya'
    if (!catGroups[cat]) { catGroups[cat] = []; catOrder.push(cat) }
    catGroups[cat].push(a)
  })

  area.innerHTML = `
    <!-- Total hero with hide toggle -->
    <div class="card mb-16" style="background:linear-gradient(135deg,var(--bg3),var(--bg2));position:relative">
      <div style="display:flex;justify-content:space-between;align-items:flex-start">
        <div>
          <div class="stat-label">Total Saldo</div>
          <div style="font-size:30px;font-weight:800;color:var(--accent);margin:4px 0">
            ${hideTotalBalance ? '••••••••' : fmt(total)}
          </div>
        </div>
        <button class="btn-icon" onclick="toggleHideTotal()" title="Sembunyikan saldo">
          ${hideTotalBalance ? '👁‍🗨' : '👁'}
        </button>
      </div>
      <div style="display:flex;gap:12px;flex-wrap:wrap;margin-top:8px">
        ${catOrder.map(cat => {
          const catTotal = catGroups[cat].reduce((s,a) => s+Number(a.balance), 0)
          return `<div style="font-size:12px;color:var(--text2)">📂 ${cat}: <span style="font-weight:600;color:var(--text)">${hideTotalBalance ? '•••' : fmtShort(catTotal)}</span></div>`
        }).join('')}
      </div>
    </div>

    <!-- Groups with collapse + drop zone -->
    ${catOrder.map(cat => {
      const accs = catGroups[cat]
      const collapsed = prefs[`collapse_${cat}`]
      const catTotal = accs.reduce((s,a) => s+Number(a.balance), 0)
      const safeId = cat.replace(/\s+/g,'_')
      return `
        <div class="acct-group" id="grp-${safeId}">
          <div class="acct-group-header" onclick="toggleAcctGroup('${cat}')">
            <div style="display:flex;align-items:center;gap:8px">
              <span style="font-size:15px;font-weight:700">${cat}</span>
              <span style="font-size:12px;color:var(--text2)">${hideTotalBalance ? '•••' : fmtShort(catTotal)}</span>
              <span style="font-size:11px;color:var(--text3)">(${accs.length})</span>
            </div>
            <span style="font-size:18px;color:var(--text3);transition:transform .2s;display:inline-block;transform:${collapsed?'rotate(-90deg)':'rotate(0)'}">▾</span>
          </div>
          <div class="acct-group-body" style="${collapsed?'display:none':''}">
            <div class="grid-2 mb-8" ondragover="event.preventDefault()" ondrop="acctDropOnGroup(event,'${cat}')">
              ${accs.map(a => renderAccountCard(a, prefs)).join('')}
            </div>
          </div>
        </div>`
    }).join('')}

    ${!state.accounts.length ? `<div class="empty-state"><div class="empty-icon">💳</div><p>Belum ada rekening.</p></div>` : ''}
  `
}

function renderAccountCard(a, prefs) {
  const txCount = state.transactions.filter(t => t.account_id===a.id || t.to_account_id===a.id).length
  const accColor = a.color || 'var(--accent)'
  const note = prefs[`note_${a.id}`] || ''
  const hideBalance = prefs[`hide_bal_${a.id}`]

  return `<div class="account-card acct-draggable"
    data-id="${a.id}"
    draggable="true"
    style="border-top:3px solid ${accColor};position:relative"
    ondragstart="acctDragStart(event,'${a.id}')"
    ondragend="acctDragEnd(event)"
    ondragover="acctDragOver(event,'${a.id}')"
    ondrop="acctDrop(event,'${a.id}')">

    <div style="position:absolute;top:8px;right:8px;display:flex;gap:4px;z-index:2">
      <button class="acct-icon-btn" onclick="event.stopPropagation();toggleHideBalance('${a.id}')" title="${hideBalance?'Tampilkan':'Sembunyikan'} saldo">
        ${hideBalance ? '👁‍🗨' : '👁'}
      </button>
    </div>

    <div style="cursor:pointer" onclick="window.openEditAccount && window.openEditAccount('${a.id}')">
      <div class="account-bank">${a.icon||'🏦'} ${a.bank}</div>
      <div class="account-name">${a.name}</div>
      <div class="account-balance" style="color:${accColor}">
        ${hideBalance ? '••••••' : fmt(a.balance)}
      </div>
      <div style="margin-top:6px;display:flex;gap:5px;flex-wrap:wrap">
        ${a.acct_type ? `<span style="font-size:10px;font-weight:600;background:var(--bg4);color:var(--text3);padding:2px 6px;border-radius:6px">${a.acct_type}</span>` : ''}
        <span style="font-size:10px;color:var(--text3)">${txCount} transaksi</span>
      </div>
    </div>

    <div class="acct-note-wrap" onclick="event.stopPropagation()">
      <textarea
        class="acct-note-input"
        placeholder="Tambah catatan..."
        rows="2"
        oninput="saveAcctNote('${a.id}',this.value)"
      >${note}</textarea>
    </div>
  </div>`
}

// ── Toggles ───────────────────────────────────────────────────────────
function toggleHideTotal() {
  const prefs = getPrefs()
  prefs.hideTotal = !prefs.hideTotal
  savePrefs(prefs)
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

function saveAcctNote(id, value) {
  const prefs = getPrefs()
  prefs[`note_${id}`] = value
  savePrefs(prefs)
}

// ── Drag & drop ───────────────────────────────────────────────────────
function acctDragStart(e, id) {
  _dragId = id
  e.currentTarget.classList.add('dragging')
  e.dataTransfer.effectAllowed = 'move'
  e.dataTransfer.setData('text/plain', id)
}

function acctDragEnd(e) {
  e.currentTarget.classList.remove('dragging')
  document.querySelectorAll('.acct-draggable').forEach(c => c.classList.remove('drag-over'))
  _dragId = null
}

function acctDragOver(e, id) {
  e.preventDefault()
  if (id === _dragId) return
  document.querySelectorAll('.acct-draggable').forEach(c => c.classList.remove('drag-over'))
  e.currentTarget.classList.add('drag-over')
}

function acctDrop(e, targetId) {
  e.preventDefault()
  e.stopPropagation()
  if (!_dragId || _dragId === targetId) return

  // Reorder within same group
  const sorted = getSortedAccounts()
  const ids = sorted.map(a => a.id)
  const fromI = ids.indexOf(_dragId)
  const toI = ids.indexOf(targetId)
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
  // Move account to new category
  try {
    await DB.updateAccount(_dragId, { category })
    showToast(`Dipindah ke ${category}`)
    navigate('accounts')
  } catch(err) {
    showToast('Gagal memindah: ' + err.message, 'error')
  }
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
