// src/js/ui/shell.js
// Renders the main app shell (sidebar, topbar, mobile nav)
import { navigate } from '../lib/router.js'

export function renderAppShell() {
  document.getElementById('app').classList.add('visible')
  document.getElementById('app').innerHTML = getShellHTML()
}

function getShellHTML() {
  return `
  <aside class="sidebar">
    <div class="sidebar-header">
      <div class="sidebar-logo">
        <div class="logo-mark">D</div>
        <div class="logo-text">duit<span>.io</span></div>
      </div>
    </div>
    <div class="sidebar-user">
      <div id="sidebar-name" style="font-size:12px;font-weight:600;margin-bottom:2px">Pengguna</div>
      <div class="sidebar-user-email" id="sidebar-email"></div>
    </div>
    <nav class="sidebar-nav">
      <div class="nav-section">
        <div class="nav-item" data-page="dashboard" onclick="navigate('dashboard')"><span class="nav-icon">📊</span> Dashboard</div>
        <div class="nav-item" data-page="accounts" onclick="navigate('accounts')"><span class="nav-icon">💳</span> Rekening</div>
        <div class="nav-item" data-page="transactions" onclick="navigate('transactions')"><span class="nav-icon">📋</span> Transaksi</div>
        <div class="nav-item" data-page="transfer" onclick="navigate('transfer')"><span class="nav-icon">↔️</span> Transfer</div>
      </div>
      <div class="nav-section">
        <div class="nav-section-label">Kelola</div>
        <div class="nav-item" data-page="budget" onclick="navigate('budget')"><span class="nav-icon">🎯</span> Anggaran</div>
        <div class="nav-item" data-page="recurring" onclick="navigate('recurring')"><span class="nav-icon">🔄</span> Rutin</div>
        <div class="nav-item" data-page="debts" onclick="navigate('debts')"><span class="nav-icon">🤝</span> Hutang/Piutang</div>
        <div class="nav-item" data-page="wishlist" onclick="navigate('wishlist')"><span class="nav-icon">🎁</span> Wishlist</div>
      </div>
      <div class="nav-section">
        <div class="nav-section-label">Tools</div>
        <div class="nav-item" data-page="scan" onclick="navigate('scan')"><span class="nav-icon">📷</span> Scan Struk</div>
        <div class="nav-item" data-page="splitbill" onclick="navigate('splitbill')"><span class="nav-icon">🍽️</span> Split Bill</div>
        <div class="nav-item" data-page="bills" onclick="navigate('bills')"><span class="nav-icon">🧾</span> Tagihan</div>
        <div class="nav-item" data-page="advisor" onclick="navigate('advisor')"><span class="nav-icon">🤖</span> AI Advisor</div>
        <div class="nav-item" data-page="reports" onclick="navigate('reports')"><span class="nav-icon">📈</span> Laporan</div>
        <div class="nav-item" data-page="settings" onclick="navigate('settings')"><span class="nav-icon">⚙️</span> Pengaturan</div>
      </div>
    </nav>
<div class="sidebar-footer"></div>
  </aside>

  <main class="main">
    <div class="topbar">
      <div class="topbar-title" id="page-title">Dashboard</div>
      <div class="topbar-actions" id="topbar-actions"></div>
    </div>
    <div class="content-area" id="content-area"></div>
  </main>

  <nav class="mobile-nav">
    <div class="mobile-nav-inner">
      <div class="mobile-nav-item" data-page="dashboard" onclick="navigate('dashboard')"><span class="mnav-icon">📊</span>Beranda</div>
      <div class="mobile-nav-item" data-page="transactions" onclick="navigate('transactions')"><span class="mnav-icon">📝</span>Transaksi</div>
      <div class="mnav-fab-spacer"></div>
      <div class="mobile-nav-item" data-page="accounts" onclick="navigate('accounts')"><span class="mnav-icon">💳</span>Rekening</div>
      <div class="mobile-nav-item" data-page="more" onclick="window.openMoreMenu && window.openMoreMenu()"><span class="mnav-icon">☰</span>Lainnya</div>
    </div>
  </nav>
  <div class="fab" id="fab-add" onclick="window.openAddTransaction()">+</div>`
}

// ── "Lainnya" (More) bottom sheet for mobile ──────────────────────────
export function openMoreMenu() {
  let modal = document.getElementById('more-menu-modal')
  if (!modal) {
    modal = document.createElement('div')
    modal.id = 'more-menu-modal'
    modal.className = 'sheet-overlay'
    document.body.appendChild(modal)
  }
  const items = [
    { page: 'scan',       icon: '📷', label: 'Scan Struk' },
    { page: 'splitbill',  icon: '🍽️', label: 'Split Bill' },
    { page: 'bills',      icon: '🧾', label: 'Tagihan' },
    { page: 'budget',     icon: '🎯', label: 'Anggaran' },
    { page: 'recurring',  icon: '🔄', label: 'Rutin' },
    { page: 'debts',      icon: '🤝', label: 'Hutang/Piutang' },
    { page: 'wishlist',   icon: '🎁', label: 'Wishlist' },
    { page: 'advisor',    icon: '🤖', label: 'AI Advisor' },
    { page: 'reports',    icon: '📈', label: 'Laporan' },
    { page: 'categories', icon: '🏷️', label: 'Kategori' },
    { page: 'settings',   icon: '⚙️', label: 'Pengaturan' },
  ]
  modal.innerHTML = `
    <div class="sheet">
      <div class="sheet-handle"></div>
      <div class="sheet-head">
        <div class="sheet-title">Menu Lainnya</div>
        <button class="sheet-close" onclick="closeMoreMenu()">✕</button>
      </div>
      <div class="sheet-body">
        <div class="more-grid">
          ${items.map(it => `
            <div class="more-item" onclick="closeMoreMenu();navigate('${it.page}')">
              <div class="more-item-icon">${it.icon}</div>
              <div class="more-item-label">${it.label}</div>
            </div>
          `).join('')}
        </div>
      </div>
    </div>
  `
  modal.classList.add('open')
}

export function closeMoreMenu() {
  document.getElementById('more-menu-modal')?.classList.remove('open')
}

window.openMoreMenu = openMoreMenu
window.closeMoreMenu = closeMoreMenu
