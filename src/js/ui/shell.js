// src/js/ui/shell.js
// Renders the main app shell (sidebar, topbar, mobile nav)
import { navigate } from '../lib/router.js'
import { t } from '../lib/i18n.js'

export function renderAppShell() {
  document.getElementById('app').classList.add('visible')
  document.getElementById('app').innerHTML = getShellHTML()
}

function getShellHTML() {
  return `
  <aside class="sidebar">
    <div class="sidebar-header">
      <div class="sidebar-logo">
        <div class="logo-mark"><img src="/icon.svg" alt="duit.io" width="32" height="32"/></div>
        <div class="logo-text">duit<span>.io</span></div>
      </div>
    </div>
    <div class="sidebar-user">
      <div id="sidebar-name" style="font-size:12px;font-weight:600;margin-bottom:2px">Pengguna</div>
      <div class="sidebar-user-email" id="sidebar-email"></div>
    </div>
    <nav class="sidebar-nav">
      <div class="nav-section">
        <div class="nav-item" data-page="dashboard" onclick="navigate('dashboard')"><span class="nav-icon">📊</span> ${t('nav.dashboard')}</div>
        <div class="nav-item" data-page="accounts" onclick="navigate('accounts')"><span class="nav-icon">💳</span> ${t('nav.accounts')}</div>
        <div class="nav-item" data-page="transactions" onclick="navigate('transactions')"><span class="nav-icon">📋</span> ${t('nav.transactions')}</div>
        <div class="nav-item" data-page="transfer" onclick="navigate('transfer')"><span class="nav-icon">↔️</span> ${t('nav.transfer')}</div>
      </div>
      <div class="nav-section">
        <div class="nav-section-label">${t('nav.section.manage')}</div>
        <div class="nav-item" data-page="budget" onclick="navigate('budget')"><span class="nav-icon">🎯</span> ${t('nav.budget')}</div>
        <div class="nav-item" data-page="categories" onclick="navigate('categories')"><span class="nav-icon">🏷️</span> ${t('nav.categories')}</div>
        <div class="nav-item" data-page="recurring" onclick="navigate('recurring')"><span class="nav-icon">🔄</span> ${t('nav.recurring')}</div>
        <div class="nav-item" data-page="debts" onclick="navigate('debts')"><span class="nav-icon">🤝</span> ${t('nav.debts')}</div>
        <div class="nav-item" data-page="wishlist" onclick="navigate('wishlist')"><span class="nav-icon">🎁</span> ${t('nav.wishlist')}</div>
      </div>
      <div class="nav-section">
        <div class="nav-section-label">${t('nav.section.tools')}</div>
        <div class="nav-item" data-page="scan" onclick="navigate('scan')"><span class="nav-icon">📷</span> ${t('nav.scan')}</div>
        <div class="nav-item" data-page="splitbill" onclick="navigate('splitbill')"><span class="nav-icon">🍽️</span> ${t('nav.splitbill')}</div>
        <div class="nav-item" data-page="bills" onclick="navigate('bills')"><span class="nav-icon">🧾</span> ${t('nav.bills')}</div>
        <div class="nav-item" data-page="advisor" onclick="navigate('advisor')"><span class="nav-icon">🤖</span> ${t('nav.advisor')}</div>
        <div class="nav-item" data-page="reports" onclick="navigate('reports')"><span class="nav-icon">📈</span> ${t('nav.reports')}</div>
        <div class="nav-item" data-page="settings" onclick="navigate('settings')"><span class="nav-icon">⚙️</span> ${t('nav.settings')}</div>
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
      <div class="mobile-nav-item" data-page="dashboard" onclick="navigate('dashboard')"><span class="mnav-icon">📊</span>${t('nav.beranda')}</div>
      <div class="mobile-nav-item" data-page="transactions" onclick="navigate('transactions')"><span class="mnav-icon">📝</span>${t('nav.transactions')}</div>
      <div class="mnav-fab-spacer"></div>
      <div class="mobile-nav-item" data-page="accounts" onclick="navigate('accounts')"><span class="mnav-icon">💳</span>${t('nav.accounts')}</div>
      <div class="mobile-nav-item" data-page="more" onclick="window.openMoreMenu && window.openMoreMenu()"><span class="mnav-icon">☰</span>${t('nav.more')}</div>
    </div>
  </nav>
  <div class="fab" id="fab-add" onclick="window.openAddTransaction()" aria-label="Tambah transaksi">
    <svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
  </div>`
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
    { page: 'scan',       icon: '📷', label: t('nav.scan') },
    { page: 'splitbill',  icon: '🍽️', label: t('nav.splitbill') },
    { page: 'bills',      icon: '🧾', label: t('nav.bills') },
    { page: 'budget',     icon: '🎯', label: t('nav.budget') },
    { page: 'recurring',  icon: '🔄', label: t('nav.recurring') },
    { page: 'debts',      icon: '🤝', label: t('nav.debts') },
    { page: 'wishlist',   icon: '🎁', label: t('nav.wishlist') },
    { page: 'advisor',    icon: '🤖', label: t('nav.advisor') },
    { page: 'reports',    icon: '📈', label: t('nav.reports') },
    { page: 'categories', icon: '🏷️', label: t('nav.categories') },
    { page: 'settings',   icon: '⚙️', label: t('nav.settings') },
  ]
  modal.innerHTML = `
    <div class="sheet">
      <div class="sheet-handle"></div>
      <div class="sheet-head">
        <div class="sheet-title">${t('nav.more_menu')}</div>
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
