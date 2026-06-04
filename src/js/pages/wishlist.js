// src/js/pages/wishlist.js
import { state, getAccount } from '../lib/store.js'
import { navigate } from '../lib/router.js'
import { showToast } from '../lib/toast.js'
import { fmt, fmtShort, fmtDate, toLocalDateString } from '../lib/utils.js'
import { BANK_ICONS } from '../lib/config.js'
import * as DB from '../lib/supabase.js'

// ── Filter state (in-memory) ─────────────────────────────────────────────
let _filter = 'all' // all | planning | bought | cancelled
let _sort   = 'priority' // priority | created | target

// ── Helpers ──────────────────────────────────────────────────────────────

const PRIORITY_LABEL = { 1: '🔥 Tinggi', 2: '⭐ Sedang', 3: '⬇️ Rendah' }
const PRIORITY_COLOR = { 1: 'var(--red)', 2: 'var(--accent)', 3: 'var(--text3)' }
const STATUS_LABEL   = { planning: 'Direncanakan', bought: 'Sudah Beli', cancelled: 'Dibatalkan' }

/**
 * Compute savings progress info for a wishlist item.
 * Returns { pct, daysLeft, dailyNeeded, remaining, status }
 */
export function computeSavingsInfo(item) {
  const price = Number(item.price) || 0
  const saved = Number(item.saved_amount) || 0
  const remaining = Math.max(0, price - saved)
  const pct = price > 0 ? Math.min(100, Math.round((saved / price) * 100)) : 0

  let daysLeft = null
  let dailyNeeded = null
  let status = 'no-target' // no-target | future | overdue | complete

  if (saved >= price && price > 0) {
    status = 'complete'
  } else if (item.target_date) {
    const today = new Date(); today.setHours(0,0,0,0)
    const target = new Date(item.target_date); target.setHours(0,0,0,0)
    const diff = Math.ceil((target - today) / 86400000)
    if (diff <= 0) {
      status = 'overdue'
      daysLeft = diff
      dailyNeeded = remaining
    } else {
      status = 'future'
      daysLeft = diff
      dailyNeeded = remaining / diff
    }
  }
  return { pct, daysLeft, dailyNeeded, remaining, status }
}

// ── Main page render ─────────────────────────────────────────────────────

export function renderWishlist(area, actions) {
  actions.innerHTML = `<button class="btn btn-accent btn-sm" onclick="openAddWishlist()">+ Wishlist</button>`

  const items = filterAndSortItems(state.wishlist || [])
  const planning = (state.wishlist || []).filter(w => w.status === 'planning')
  const totalNeeded = planning.reduce((s,w) => s + Number(w.price), 0)
  const totalSaved  = planning.reduce((s,w) => s + Number(w.saved_amount||0), 0)
  const overallPct  = totalNeeded > 0 ? Math.min(100, Math.round((totalSaved/totalNeeded)*100)) : 0

  // Aggregate daily savings needed (sum across items with target_date in future)
  let totalDailyNeeded = 0
  planning.forEach(w => {
    const info = computeSavingsInfo(w)
    if (info.status === 'future' || info.status === 'overdue') {
      totalDailyNeeded += Math.max(0, info.dailyNeeded || 0)
    }
  })

  area.innerHTML = `
    <div class="wishlist-summary mb-16">
      <div class="ws-card">
        <div class="ws-label">Total Wishlist (rencana)</div>
        <div class="ws-value">${fmtShort(totalNeeded)}</div>
        <div class="ws-sub">${planning.length} item</div>
      </div>
      <div class="ws-card">
        <div class="ws-label">Sudah Ditabung</div>
        <div class="ws-value" style="color:var(--green)">${fmtShort(totalSaved)}</div>
        <div class="ws-sub">${overallPct}% tercapai</div>
      </div>
      <div class="ws-card">
        <div class="ws-label">Nabung per Hari</div>
        <div class="ws-value" style="color:var(--accent)">${fmtShort(totalDailyNeeded)}</div>
        <div class="ws-sub">untuk semua target</div>
      </div>
    </div>

    <div class="wishlist-filters mb-12">
      <div class="filter-row">
        ${['all','planning','bought','cancelled'].map(f => `
          <div class="pill ${_filter===f?'active':''}" onclick="setWishlistFilter('${f}')">
            ${ {all:'Semua', planning:'Rencana', bought:'Sudah Beli', cancelled:'Dibatalkan'}[f] }
          </div>`).join('')}
      </div>
      <div class="sort-wrap">
        <select class="sort-select" id="ws-sort" onchange="setWishlistSort(this.value)">
          <option value="priority" ${_sort==='priority'?'selected':''}>Urutan: Prioritas</option>
          <option value="created"  ${_sort==='created'?'selected':''}>Urutan: Terbaru</option>
          <option value="target"   ${_sort==='target'?'selected':''}>Urutan: Target Tanggal</option>
        </select>
      </div>
    </div>

    <div class="wishlist-grid">
      ${items.length ? items.map(wishItemHtml).join('') : `
        <div class="empty-state" style="grid-column:1/-1">
          <div class="empty-icon">🎯</div>
          <p>Belum ada wishlist. Tambah barang yang kamu mau, target tanggalnya, dan aku bantu hitung berapa harus nabung tiap hari.</p>
          <button class="btn btn-accent btn-sm" style="margin-top:12px" onclick="openAddWishlist()">+ Tambah Wishlist Pertama</button>
        </div>`}
    </div>`
}

