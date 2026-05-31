// src/js/pages/settings.js
import { state }     from '../lib/store.js'
import { toLocalDateString } from '../lib/utils.js'
import { showToast } from '../lib/toast.js'
import { navigate }  from '../lib/router.js'
import { signOut, db } from '../lib/supabase.js'
import { CURRENCIES } from '../lib/config.js'

function renderSettings(area, actions) {
  actions.innerHTML = ''
  const user = state.currentUser
  const meta = user?.user_metadata || {}
  const hideTotal = localStorage.getItem('hide_total_balance') === '1'
  const theme = localStorage.getItem('theme') || 'dark'

  area.innerHTML = `
    <!-- Profile -->
    <div class="card mb-16">
      <div style="display:flex;align-items:center;gap:12px">
        <div style="width:54px;height:54px;border-radius:50%;background:var(--accent);display:flex;align-items:center;justify-content:center;font-size:22px;font-weight:700;color:#fff">
          ${(meta.full_name || user?.email || 'U').charAt(0).toUpperCase()}
        </div>
        <div style="flex:1">
          <div style="font-size:15px;font-weight:700">${meta.full_name || 'Pengguna'}</div>
          <div style="font-size:12px;color:var(--text2)">${user?.email || ''}</div>
        </div>
      </div>
    </div>

    <div class="card mb-16">
      <div class="settings-header">👤 Akun</div>
      <div class="settings-row" onclick="openEditName()">
        <div><div class="settings-row-title">Ubah Nama</div><div class="settings-row-desc">Ubah nama tampilan kamu</div></div>
        <div style="font-size:18px;color:var(--text3)">›</div>
      </div>
      <div class="settings-row" onclick="openChangePassword()">
        <div><div class="settings-row-title">Ubah Password</div><div class="settings-row-desc">Ganti password akun kamu</div></div>
        <div style="font-size:18px;color:var(--text3)">›</div>
      </div>
      <div class="settings-row" onclick="sendForgotPassword()">
        <div><div class="settings-row-title">Lupa Password?</div><div class="settings-row-desc">Kirim email reset password</div></div>
        <div style="font-size:18px;color:var(--text3)">📧</div>
      </div>
    </div>

    <div class="card mb-16">
      <div class="settings-header">🔒 Privasi</div>
      <div class="settings-row" onclick="settingsToggleHide()">
        <div><div class="settings-row-title">Sembunyikan Saldo</div><div class="settings-row-desc">Tampilkan saldo sebagai •••••• di seluruh app</div></div>
        <div class="toggle ${hideTotal?'on':''}"><div class="toggle-knob"></div></div>
      </div>
    </div>

    <div class="card mb-16">
      <div class="settings-header">🎨 Tampilan</div>
      <div class="settings-row" onclick="window.toggleTheme && window.toggleTheme();setTimeout(()=>navigate('settings'),100)">
        <div><div class="settings-row-title">Tema</div><div class="settings-row-desc">Saat ini: ${theme === 'dark' ? '🌙 Gelap' : '☀️ Terang'}</div></div>
        <div style="font-size:18px">${theme === 'dark' ? '🌙' : '☀️'}</div>
      </div>
    </div>

    <div class="card mb-16">
      <div class="settings-header">💱 Mata Uang</div>
      <div class="settings-row" onclick="openCurrencyPicker()">
        <div>
          <div class="settings-row-title">Mata Uang Tampilan</div>
          <div class="settings-row-desc">${(CURRENCIES.find(c => c.code === (localStorage.getItem('currency') || 'IDR')) || CURRENCIES[0]).symbol} ${(CURRENCIES.find(c => c.code === (localStorage.getItem('currency') || 'IDR')) || CURRENCIES[0]).name}</div>
        </div>
        <div style="font-size:18px;color:var(--text3)">›</div>
      </div>
    </div>

    <div class="card mb-16">
      <div class="settings-header">💾 Data</div>
      <div class="settings-row" onclick="navigate('categories')">
        <div><div class="settings-row-title">Kelola Kategori</div><div class="settings-row-desc">Tambah, edit, hapus kategori transaksi</div></div>
        <div style="font-size:18px;color:var(--text3)">›</div>
      </div>
      <div class="settings-row" onclick="navigate('notifSettings')">
        <div><div class="settings-row-title">Notifikasi</div><div class="settings-row-desc">Atur pengingat dan suara notifikasi</div></div>
        <div style="font-size:18px;color:var(--text3)">›</div>
      </div>
      <div class="settings-row" onclick="exportData()">
        <div><div class="settings-row-title">Export Data</div><div class="settings-row-desc">Download semua transaksi (JSON)</div></div>
        <div style="font-size:18px;color:var(--text3)">⬇</div>
      </div>
    </div>

    <div class="card mb-16">
      <div class="settings-header">ℹ️ Tentang</div>
      <div class="settings-row">
        <div><div class="settings-row-title">duit.io</div><div class="settings-row-desc">Personal money manager v1.0</div></div>
      </div>
    </div>

    <div class="card mb-16">
      <button class="btn btn-danger" style="width:100%;justify-content:center" onclick="settingsLogout()">
        🚪 Keluar dari Akun
      </button>
    </div>
  `
}

