import { Chart, registerables } from 'chart.js'
Chart.register(...registerables)
// src/js/app.js
// ── Main entry point ─────────────────────────────────────────────────
import '../css/main.css'

import { state }           from './lib/store.js'
import { db, getSession, signIn, signUp, signOut, loadAllData } from './lib/supabase.js'
import { navigate, registerPage } from './lib/router.js'
import { showToast }       from './lib/toast.js'
import { applyTheme, initTheme, toggleTheme } from './ui/theme.js'
import { renderAppShell }  from './ui/shell.js'
import { initCamera }      from './ui/camera.js'
import { initModals }      from './ui/modals.js'

// Pages
import { renderDashboard }    from './pages/dashboard.js'
import { renderAccounts }     from './pages/accounts.js'
import { renderAccountDetail } from './pages/accountDetail.js'
import { renderTransactions } from './pages/transactions.js'
import { renderTransfer }     from './pages/transfer.js'
import { renderBudget }       from './pages/budget.js'
import { renderRecurring }    from './pages/recurring.js'
import { renderDebts }        from './pages/debts.js'
import { renderScan }         from './pages/scan.js'
import { renderSplitBill }    from './pages/splitbill.js'
import { renderBills }        from './pages/bills.js'
import { renderAdvisor }      from './pages/advisor.js'
import { renderCategoryManager } from './pages/categoryPage.js'
import { renderNotifSettings,initNotifScheduler } from './pages/notifications.js'
import { renderReports }      from './pages/reports.js'
import { renderSettings }     from './pages/settings.js'

// ── Register all pages ─────────────────────────────────────────────────
registerPage('dashboard',    renderDashboard)
registerPage('accounts',     renderAccounts)
registerPage('accountDetail', renderAccountDetail)
registerPage('transactions', renderTransactions)
registerPage('transfer',     renderTransfer)
registerPage('budget',       renderBudget)
registerPage('recurring',    renderRecurring)
registerPage('debts',        renderDebts)
registerPage('scan',         renderScan)
registerPage('splitbill',    renderSplitBill)
registerPage('bills',        renderBills)
registerPage('advisor',      renderAdvisor)
registerPage('categories',   renderCategoryManager)
registerPage('notifSettings',renderNotifSettings)
registerPage('reports',      renderReports)
registerPage('settings',     renderSettings)

// Expose navigate globally (used in inline onclick handlers)
window.navigate = navigate
window.showToast = showToast
window.toggleTheme = toggleTheme

// ── Boot sequence ──────────────────────────────────────────────────────
async function boot() {
  // Apply saved theme immediately (before render to avoid flash)
  initTheme()

  try {
    const { data: { session } } = await getSession()

    if (session) {
      state.currentUser = session.user
      await loadAllData()
      showApp()
    } else {
      hideLoading()
      showAuth()
    }
  } catch (err) {
    console.error('Boot error:', err)
    hideLoading()
    showAuth()
  }

  // Failsafe: if loading screen still showing after 10s
  setTimeout(() => {
    const loading = document.getElementById('loading')
    if (loading && getComputedStyle(loading).display !== 'none') {
      hideLoading()
      showAuth()
    }
  }, 4000)
}

function hideLoading() {
  const el = document.getElementById('loading')
  if (el) el.style.display = 'none'
}

function showApp() {
  hideLoading()
  document.getElementById('auth-screen').style.display = 'none'

  renderAppShell()
  initCamera()
  initModals()

  const meta = state.currentUser.user_metadata || {}
  const nameEl = document.getElementById('sidebar-name')
  const emailEl = document.getElementById('sidebar-email')
  if (nameEl) nameEl.textContent = meta.full_name || 'Pengguna'
  if (emailEl) emailEl.textContent = state.currentUser.email

  applyTheme(localStorage.getItem('theme') || 'dark')
  initNotifScheduler()
  navigate('dashboard')
}

function showAuth() {
  const el = document.getElementById('auth-screen')
  if (!el) return
  renderAuthScreen(el)
  el.style.display = 'flex'
}

// ── Auth screen ────────────────────────────────────────────────────────
let _authMode = 'login'

