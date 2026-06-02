// src/js/pages/scan.js
import { state }        from '../lib/store.js'
import { showToast }    from '../lib/toast.js'
import { navigate }     from '../lib/router.js'
import { fmt, fmtShort, fmtDate, toLocalDateString } from '../lib/utils.js'
import { getCatGroups } from '../lib/categories.js'
import { BANK_ICONS }   from '../lib/config.js'
import * as DB          from '../lib/supabase.js'
import { callAI }       from '../lib/ai.js'
import { openCamera }   from '../ui/camera.js'

function renderScan(area, actions) {
  actions.innerHTML = ''

  // If we have a scanned result, show it
  if (state.lastScanResult) {
    showScanResult(area)
    return
  }

  // If we have an image but no result yet (processing)
  if (state.scanImageData && state.scanIsAnalyzing) {
    showScanProcessing(area)
    return
  }

  // If we have an image preview
  if (state.scanImageData) {
    showScanPreview(area)
    return
  }

  // Default — choose camera or upload
  area.innerHTML = `
    <div class="scan-intro">
      <div class="scan-intro-icon">📷</div>
      <h2 class="scan-intro-title">Scan Struk</h2>
      <p class="scan-intro-desc">Pilih cara untuk memasukkan foto struk. Setelah dipilih, sistem akan otomatis membaca dan mengisi detail transaksi.</p>

      ${state.lastScanError ? `
        <div style="background:var(--red-dim);border:1px solid var(--red);color:var(--red);padding:12px;border-radius:10px;margin-bottom:16px;font-size:13px;text-align:left">
          <strong>⚠️ Error sebelumnya:</strong><br>
          ${state.lastScanError}
          <button class="btn btn-ghost btn-sm" style="margin-top:8px;font-size:11px" onclick="clearScanError()">Tutup</button>
        </div>
      ` : ''}

      <div class="scan-option-grid">
        <button class="scan-option" onclick="openScanCamera()">
          <div class="scan-option-icon">📸</div>
          <div class="scan-option-title">Kamera</div>
          <div class="scan-option-desc">Foto struk langsung pakai kamera</div>
        </button>

        <button class="scan-option" onclick="openScanUpload()">
          <div class="scan-option-icon">🖼️</div>
          <div class="scan-option-title">Upload Gambar</div>
          <div class="scan-option-desc">Pilih foto dari galeri / file</div>
        </button>
      </div>

      <input type="file" id="scan-file-input" accept="image/*" style="display:none" onchange="handleScanUpload(event)"/>
    </div>
  `
}

function clearScanError() {
  state.lastScanError = null
  navigate('scan')
}
window.clearScanError = clearScanError

// ── Camera option ────────────────────────────────────────────────────
function openScanCamera() {
  openCamera((dataUrl, base64, mimeType) => {
    state.scanImageData = dataUrl
    state.scanImageBase64Full = base64
    state.scanImageMimeType = mimeType
    state.lastScanResult = null
    navigate('scan')
    // Auto-start scan
    setTimeout(() => doScan(), 300)
  })
}

// ── Upload option ────────────────────────────────────────────────────
function openScanUpload() {
  document.getElementById('scan-file-input')?.click()
}

function handleScanUpload(event) {
  const file = event.target.files[0]
  if (!file) return
  const reader = new FileReader()
  reader.onload = e => {
    const dataUrl = e.target.result
    state.scanImageData = dataUrl
    state.scanImageBase64Full = dataUrl.split(',')[1]
    state.scanImageMimeType = file.type || 'image/jpeg'
    state.lastScanResult = null
    navigate('scan')
    setTimeout(() => doScan(), 300)
  }
  reader.readAsDataURL(file)
  event.target.value = '' // reset
}

// ── Preview before/during scan ───────────────────────────────────────
function showScanPreview(area) {
  area.innerHTML = `
    <div class="scan-preview-wrap">
      <div class="scan-preview-image">
        <img src="${state.scanImageData}" alt="Preview"/>
      </div>
      <div style="display:flex;gap:10px;margin-top:14px">
        <button class="btn btn-ghost" style="flex:1" onclick="clearScan()">← Pilih ulang</button>
        <button class="btn btn-accent" style="flex:2" onclick="doScan()">Mulai Baca Struk</button>
      </div>
    </div>
  `
}

function showScanProcessing(area) {
  area.innerHTML = `
    <div class="scan-preview-wrap">
      <div class="scan-preview-image">
        <img src="${state.scanImageData}" alt="Preview"/>
        <div class="scan-processing-overlay">
          <div class="scan-spinner"></div>
          <div style="margin-top:12px;font-size:13px;font-weight:600">Membaca struk...</div>
        </div>
      </div>
    </div>
  `
}

