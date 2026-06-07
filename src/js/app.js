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
import { onLangChange, t } from './lib/i18n.js'
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
import { renderWishlist }     from './pages/wishlist.js'
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
registerPage('wishlist',     renderWishlist)
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

  // Register service worker for notifications (silently — log on failure only)
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('/sw.js').catch(err => console.warn('SW registration failed:', err))
  }

  initNotifScheduler()

  // Re-render shell + current page whenever language changes
  onLangChange(() => {
    renderAppShell()
    if (nameEl) document.getElementById('sidebar-name').textContent = meta.full_name || 'Pengguna'
    if (emailEl) document.getElementById('sidebar-email').textContent = state.currentUser.email
    applyTheme(localStorage.getItem('theme') || 'dark')
    navigate(state.currentPage || 'dashboard')
  })

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
        <div class="logo-mark"><img src="/icon.svg" alt="duit.io" width="36" height="36"/></div>
        <div class="logo-text">duit<span>.io</span></div>
      </div>
      <div class="auth-tab-row">
        <div class="auth-tab active" id="tab-login" onclick="switchAuthTab('login')">${t('auth.signin_action')}</div>
        <div class="auth-tab" id="tab-register" onclick="switchAuthTab('register')">${t('auth.signup_action')}</div>
      </div>
      <p class="auth-subtitle" id="auth-subtitle">${t('auth.signin_subtitle')}</p>
      <div class="form-group">
        <label class="form-label">${t('label.email')}</label>
        <input class="form-input" type="email" id="auth-email" placeholder="${t('auth.email_placeholder')}"/>
      </div>
      <div class="form-group">
        <label class="form-label">${t('label.password')}</label>
        <input class="form-input" type="password" id="auth-password" placeholder="${t('auth.password_placeholder')}"
          onkeydown="if(event.key==='Enter')window._doAuth()"/>
      </div>
      <div class="form-group hidden" id="name-field">
        <label class="form-label">${t('auth.full_name')}</label>
        <input class="form-input" type="text" id="auth-name" placeholder="${t('auth.name_placeholder')}"/>
      </div>
      <button class="btn-primary" id="auth-btn" onclick="window._doAuth()">${t('auth.signin_action')}</button>
      <div style="text-align:center;margin-top:8px"><a href="#" class="forgot-password-link" onclick="event.preventDefault();window._forgotPassword()" style="font-size:12px;color:var(--accent);text-decoration:none">${t('auth.forgot_pwd')}</a></div>
      <div class="auth-err" id="auth-err"></div>
    </div>`

  window.switchAuthTab = (mode) => {
    _authMode = mode
    document.getElementById('tab-login').classList.toggle('active', mode === 'login')
    document.getElementById('tab-register').classList.toggle('active', mode === 'register')
    document.getElementById('auth-subtitle').textContent =
      mode === 'login' ? t('auth.signin_subtitle') : t('auth.signup_subtitle')
    document.getElementById('auth-btn').textContent = mode === 'login' ? t('auth.signin_action') : t('auth.signup_action')
    document.getElementById('name-field').classList.toggle('hidden', mode === 'login')
    document.getElementById('auth-err').style.display = 'none'
  }

  window._doAuth = async () => {
    const email = document.getElementById('auth-email').value.trim()
    const pass  = document.getElementById('auth-password').value
    const btn   = document.getElementById('auth-btn')
    const err   = document.getElementById('auth-err')
    if (!email || !pass) { err.textContent = t('auth.err.required'); err.style.display = 'block'; return }

    btn.disabled = true
    btn.innerHTML = `<span class="btn-spinner"></span>${_authMode === 'login' ? t('auth.signin_loading') : t('auth.signup_loading')}`
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
        err.innerHTML = t('auth.confirm_email')
        btn.disabled = false
        btn.textContent = t('auth.signup_action')
        return
      }

      state.currentUser = user
      await loadAllData()
      showApp()
    } catch (e) {
      err.textContent = e.message || t('auth.err.generic')
      err.style.cssText = 'display:block'
      btn.disabled = false
      btn.textContent = _authMode === 'login' ? t('auth.signin_action') : t('auth.signup_action')
    }
  }
}


window._forgotPassword = async () => {
  const email = document.getElementById('auth-email').value.trim()
  if (!email) { alert(t('auth.forgot.need_email')); return }
  if (!confirm(t('auth.forgot.confirm', { email }))) return
  try {
    const { data: { session } } = await getSession()
    const supabase = state.supabase || db
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: window.location.origin,
    })
    if (error) throw error
    alert(t('auth.forgot.sent'))
  } catch (e) {
    alert(t('auth.forgot.fail', { error: e.message }))
  }
}

// Expose logout globally
window.logout = async () => {
  await signOut()
  location.reload()
}

// ── Start ──────────────────────────────────────────────────────────────
boot()