function renderAuthScreen(container) {
  container.innerHTML = `
    <div class="auth-card">
      <div class="auth-logo">
        <div class="logo-mark">D</div>
        <div class="logo-text">duit<span>.io</span></div>
      </div>
      <div class="auth-tab-row">
        <div class="auth-tab active" id="tab-login" onclick="switchAuthTab('login')">Masuk</div>
        <div class="auth-tab" id="tab-register" onclick="switchAuthTab('register')">Daftar</div>
      </div>
      <p class="auth-subtitle" id="auth-subtitle">Masuk ke akun duit.io Anda</p>
      <div class="form-group">
        <label class="form-label">Email</label>
        <input class="form-input" type="email" id="auth-email" placeholder="nama@email.com"/>
      </div>
      <div class="form-group">
        <label class="form-label">Password</label>
        <input class="form-input" type="password" id="auth-password" placeholder="••••••••"
          onkeydown="if(event.key==='Enter')window._doAuth()"/>
      </div>
      <div class="form-group hidden" id="name-field">
        <label class="form-label">Nama Lengkap</label>
        <input class="form-input" type="text" id="auth-name" placeholder="Nama Anda"/>
      </div>
      <button class="btn-primary" id="auth-btn" onclick="window._doAuth()">Masuk</button>
      <div style="text-align:center;margin-top:8px"><a href="#" class="forgot-password-link" onclick="event.preventDefault();window._forgotPassword()" style="font-size:12px;color:var(--accent);text-decoration:none">Lupa password?</a></div>
      <div class="auth-err" id="auth-err"></div>
    </div>`

  window.switchAuthTab = (mode) => {
    _authMode = mode
    document.getElementById('tab-login').classList.toggle('active', mode === 'login')
    document.getElementById('tab-register').classList.toggle('active', mode === 'register')
    document.getElementById('auth-subtitle').textContent =
      mode === 'login' ? 'Masuk ke akun duit.io Anda' : 'Buat akun baru gratis'
    document.getElementById('auth-btn').textContent = mode === 'login' ? 'Masuk' : 'Daftar'
    document.getElementById('name-field').classList.toggle('hidden', mode === 'login')
    document.getElementById('auth-err').style.display = 'none'
  }

  window._doAuth = async () => {
    const email = document.getElementById('auth-email').value.trim()
    const pass  = document.getElementById('auth-password').value
    const btn   = document.getElementById('auth-btn')
    const err   = document.getElementById('auth-err')
    if (!email || !pass) { err.textContent = 'Email dan password wajib diisi'; err.style.display = 'block'; return }

    btn.disabled = true
    btn.innerHTML = `<span class="btn-spinner"></span>${_authMode === 'login' ? 'Masuk...' : 'Mendaftar...'}`
    err.style.display = 'none'

    try {
      let result
      if (_authMode === 'login') {
        result = await signIn(email, pass)
      } else {
        const name = document.getElementById('auth-name')?.value.trim() || ''
        result = await signUp(email, pass, name)
      }
      if (result.error) throw result.error

      const user = result.data.session?.user || result.data.user
      if (!user?.id) {
        // Email confirmation required
        err.style.cssText = 'display:block;background:rgba(240,185,88,0.12);border-color:rgba(240,185,88,0.3);color:#f0b958'
        err.innerHTML = '📧 Cek inbox email kamu — klik link konfirmasi dari Supabase, lalu <strong>Masuk</strong>.'
        btn.disabled = false
        btn.textContent = 'Daftar'
        return
      }

      state.currentUser = user
      await loadAllData()
      showApp()
    } catch (e) {
      err.textContent = e.message || 'Terjadi kesalahan'
      err.style.cssText = 'display:block'
      btn.disabled = false
      btn.textContent = _authMode === 'login' ? 'Masuk' : 'Daftar'
    }
  }
}


window._forgotPassword = async () => {
  const email = document.getElementById('auth-email').value.trim()
  if (!email) { alert('Masukkan email kamu dulu di field Email'); return }
  if (!confirm(`Kirim link reset password ke ${email}?`)) return
  try {
    const { data: { session } } = await getSession()
    const supabase = state.supabase || db
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: window.location.origin,
    })
    if (error) throw error
    alert('Email reset password sudah dikirim. Cek inbox kamu.')
  } catch (e) {
    alert('Gagal: ' + e.message)
  }
}

// Expose logout globally
window.logout = async () => {
  await signOut()
  location.reload()
}

// ── Start ──────────────────────────────────────────────────────────────
boot()