// ── Scan action ──────────────────────────────────────────────────────
async function doScan() {
  if (!state.scanImageBase64Full) {
    showToast('Tidak ada gambar untuk discan', 'error')
    return
  }

  state.lastScanError = null   // clear any old error
  state.scanIsAnalyzing = true
  navigate('scan')

  try {
    const prompt = `Analisa struk/nota ini dan berikan hasil HANYA dalam format JSON valid (tanpa markdown, tanpa penjelasan tambahan):
{
  "merchant": "nama toko",
  "total": angka_total,
  "date": "YYYY-MM-DD" atau null,
  "items": [{"name": "nama item", "qty": jumlah, "price": harga}],
  "category": "Food/Grocery/Transport/Shopping/Coffee/Dining Out/etc",
  "is_receipt": true_atau_false
}
Jika bukan struk/nota, set is_receipt=false.`

    const result = await callAI('scan_receipt', prompt, state.scanImageBase64Full, state.scanImageMimeType)

    // Try to extract JSON
    let parsed
    try {
      const jsonMatch = result.match(/\{[\s\S]*\}/)
      parsed = jsonMatch ? JSON.parse(jsonMatch[0]) : JSON.parse(result)
    } catch (e) {
      throw new Error('Gagal membaca hasil. Coba foto ulang dengan lebih jelas.')
    }

    if (parsed.is_receipt === false) {
      throw new Error('Gambar ini bukan struk/nota.')
    }

    state.lastScanResult = parsed
    state.scanIsAnalyzing = false
    state.selectedScanAccountId = state.accounts[0]?.id || ''
    navigate('scan')
  } catch (err) {
    state.scanIsAnalyzing = false
    state.lastScanError = err.message || String(err)
    showToast('Gagal scan: ' + state.lastScanError, 'error')
    navigate('scan')
  }
}

// ── Result view ──────────────────────────────────────────────────────
function showScanResult(area) {
  const r = state.lastScanResult
  area.innerHTML = `
    <div class="scan-result">
      <div class="scan-result-header">
        <div style="font-size:13px;color:var(--text2)">Hasil Scan</div>
        <button class="btn-icon" onclick="clearScan()" title="Batalkan">✕</button>
      </div>

      <div class="scan-result-card">
        <div class="scan-result-merchant">${r.merchant || 'Toko'}</div>
        <div class="scan-result-total">${fmt(r.total || 0)}</div>
        ${r.date ? `<div class="scan-result-date">${fmtDate(r.date)}</div>` : ''}
        ${r.category ? `<div class="scan-result-badge">${r.category}</div>` : ''}
      </div>

      ${r.items && r.items.length ? `
        <div style="margin-top:14px">
          <div style="font-size:11px;font-weight:700;color:var(--text2);text-transform:uppercase;letter-spacing:.5px;margin-bottom:8px">Item</div>
          ${r.items.map(it => `
            <div class="scan-result-item">
              <div>
                <div style="font-weight:600">${it.name || '?'}</div>
                ${it.qty ? `<div style="font-size:11px;color:var(--text3)">${it.qty} × ${fmtShort(it.price||0)}</div>` : ''}
              </div>
              <div style="font-weight:600">${fmt((it.qty || 1) * (it.price || 0))}</div>
            </div>
          `).join('')}
        </div>
      ` : ''}

      <div class="field" style="margin-top:16px">
        <label>Simpan ke Rekening</label>
        <select id="scan-acct-select">
          ${state.accounts.map(a => `<option value="${a.id}" ${a.id===state.selectedScanAccountId?'selected':''}>${a.icon || BANK_ICONS[a.bank] || '💳'} ${a.name} (${fmtShort(a.balance)})</option>`).join('')}
        </select>
      </div>

      <div style="display:flex;gap:10px;margin-top:14px">
        <button class="btn btn-ghost" style="flex:1" onclick="clearScan()">Batal</button>
        <button class="btn btn-accent" style="flex:2" onclick="saveScanTx()">💾 Simpan Transaksi</button>
      </div>

      ${r.items && r.items.length > 1 ? `
        <button class="btn btn-ghost" style="width:100%;margin-top:8px" onclick="goSplitFromScan()">
          🍽️ Lanjut ke Split Bill
        </button>
      ` : ''}
    </div>
  `
}

async function saveScanTx() {
  const r = state.lastScanResult
  if (!r) return
  const sel = document.getElementById('scan-acct-select')
  const accId = sel?.value || state.accounts[0]?.id
  if (!accId) { showToast('Pilih rekening', 'error'); return }

  try {
    await DB.createTransaction({
      type: 'expense',
      amount: r.total || 0,
      account_id: accId,
      category: r.category || 'Other',
      note: r.merchant || 'Scan struk',
      date: r.date || toLocalDateString(new Date()),
    })
    showToast('Transaksi disimpan ✓')
    clearScan()
    navigate('transactions')
  } catch (e) {
    showToast('Gagal: ' + e.message, 'error')
  }
}

function clearScan() {
  state.scanImageData = null
  state.scanImageBase64Full = ''
  state.scanImageMimeType = 'image/jpeg'
  state.lastScanResult = null
  state.scanIsAnalyzing = false
  navigate('scan')
}

function goSplitFromScan() {
  const r = state.lastScanResult
  if (!r) return
  // Pre-fill split bill state
  state.sb = state.sb || {}
  state.sb.step = 'home'
  state.sb.note = r.merchant || ''
  state.sb.totalAmount = r.total || 0
  state.sb.items = (r.items || []).map(it => ({
    name: it.name || '?',
    qty: it.qty || 1,
    price: it.price || 0,
    assignees: []
  }))
  navigate('splitbill')
}

export { renderScan }

window.doScan          = doScan
window.clearScan       = clearScan
window.saveScanTx      = saveScanTx
window.goSplitFromScan = goSplitFromScan
window.openScanCamera  = openScanCamera
window.openScanUpload  = openScanUpload
window.handleScanUpload= handleScanUpload
