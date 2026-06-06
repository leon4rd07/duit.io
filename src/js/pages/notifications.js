// src/js/pages/notifications.js
import { state }             from '../lib/store.js'
import { showToast }         from '../lib/toast.js'
import { navigate }          from '../lib/router.js'
import { fmt, fmtShort, fmtDate, monthKey } from '../lib/utils.js'

// ── Storage helpers ──────────────────────────────────────────────────────
const isNotifSupported = () => typeof Notification !== 'undefined'
const hasSW            = () => 'serviceWorker' in navigator
const getEnabled       = () => localStorage.getItem('notif_enabled') === 'true'
const getSound         = () => localStorage.getItem('notif_sound') || 'coins'

function getTimes() {
  try {
    const raw = localStorage.getItem('notif_times')
    if (raw) {
      const arr = JSON.parse(raw)
      if (Array.isArray(arr) && arr.length) return arr.slice().sort()
    }
  } catch {}
  const legacy = localStorage.getItem('notif_time')
  if (legacy) return [legacy]
  return ['21:00']
}

function setTimes(arr) {
  localStorage.setItem('notif_times', JSON.stringify(arr.slice().sort()))
  scheduleNotif()
}

function isStandalone() {
  return window.matchMedia('(display-mode: standalone)').matches
    || window.navigator.standalone === true
}

// ── Dynamic notification content ────────────────────────────────────────
function buildNotifContent(timeOfDay) {
  const today = new Date().toISOString().split('T')[0]
  const todayTx = (state.transactions || []).filter(t => t.date === today)
  const todayExpense = todayTx.filter(t => t.type === 'expense').reduce((s,t) => s + Number(t.amount), 0)
  const todayIncome  = todayTx.filter(t => t.type === 'income').reduce((s,t) => s + Number(t.amount), 0)
  const fmtRp = n => 'Rp ' + Math.round(n).toLocaleString('id-ID')

  const hh = timeOfDay ? parseInt(timeOfDay.split(':')[0], 10) : new Date().getHours()
  let greeting = ''
  if (hh >= 4 && hh < 11) greeting = 'Selamat pagi'
  else if (hh >= 11 && hh < 15) greeting = 'Selamat siang'
  else if (hh >= 15 && hh < 19) greeting = 'Selamat sore'
  else greeting = 'Selamat malam'

  let body
  if (todayTx.length === 0) {
    const prompts = [
      'Belum ada transaksi hari ini. Jangan lupa catat ya 📝',
      'Yuk catat pengeluaran/pemasukanmu hari ini 💸',
      'Catat dulu transaksimu sebelum lupa 🙏',
    ]
    body = prompts[Math.floor(Math.random() * prompts.length)]
  } else {
    const parts = []
    if (todayExpense > 0) parts.push(`Keluar: ${fmtRp(todayExpense)}`)
    if (todayIncome > 0)  parts.push(`Masuk: ${fmtRp(todayIncome)}`)
    parts.push(`(${todayTx.length} tx)`)
    body = `${parts.join(' · ')}. Tap untuk lihat detail.`
  }

  // Budget warning if any category >= 80% of limit this month
  try {
    const mk = monthKey(new Date())
    const monthExpense = {}
    state.transactions.filter(t => t.type === 'expense' && t.date?.startsWith(mk))
      .forEach(t => { monthExpense[t.category] = (monthExpense[t.category]||0) + Number(t.amount) })
    const warnings = (state.budgets || [])
      .filter(b => b.month === mk)
      .map(b => ({ cat: b.category, pct: (monthExpense[b.category]||0) / Number(b.limit_amount) }))
      .filter(b => b.pct >= 0.8)
      .sort((a, b) => b.pct - a.pct)
    if (warnings.length) {
      const w = warnings[0]
      const wPct = Math.round(w.pct * 100)
      body = `⚠️ ${w.cat}: ${wPct}% dari anggaran. ${body}`
    }
  } catch {}

  return { title: `${greeting}! 💰`, body }
}