function filterAndSortItems(items) {
  let out = items.slice()
  if (_filter !== 'all') out = out.filter(w => w.status === _filter)
  out.sort((a,b) => {
    if (_sort === 'priority') {
      const pa = a.priority || 2, pb = b.priority || 2
      if (pa !== pb) return pa - pb
      return new Date(b.created_at||0) - new Date(a.created_at||0)
    }
    if (_sort === 'target') {
      const ta = a.target_date ? new Date(a.target_date).getTime() : Infinity
      const tb = b.target_date ? new Date(b.target_date).getTime() : Infinity
      return ta - tb
    }
    // created (default desc)
    return new Date(b.created_at||0) - new Date(a.created_at||0)
  })
  return out
}

function wishItemHtml(w) {
  const info = computeSavingsInfo(w)
  const pr = w.priority || 2
  const acct = w.linked_account_id ? getAccount(w.linked_account_id) : null
  const isPlanning = w.status === 'planning'
  const isBought   = w.status === 'bought'

  // Daily savings line
  let dailyLine = ''
  if (isPlanning) {
    if (info.status === 'complete') {
      dailyLine = `<div class="ws-daily complete">🎉 Saldo sudah cukup — siap dibeli!</div>`
    } else if (info.status === 'future') {
      dailyLine = `<div class="ws-daily">💰 Nabung <strong>${fmtShort(info.dailyNeeded)}/hari</strong> · ${info.daysLeft} hari lagi</div>`
    } else if (info.status === 'overdue') {
      dailyLine = `<div class="ws-daily overdue">⚠️ Target sudah lewat ${Math.abs(info.daysLeft)} hari — kurang ${fmtShort(info.remaining)}</div>`
    } else {
      // no-target
      dailyLine = `<div class="ws-daily">Sisa <strong>${fmtShort(info.remaining)}</strong> dari ${fmtShort(w.price)}</div>`
    }
  } else if (isBought) {
    dailyLine = `<div class="ws-daily complete">✓ Dibeli pada ${fmtDate(w.bought_at || w.created_at)} · ${fmt(w.bought_amount || w.price)}</div>`
  } else {
    dailyLine = `<div class="ws-daily" style="opacity:.6">Dibatalkan</div>`
  }

  // Progress bar
  const progressBar = isPlanning ? `
    <div class="ws-progress">
      <div class="ws-progress-bar" style="width:${info.pct}%"></div>
    </div>
    <div class="ws-progress-text">${fmtShort(Number(w.saved_amount)||0)} / ${fmtShort(w.price)} (${info.pct}%)</div>
  ` : ''

  // Action buttons
  let actionsHtml = ''
  if (isPlanning) {
    actionsHtml = `
      <button class="btn btn-ghost btn-sm" onclick="openSaveToWishlist('${w.id}')" title="Tambah tabungan">💰 Tabung</button>
      <button class="btn btn-accent btn-sm" onclick="openMarkBoughtWishlist('${w.id}')" title="Tandai sudah beli">✓ Beli</button>
      <button class="btn btn-ghost btn-sm icon-only" onclick="openEditWishlist('${w.id}')" title="Edit">✏️</button>
      <button class="btn btn-ghost btn-sm icon-only" onclick="confirmDeleteWishlist('${w.id}')" title="Hapus">🗑️</button>
    `
  } else {
    actionsHtml = `
      <button class="btn btn-ghost btn-sm icon-only" onclick="openEditWishlist('${w.id}')" title="Edit">✏️</button>
      <button class="btn btn-ghost btn-sm icon-only" onclick="confirmDeleteWishlist('${w.id}')" title="Hapus">🗑️</button>
    `
  }

  return `
    <div class="ws-item ${w.status}">
      <div class="ws-item-head">
        <div class="ws-item-title">${escapeHtml(w.name)}</div>
        <div class="ws-priority" style="color:${PRIORITY_COLOR[pr]}">${PRIORITY_LABEL[pr]}</div>
      </div>
      <div class="ws-item-price">${fmt(w.price)}</div>
      ${w.note ? `<div class="ws-item-note">${escapeHtml(w.note)}</div>` : ''}
      ${w.url ? `<div class="ws-item-link"><a href="${escapeAttr(w.url)}" target="_blank" rel="noopener">🔗 Lihat link produk</a></div>` : ''}
      ${w.target_date && isPlanning ? `<div class="ws-item-target">📅 Target: ${fmtDate(w.target_date)}</div>` : ''}
      ${acct ? `<div class="ws-item-target">${BANK_ICONS[acct.bank]||'💳'} Dari ${acct.name}</div>` : ''}
      ${progressBar}
      ${dailyLine}
      <div class="ws-item-actions">${actionsHtml}</div>
    </div>`
}

function escapeHtml(s) {
  return String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;')
}
function escapeAttr(s) { return escapeHtml(s) }

// ── Filter / Sort controls ───────────────────────────────────────────────

function setWishlistFilter(f) { _filter = f; navigate('wishlist') }
function setWishlistSort(s)   { _sort = s; navigate('wishlist') }

// ── Delete (with confirm) ────────────────────────────────────────────────

function confirmDeleteWishlist(id) {
  const w = state.wishlist.find(x => x.id === id)
  if (!w) return
  if (typeof window.showConfirm === 'function') {
    window.showConfirm('🗑️', 'Hapus dari Wishlist', `Hapus "${w.name}" dari wishlist?`, 'Hapus', 'btn-danger', async () => {
      try {
        await DB.deleteWishlist(id)
        showToast('Wishlist dihapus ✓')
        navigate('wishlist')
      } catch(e) {
        showToast('Gagal: ' + e.message, 'error')
      }
    })
  } else if (confirm('Hapus wishlist ini?')) {
    DB.deleteWishlist(id).then(() => { showToast('Dihapus'); navigate('wishlist') })
  }
}

// ── Expose to window for onclick handlers ───────────────────────────────

window.setWishlistFilter = setWishlistFilter
window.setWishlistSort = setWishlistSort
window.confirmDeleteWishlist = confirmDeleteWishlist
