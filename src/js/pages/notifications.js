// src/js/pages/notifications.js
import { state }             from '../lib/store.js'
import { showToast }         from '../lib/toast.js'
import { navigate }          from '../lib/router.js'
import { fmt, fmtShort, fmtDate, monthKey, monthLabel } from '../lib/utils.js'
import { CATEGORIES, getCatGroups, getCatObj } from '../lib/categories.js'
import { AVATAR_COLORS }     from '../lib/config.js'
import * as DB                from '../lib/supabase.js'

// Helpers
const isNotifSupported = () => typeof Notification !== 'undefined'
const getEnabled = () => localStorage.getItem('notif_enabled') === 'true'
const getTime    = () => localStorage.getItem('notif_time') || '21:00'
const getSound   = () => localStorage.getItem('notif_sound') || 'coins'

// Detect standalone (PWA installed) mode
function isStandalone() {
  return window.matchMedia('(display-mode: standalone)').matches
    || window.navigator.standalone === true
}

// ===== NOTIFICATION SETTINGS =====
function renderNotifSettings(area, actions) {
  if (!isNotifSupported()) {
    area.innerHTML = `
      <div class="card">
        <div class="section-title mb-12">Notifikasi Tidak Didukung</div>
        <div style="color:var(--text2);font-size:13px;line-height:1.6">
          Browser ini tidak mendukung Notification API. Coba browser modern (Chrome, Firefox, Safari, Edge versi terbaru) atau install aplikasi sebagai PWA.
        </div>
      </div>`
    return
  }

  const enabled = getEnabled()
  const time = getTime()
  const sound = getSound()
  const perm = Notification.permission
  const standalone = isStandalone()

  area.innerHTML = `
    ${!standalone ? `
      <div class="card mb-14" style="border-left:3px solid var(--amber);background:rgba(245,158,11,0.08)">
        <div style="font-weight:600;font-size:13px;margin-bottom:6px">💡 Tip: Install sebagai PWA</div>
        <div style="font-size:12px;color:var(--text2);line-height:1.6">
          Notifikasi background hanya bekerja optimal kalau aplikasi di-install ke home screen. Buka menu browser → "Tambah ke Layar Utama" / "Install App". Kalau cuma dibuka di tab browser, notifikasi hanya jalan saat tab aktif.
        </div>
      </div>
    ` : ''}

    <div class="card mb-14">
      <div class="section-title mb-4">Pengingat Harian</div>
      <div style="font-size:13px;color:var(--text2);margin-bottom:16px">
        Notifikasi otomatis jika belum ada transaksi hari itu
      </div>
      <div class="notif-settings">
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
        <div class="notif-row">
          <div>
            <div style="font-weight:600;font-size:14px">Waktu Pengingat</div>
            <div style="font-size:12px;color:var(--text2);margin-top:2px">Jam berapa dikirim setiap malam</div>
          </div>
          <input type="time" id="notif-time" value="${time}"
            style="background:var(--bg4);border:1px solid var(--border2);border-radius:8px;padding:7px 10px;color:var(--text);font-size:14px;font-weight:600;outline:none"
            onchange="localStorage.setItem('notif_time',this.value);scheduleNotif()"/>
        </div>
        <div class="notif-row" style="flex-direction:column;align-items:flex-start;gap:12px">
          <div style="font-weight:600;font-size:14px">Suara Notifikasi</div>
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
      </div>
    </div>

    <div class="card mb-14">
      <div class="section-title mb-12">Test Notifikasi</div>
      <div style="font-size:13px;color:var(--text2);margin-bottom:14px">Kirim test notifikasi sekarang untuk memastikan semuanya berjalan</div>
      <button class="btn btn-outline" style="width:100%;justify-content:center" onclick="sendTestNotif()">🔔 Kirim Test Sekarang</button>
    </div>

    <div class="card">
      <div class="section-title mb-8">Status</div>
      <div style="font-size:13px;color:var(--text2);line-height:1.8">
        Pengingat: <strong style="color:${enabled?'var(--green)':'var(--text3)'}">${enabled?'Aktif':'Nonaktif'}</strong><br>
        Jam: <strong>${time}</strong><br>
        Suara: <strong>${sound}</strong><br>
        Izin browser: <strong style="color:${perm==='granted'?'var(--green)':perm==='denied'?'var(--red)':'var(--amber)'}">${perm}</strong><br>
        Mode: <strong>${standalone?'PWA terinstall ✓':'Browser biasa'}</strong>
      </div>
    </div>`
}