// ── Sound ───────────────────────────────────────────────────────────────
function playNotifSound(type) {
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)()
    const sequences = {
      coins: [[523,0.08],[659,0.08],[784,0.08],[1047,0.2]],
      ding:  [[880,0.05],[880,0.3]],
      pop:   [[300,0.02],[600,0.12],[300,0.02]],
      chime: [[523,0.1],[659,0.1],[784,0.1],[659,0.1],[523,0.25]],
    }
    const seq = sequences[type] || sequences.ding
    let t = ctx.currentTime + 0.05
    seq.forEach(([freq, dur]) => {
      const osc = ctx.createOscillator()
      const gain = ctx.createGain()
      osc.connect(gain); gain.connect(ctx.destination)
      osc.frequency.value = freq
      osc.type = (type==='coins'||type==='chime') ? 'sine' : type==='pop' ? 'triangle' : 'sine'
      gain.gain.setValueAtTime(0.4, t)
      gain.gain.exponentialRampToValueAtTime(0.001, t + dur)
      osc.start(t); osc.stop(t + dur)
      t += dur
    })
  } catch(e) {
    console.warn('Audio not available:', e)
  }
}

// ── Send via Service Worker (fixes "Illegal constructor" on Android) ────
async function showSWNotification(title, options) {
  if (!isNotifSupported() || Notification.permission !== 'granted') return false
  if (!hasSW()) {
    try { new Notification(title, options); return true } catch { return false }
  }
  try {
    const reg = await navigator.serviceWorker.ready
    await reg.showNotification(title, options)
    return true
  } catch (e) {
    console.warn('SW showNotification failed:', e)
    try { new Notification(title, options); return true } catch { return false }
  }
}