// ── Reusable input modal ──────────────────────────────────────────────
function showInputModal({ title, label, placeholder, value = '', type = 'text', label2 = null, type2 = 'password', desc = '', onSubmit }) {
  const modal = document.getElementById('input-modal')
  if (!modal) return
  document.getElementById('input-modal-title').textContent = title
  document.getElementById('input-modal-label').textContent = label
  const field = document.getElementById('input-modal-field')
  field.type = type
  field.placeholder = placeholder || ''
  field.value = value || ''

  const field2Wrap = document.getElementById('input-modal-field2-wrap')
  const field2 = document.getElementById('input-modal-field2')
  if (label2) {
    field2Wrap.style.display = ''
    document.getElementById('input-modal-label2').textContent = label2
    field2.type = type2
    field2.value = ''
  } else {
    field2Wrap.style.display = 'none'
  }

  document.getElementById('input-modal-desc').textContent = desc || ''

  window._inputModalSubmit = () => {
    const val = field.value
    const val2 = label2 ? field2.value : null
    onSubmit(val, val2)
  }

  modal.classList.add('open')
  setTimeout(() => field.focus(), 100)
}

function settingsToggleHide() {
  const cur = localStorage.getItem('hide_total_balance') === '1'
  localStorage.setItem('hide_total_balance', cur ? '0' : '1')
  showToast(cur ? 'Saldo ditampilkan' : 'Saldo disembunyikan')
  navigate('settings')
}

function openEditName() {
  const meta = state.currentUser?.user_metadata || {}
  showInputModal({
    title: 'Ubah Nama',
    label: 'Nama baru',
    placeholder: 'Nama Lengkap',
    value: meta.full_name || '',
    onSubmit: async (newName) => {
      if (!newName || !newName.trim()) { showToast('Nama tidak boleh kosong', 'error'); return }
      const { error } = await db.auth.updateUser({ data: { full_name: newName.trim() } })
      if (error) { showToast('Gagal: ' + error.message, 'error'); return }
      state.currentUser.user_metadata = { ...state.currentUser.user_metadata, full_name: newName.trim() }
      const sn = document.getElementById('sidebar-name')
      if (sn) sn.textContent = newName.trim()
      document.getElementById('input-modal').classList.remove('open')
      showToast('Nama diubah ✓')
      navigate('settings')
    }
  })
}

function openChangePassword() {
  showInputModal({
    title: 'Ubah Password',
    label: 'Password Baru',
    placeholder: 'Min 6 karakter',
    type: 'password',
    label2: 'Konfirmasi Password',
    desc: 'Password baru akan langsung aktif',
    onSubmit: async (newPass, confirm2) => {
      if (!newPass || newPass.length < 6) { showToast('Password minimal 6 karakter', 'error'); return }
      if (newPass !== confirm2) { showToast('Password tidak cocok', 'error'); return }
      const { error } = await db.auth.updateUser({ password: newPass })
      if (error) { showToast('Gagal: ' + error.message, 'error'); return }
      document.getElementById('input-modal').classList.remove('open')
      showToast('Password diubah ✓')
    }
  })
}

function sendForgotPassword() {
  const email = state.currentUser?.email
  if (!email) { showToast('Email tidak ditemukan', 'error'); return }

  window.showConfirm('📧', 'Kirim Email Reset Password', `Link reset password akan dikirim ke ${email}.`, 'Kirim', 'btn-accent', async () => {
    const { error } = await db.auth.resetPasswordForEmail(email, {
      redirectTo: window.location.origin,
    })
    if (error) { showToast('Gagal: ' + error.message, 'error'); return }
    showToast('Email reset password sudah dikirim ✓')
  })
}

function exportData() {
  const data = {
    exported_at: new Date().toISOString(),
    user: state.currentUser?.email,
    accounts: state.accounts,
    transactions: state.transactions,
    budgets: state.budgets,
    recurring: state.recurring,
    debts: state.debts,
  }
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `duit-io-export-${toLocalDateString(new Date())}.json`
  a.click()
  URL.revokeObjectURL(url)
  showToast('Data diexport ✓')
}

function settingsLogout() {
  window.showConfirm('🚪', 'Keluar dari Akun', 'Kamu akan dikeluarkan dari aplikasi.', 'Keluar', 'btn-danger', async () => {
    await signOut()
    location.reload()
  })
}

function openCurrencyPicker() {
  const current = localStorage.getItem('currency') || 'IDR'
  const modal = document.getElementById('currency-modal')
  if (!modal) return
  document.getElementById('currency-list').innerHTML = CURRENCIES.map(c => `
    <div class="settings-row" onclick="selectCurrency('${c.code}')" style="cursor:pointer">
      <div>
        <div class="settings-row-title">${c.symbol} ${c.name}</div>
        <div class="settings-row-desc">${c.code}</div>
      </div>
      ${c.code === current ? '<div style="color:var(--accent);font-size:18px">✓</div>' : ''}
    </div>
  `).join('')
  modal.classList.add('open')
}

function selectCurrency(code) {
  localStorage.setItem('currency', code)
  document.getElementById('currency-modal').classList.remove('open')
  showToast('Mata uang diubah ✓')
  navigate('settings')
}

export { renderSettings }

window.openCurrencyPicker   = openCurrencyPicker
window.selectCurrency       = selectCurrency
window.settingsToggleHide   = settingsToggleHide
window.openEditName         = openEditName
window.openChangePassword   = openChangePassword
window.sendForgotPassword   = sendForgotPassword
window.exportData           = exportData
window.settingsLogout       = settingsLogout