async function toggleNotif() {
  if (!isNotifSupported()) {
    showToast('Browser ini tidak mendukung notifikasi', 'error')
    return
  }

  const current = getEnabled()
  if (current) {
    // Turn OFF
    localStorage.setItem('notif_enabled', 'false')
    if (window._notifTimer) clearInterval(window._notifTimer)
    showToast('Pengingat dinonaktifkan')
    navigate('notifSettings')
    return
  }

  // Turning ON — request permission first if needed
  let perm = Notification.permission
  if (perm === 'denied') {
    showToast('Izin notifikasi ditolak. Aktifkan manual di pengaturan browser.', 'error')
    return
  }
  if (perm === 'default') {
    try {
      perm = await Notification.requestPermission()
    } catch (e) {
      showToast('Gagal meminta izin: ' + e.message, 'error')
      return
    }
    if (perm !== 'granted') {
      showToast('Izin notifikasi dibutuhkan untuk pengingat', 'error')
      return
    }
  }

  localStorage.setItem('notif_enabled', 'true')
  scheduleNotif()
  showToast('Pengingat diaktifkan! 🔔')
  navigate('notifSettings')
}

function setNotifSound(s) {
  localStorage.setItem('notif_sound', s)
  playNotifSound(s)  // preview the sound
  navigate('notifSettings')
}

// Generate sound using Web Audio API
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

function scheduleNotif() {
  if (window._notifTimer) clearInterval(window._notifTimer)
  const enabled = getEnabled()
  if (!enabled) return
  if (!isNotifSupported() || Notification.permission !== 'granted') return

  // Check every minute if it's time to notify
  window._notifTimer = setInterval(() => {
    const now = new Date()
    const targetTime = getTime()
    const [th, tm] = targetTime.split(':').map(Number)
    if (now.getHours() === th && now.getMinutes() === tm) {
      // Only send once per minute window
      const lastSent = window._lastNotifMinute
      const currentMinute = `${now.toDateString()}-${th}-${tm}`
      if (lastSent !== currentMinute) {
        window._lastNotifMinute = currentMinute
        checkAndSendNotif()
      }
    }
  }, 30000)  // check every 30 seconds to be safe with timing
}

function checkAndSendNotif() {
  if (!isNotifSupported() || Notification.permission !== 'granted') return
  const sound = getSound()
  const today = new Date().toISOString().split('T')[0]
  const todayTx = state.transactions.filter(t => t.date === today)
  if (todayTx.length === 0) {
    try {
      playNotifSound(sound)
      new Notification('duit.io 💰', {
        body: 'Kamu belum catat transaksi hari ini! Jangan lupa update keuanganmu 📝',
        icon: '/icon-192.png',
        badge: '/icon-192.png',
        tag: 'daily-reminder',
      })
    } catch(e) {
      console.warn('Failed to send notification:', e)
    }
  }
}

async function sendTestNotif() {
  if (!isNotifSupported()) {
    showToast('Browser ini tidak mendukung notifikasi', 'error')
    return
  }
  let perm = Notification.permission
  if (perm === 'default') {
    try { perm = await Notification.requestPermission() } catch (e) {
      showToast('Gagal meminta izin: ' + e.message, 'error'); return
    }
  }
  if (perm !== 'granted') {
    showToast('Izin notifikasi diperlukan. Aktifkan di pengaturan browser.', 'error')
    return
  }
  const sound = getSound()
  try {
    playNotifSound(sound)
    new Notification('duit.io 💰 — Test', {
      body: 'Halo! Ini adalah test notifikasi duit.io. Semuanya berjalan baik! ✓',
      icon: '/icon-192.png',
      tag: 'test-notif',
    })
    showToast('Test notifikasi dikirim! 🔔')
  } catch(e) {
    showToast('Gagal kirim: ' + e.message, 'error')
  }
}

// Start scheduler on app load
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