// ── UI ──────────────────────────────────────────────────────────────────
function renderNotifSettings(area, actions) {
  if (!isNotifSupported()) {
    area.innerHTML = `
      <div class="card">
        <div class="section-title mb-12">Notifikasi Tidak Didukung</div>
        <div style="color:var(--text2);font-size:13px;line-height:1.6">
          Browser ini tidak mendukung Notification API.
        </div>
      </div>`
    return
  }

  const enabled = getEnabled()
  const times = getTimes()
  const sound = getSound()
  const perm = Notification.permission
  const standalone = isStandalone()

  area.innerHTML = `
    ${!standalone ? `
      <div class="card mb-14" style="border-left:3px solid var(--amber);background:rgba(245,158,11,0.08)">
        <div style="font-weight:600;font-size:13px;margin-bottom:6px">💡 Tip: Install sebagai PWA</div>
        <div style="font-size:12px;color:var(--text2);line-height:1.6">
          Notifikasi background bekerja optimal kalau aplikasi di-install ke home screen. Tap menu browser → "Tambah ke Layar Utama".
        </div>
      </div>
    ` : ''}

    <div class="card mb-14">
      <div class="section-title mb-4">Pengingat Harian</div>
      <div style="font-size:13px;color:var(--text2);margin-bottom:16px">
        Atur beberapa jadwal pengingat dalam satu hari
      </div>
      <div class="notif-row">
        <div>
          <div style="font-weight:600;font-size:14px">Aktifkan Pengingat</div>
          <div style="font-size:12px;color:var(--text2);margin-top:2px">
            ${perm==='granted'?'✓ Izin notifikasi diberikan':perm==='denied'?'⚠️ Izin ditolak — aktifkan manual di pengaturan browser':'Akan minta izin saat diaktifkan'}
          </div>
        </div>
        <div class="toggle-switch ${enabled?'on':''}" id="notif-toggle" onclick="toggleNotif()">
          <div class="toggle-knob"></div>
        </div>
      </div>
    </div>

    <div class="card mb-14">
      <div class="section-title mb-12">Jadwal Pengingat</div>
      <div style="font-size:12px;color:var(--text2);margin-bottom:12px">Tambah beberapa waktu — pesan akan kontekstual sesuai pagi/siang/sore/malam</div>
      <div class="notif-times-list">
        ${times.map((t, i) => `
          <div class="notif-time-row">
            <input type="time" value="${t}" class="notif-time-input" onchange="updateNotifTime(${i}, this.value)"/>
            <div class="notif-time-period">${timeOfDayLabel(t)}</div>
            <button class="btn btn-ghost btn-sm icon-only" onclick="removeNotifTime(${i})" ${times.length<=1?'disabled style="opacity:0.3"':''} title="Hapus">🗑️</button>
          </div>
        `).join('')}
      </div>
      <div style="display:flex;gap:8px;margin-top:12px;flex-wrap:wrap">
        <button class="btn btn-ghost btn-sm" onclick="addPresetTime('08:00')">+ Pagi</button>
        <button class="btn btn-ghost btn-sm" onclick="addPresetTime('12:00')">+ Siang</button>
        <button class="btn btn-ghost btn-sm" onclick="addPresetTime('17:00')">+ Sore</button>
        <button class="btn btn-ghost btn-sm" onclick="addPresetTime('21:00')">+ Malam</button>
      </div>
    </div>

    <div class="card mb-14">
      <div class="section-title mb-12">Suara Notifikasi</div>
      <div style="display:flex;gap:8px;flex-wrap:wrap">
        ${[
          {id:'coins',label:'🪙 Koin'},
          {id:'ding',label:'🔔 Ding'},
          {id:'pop',label:'💬 Pop'},
          {id:'chime',label:'🎵 Chime'},
        ].map(s=>`
          <button class="btn ${sound===s.id?'btn-accent':'btn-ghost'} btn-sm" onclick="setNotifSound('${s.id}')">${s.label}</button>
        `).join('')}
      </div>
    </div>

    <div class="card mb-14">
      <div class="section-title mb-12">Test Notifikasi</div>
      <div style="font-size:13px;color:var(--text2);margin-bottom:14px">Tap untuk kirim test dengan data hari ini</div>
      <button class="btn btn-outline" style="width:100%;justify-content:center" onclick="sendTestNotif()">🔔 Kirim Test Sekarang</button>
    </div>

    <div class="card">
      <div class="section-title mb-8">Status</div>
      <div style="font-size:13px;color:var(--text2);line-height:1.8">
        Pengingat: <strong style="color:${enabled?'var(--green)':'var(--text3)'}">${enabled?'Aktif':'Nonaktif'}</strong><br>
        Jadwal: <strong>${times.join(', ')}</strong><br>
        Suara: <strong>${sound}</strong><br>
        Izin browser: <strong style="color:${perm==='granted'?'var(--green)':perm==='denied'?'var(--red)':'var(--amber)'}">${perm}</strong><br>
        Service Worker: <strong style="color:${hasSW()?'var(--green)':'var(--red)'}">${hasSW()?'tersedia':'tidak tersedia'}</strong><br>
        Mode: <strong>${standalone?'PWA terinstall ✓':'Browser biasa'}</strong>
      </div>
    </div>`
}

function timeOfDayLabel(t) {
  const hh = parseInt(t.split(':')[0], 10)
  if (hh >= 4 && hh < 11) return '🌅 Pagi'
  if (hh >= 11 && hh < 15) return '☀️ Siang'
  if (hh >= 15 && hh < 19) return '🌇 Sore'
  return '🌙 Malam'
}

// ── Actions ─────────────────────────────────────────────────────────────
async function toggleNotif() {
  if (!isNotifSupported()) {
    showToast('Browser ini tidak mendukung notifikasi', 'error')
    return
  }
  const current = getEnabled()
  if (current) {
    localStorage.setItem('notif_enabled', 'false')
    if (window._notifTimer) clearInterval(window._notifTimer)
    showToast('Pengingat dinonaktifkan')
    navigate('notifSettings')
    return
  }
  let perm = Notification.permission
  if (perm === 'denied') {
    showToast('Izin notifikasi ditolak. Aktifkan manual di pengaturan browser.', 'error')
    return
  }
  if (perm === 'default') {
    try { perm = await Notification.requestPermission() } catch (e) {
      showToast('Gagal meminta izin: ' + e.message, 'error'); return
    }
    if (perm !== 'granted') {
      showToast('Izin notifikasi dibutuhkan untuk pengingat', 'error'); return
    }
  }
  localStorage.setItem('notif_enabled', 'true')
  scheduleNotif()
  showToast('Pengingat diaktifkan! 🔔')
  navigate('notifSettings')
}

function addPresetTime(t) {
  const times = getTimes()
  if (times.includes(t)) { showToast(`Jadwal ${t} sudah ada`, 'error'); return }
  if (times.length >= 6) { showToast('Maksimal 6 jadwal per hari', 'error'); return }
  setTimes([...times, t])
  showToast(`Jadwal ${t} ditambah`)
  navigate('notifSettings')
}

function updateNotifTime(idx, newTime) {
  if (!newTime) return
  const times = getTimes()
  if (idx < 0 || idx >= times.length) return
  const dup = times.findIndex((t, i) => i !== idx && t === newTime)
  if (dup >= 0) { showToast(`Jadwal ${newTime} sudah ada`, 'error'); navigate('notifSettings'); return }
  times[idx] = newTime
  setTimes(times)
  navigate('notifSettings')
}

function removeNotifTime(idx) {
  const times = getTimes()
  if (times.length <= 1) { showToast('Minimal 1 jadwal harus ada', 'error'); return }
  times.splice(idx, 1)
  setTimes(times)
  showToast('Jadwal dihapus')
  navigate('notifSettings')
}

function setNotifSound(s) {
  localStorage.setItem('notif_sound', s)
  playNotifSound(s)
  navigate('notifSettings')
}

// ── Scheduler ───────────────────────────────────────────────────────────
function scheduleNotif() {
  if (window._notifTimer) clearInterval(window._notifTimer)
  if (!getEnabled() || !isNotifSupported() || Notification.permission !== 'granted') return

  window._notifTimer = setInterval(() => {
    const now = new Date()
    const hh = String(now.getHours()).padStart(2, '0')
    const mm = String(now.getMinutes()).padStart(2, '0')
    const currentHM = `${hh}:${mm}`
    const times = getTimes()
    if (times.includes(currentHM)) {
      const key = `${now.toDateString()}-${currentHM}`
      if (window._lastNotifKey !== key) {
        window._lastNotifKey = key
        sendScheduledNotif(currentHM)
      }
    }
  }, 30000)
}

async function sendScheduledNotif(timeOfDay) {
  const { title, body } = buildNotifContent(timeOfDay)
  try { playNotifSound(getSound()) } catch {}
  await showSWNotification(title, {
    body,
    icon: '/icon-192.png',
    badge: '/icon-192.png',
    tag: 'daily-reminder-' + timeOfDay,
    data: { url: '/' },
  })
}

async function sendTestNotif() {
  if (!isNotifSupported()) { showToast('Browser ini tidak mendukung notifikasi', 'error'); return }
  let perm = Notification.permission
  if (perm === 'default') {
    try { perm = await Notification.requestPermission() } catch (e) {
      showToast('Gagal meminta izin: ' + e.message, 'error'); return
    }
  }
  if (perm !== 'granted') {
    showToast('Izin notifikasi diperlukan.', 'error'); return
  }
  try { playNotifSound(getSound()) } catch {}
  const { title, body } = buildNotifContent()
  const ok = await showSWNotification(title + ' (TEST)', {
    body,
    icon: '/icon-192.png',
    badge: '/icon-192.png',
    tag: 'test-notif',
    data: { url: '/' },
  })
  if (ok) showToast('Test notifikasi dikirim! 🔔')
  else showToast('Gagal mengirim notifikasi', 'error')
}

function initNotifScheduler() {
  if (!isNotifSupported()) return
  if (getEnabled() && Notification.permission === 'granted') {
    scheduleNotif()
  }
}

export { renderNotifSettings, initNotifScheduler, sendTestNotif }

window.toggleNotif = toggleNotif
window.setNotifSound = setNotifSound
window.scheduleNotif = scheduleNotif
window.sendTestNotif = sendTestNotif
window.addPresetTime = addPresetTime
window.updateNotifTime = updateNotifTime
window.removeNotifTime = removeNotifTime
