// src/js/pages/scan.js
import { state }             from '../lib/store.js'
import { showToast }         from '../lib/toast.js'
import { navigate }          from '../lib/router.js'
import { fmt, fmtShort, fmtDate, monthKey, monthLabel } from '../lib/utils.js'
import { CATEGORIES, getCatGroups, getCatObj } from '../lib/categories.js'
import { AVATAR_COLORS }     from '../lib/config.js'
import * as DB                from '../lib/supabase.js'

import { callAI } from '../lib/ai.js'
import { openCamera } from '../ui/camera.js'

// ===== SCAN RECEIPT =====
let scanImageData = null;
function renderScan(area, actions) {
  area.innerHTML = `
    <div class="card mb-16">
      <div class="section-title mb-4">AI Scan Struk</div>
      


      <div class="scan-zone" id="scan-zone" onclick="document.getElementById('scan-input').click()" 
           ondragover="event.preventDefault();this.classList.add('drag-over')" 
           ondragleave="this.classList.remove('drag-over')"
           ondrop="handleScanDrop(event)">
        <div class="scan-icon">📷</div>
        <div style="font-size:15px;font-weight:600;margin-bottom:6px">Tap atau drag foto struk</div>
        <div style="font-size:13px;color:var(--text2)">GoPay · OVO · BCA Transfer · Tokopedia · Shopee</div>
        <input type="file" id="scan-input" accept="image/*" style="display:none" onchange="handleScanFile(this)"/>
      </div>
      <div id="scan-preview" style="display:none;margin-top:16px;text-align:center">
        <img id="scan-img" style="max-height:250px;border-radius:10px;margin:0 auto"/>
        <div style="margin-top:12px">
          <button class="btn btn-accent" onclick="doScan()" id="scan-btn">🤖 Analisis dengan AI</button>
          <button class="btn btn-ghost" onclick="clearScan()" style="margin-left:8px">Hapus</button>
        </div>
      </div>
    </div>
    <div id="scan-result-area"></div>`;
}


function openScanCamera() {
  openCamera((dataUrl, base64, mime) => {
    scanImageBase64Full = dataUrl;
    scanImageData = base64;
    scanImageMimeType = mime;
    navigate('scan');
  });
}

// saveAnthropicKey removed — key now server-side only

function handleScanDrop(e) {
  e.preventDefault();
  document.getElementById('scan-zone').classList.remove('drag-over');
  const file = e.dataTransfer.files[0];
  if (file) processFile(file);
}

function handleScanFile(input) {
  if (input.files[0]) processFile(input.files[0]);
}

let scanImageBase64Full = '';
let scanImageMimeType = 'image/jpeg';
function processFile(file) {
  const reader = new FileReader();
  reader.onload = (e) => {
    scanImageBase64Full = e.target.result;
    scanImageData = e.target.result.split(',')[1];
    scanImageMimeType = file.type || 'image/jpeg';
    navigate('scan'); // re-render with image shown
  };
  reader.readAsDataURL(file);
}

function clearScan() {
  scanImageData = null;
  scanImageBase64Full = '';
  _scanIsAnalyzing = false;
  const inp = document.getElementById('scan-input');
  if (inp) inp.value = '';
  navigate('scan');
}

async function doScan() {
  if (!scanImageData) { showToast('Upload foto struk dulu','error'); return; }
  const btn = document.getElementById('scan-btn');
  btn.disabled = true;
  btn.innerHTML = '<span class="btn-spinner"></span>Menganalisis...';
  const mediaType = scanImageMimeType || 'image/jpeg';
  _scanIsAnalyzing = true;
  navigate('scan'); // show scanning animation
  const cats = [...CATEGORIES.expense,...CATEGORIES.income].join(', ');
  const accounts = state.accounts.map(a=>a.name).join(', ');
  const prompt = 'Kamu adalah asisten keuangan Indonesia. Analisis struk/bukti bayar ini.\nKembalikan HANYA JSON valid (tanpa markdown):\n{\n  "amount": <total Rupiah angka>,\n  "merchant": "<nama>",\n  "date": "<YYYY-MM-DD atau kosong>",\n  "type": "<expense atau income>",\n  "category": "<salah satu: '+cats+'>",\n  "note": "<deskripsi>",\n  "confidence": "<high/medium/low>",\n  "is_bill": <true jika tagihan PLN/PDAM/internet/pulsa/BPJS>,\n  "bill_type": "<pln/pdam/internet/phone/bpjs/other atau null>",\n  "bill_period": "<mis. Mei 2025 atau null>",\n  "bill_customer_id": "<nomor pelanggan atau null>",\n  "line_items": [{"name":"...","qty":1,"price":0}]\n}\nTotal = grand total bukan subtotal.';
  try {
    const text = await callAI('scan_receipt', prompt, scanImageData, mediaType);
    const parsed = JSON.parse(text.replace(/```json|```/g,'').trim());
    _scanIsAnalyzing = false;
    navigate('scan');
    showScanResult(parsed);
  } catch(e) {
    _scanIsAnalyzing = false;
    navigate('scan');
    showToast('Gagal menganalisis: ' + e.message, 'error');
  }
}
let _lastScanResult = null;
let _selectedScanAccountId = '';
function showScanResult(r) {
  _lastScanResult = r;
  _selectedScanAccountId = state.accounts[0]?.id || '';
  const resultArea = document.getElementById('scan-result-area');
  if (!resultArea) return;

  const catObj = getCatObj(r.category||'');
  const merchantInitial = (r.merchant||'?').charAt(0).toUpperCase();
  const confClass = r.confidence==='high'?'high':r.confidence==='medium'?'medium':'low';
  const confLabel = r.confidence==='high'?'✓ Akurat':r.confidence==='medium'?'~ Perlu dicek':'⚠ Kurang yakin';

  const itemsHtml = (r.line_items&&r.line_items.length) ? `
    <div class="result-items-card">
      <div class="result-items-header">
        <span style="font-size:13px;font-weight:700">Item Pembelian</span>
        <span style="font-size:12px;color:var(--text2)">${r.line_items.length} item</span>
      </div>
      ${r.line_items.map(item=>`
        <div class="result-item-row">
          <div class="result-item-icon">${catObj.icon||'🛍️'}</div>
          <div class="result-item-name">${item.name}</div>
          ${item.qty>1?`<span class="result-item-qty">x${item.qty}</span>`:''}
          <div class="result-item-price">Rp ${Number(item.price*item.qty).toLocaleString('id-ID')}</div>
        </div>`).join('')}
    </div>` : '';

  const billBadge = r.is_bill ? `
    <div style="display:inline-flex;align-items:center;gap:6px;background:rgba(122,184,245,0.15);color:var(--blue);padding:6px 14px;border-radius:20px;font-size:12px;font-weight:600;margin-top:10px">
      🧾 ${({pln:'Tagihan PLN',pdam:'Tagihan PDAM',internet:'Tagihan Internet',phone:'Pulsa / Paket',bpjs:'Iuran BPJS',other:'Tagihan Lain'}[r.bill_type])||'Tagihan Rutin'}
      ${r.bill_period?` · ${r.bill_period}`:''}
    </div>` : '';

  resultArea.innerHTML = `<div class="scan-result-wrap">
    <!-- Hero card -->
    <div class="result-hero">
      <div class="result-merchant-logo">${merchantInitial}</div>
      <div class="result-merchant-name">${r.merchant||'Merchant'}</div>
      <div class="result-date">${r.date?fmtDate(r.date):'Hari ini'}</div>
      <div class="result-amount-label">Total Pembayaran</div>
      <div class="result-amount">Rp ${Number(r.amount).toLocaleString('id-ID')}</div>
      <div><span class="result-confidence ${confClass}">${confLabel}</span></div>
      ${billBadge}
    </div>

    <!-- Detail card -->
    <div class="result-detail-card">
      <div class="result-detail-row">
        <span class="result-detail-label">Jenis</span>
        <span class="result-detail-val" style="color:${r.type==='income'?'var(--green)':'var(--red)'};font-size:15px;font-weight:700">${r.type==='income'?'💚 Pemasukan':'❤️ Pengeluaran'}</span>
      </div>
      <div class="result-detail-row">
        <span class="result-detail-label">Kategori</span>
        <span class="result-detail-val">${r.category||'—'}</span>
      </div>
      <div class="result-detail-row">
        <span class="result-detail-label">Catatan</span>
        <span class="result-detail-val" style="color:var(--text2)">${r.note||r.merchant||'—'}</span>
      </div>
      ${r.bill_customer_id?`<div class="result-detail-row">
        <span class="result-detail-label">No. Pelanggan</span>
        <span class="result-detail-val" style="font-family:monospace;font-size:13px">${r.bill_customer_id}</span>
      </div>`:''}
    </div>

    <!-- Items -->
    ${itemsHtml}

    <!-- Account selector -->
    <div class="account-selector">
      <div class="account-selector-label">Bayar dari rekening</div>
      <div class="account-chips">
        ${state.accounts.map(a=>`
          <div class="account-chip${a.id===_selectedScanAccountId?' selected':''}"
            onclick="selectScanAccount('${a.id}')">
            ${a.icon||'💳'} ${a.name}
          </div>`).join('')}
      </div>
    </div>

    <!-- Actions -->
    <div class="scan-action-btn scan-action-primary" onclick="saveScanTx(_lastScanResult)">
      <span class="action-icon">✓</span> Simpan Transaksi
    </div>
    <div class="scan-actions">
      <div class="scan-action-btn" onclick="goSplitFromScan(${r.amount},'${(r.note||r.merchant||'').replace(/'/g,'').replace(/"/g,'')}')">
        <span class="action-icon">🍽️</span>Split Bill
      </div>
      ${r.is_bill?`<div class="scan-action-btn" onclick="saveBillAsRecurring(_lastScanResult)">
        <span class="action-icon">🔄</span>Jadikan Rutin
      </div>`:`<div class="scan-action-btn" onclick="clearScan()">
        <span class="action-icon">📷</span>Scan Lagi
      </div>`}
    </div>
  </div>`;
}

function selectScanAccount(id) {
  _selectedScanAccountId = id;
  document.querySelectorAll('.account-chip').forEach(el => {
    el.classList.toggle('selected', el.onclick?.toString().includes(id));
  });
  // Re-render chips properly
  document.querySelectorAll('.account-chip').forEach(el => {
    const elId = el.getAttribute('onclick')?.match(/'([^']+)'/)?.[1];
    el.classList.toggle('selected', elId === id);
  });
}

function goSplitFromScan(amount, note) {
  splitState.totalAmount = amount;
  splitState.note = note;
  navigate('splitbill');
}

async function saveBillAsRecurring(r) {
  const name = r.merchant || r.note || 'Tagihan';
  const chosenCat = r.category || cats[cats.length-1];
  const freq = 'monthly';
  const accId = document.getElementById('scan-account')?.value || state.accounts[0]?.id;
  const {data,error} = await state.supabase.from('recurring').insert([{user_id:state.currentUser.id,name,type:'expense',amount:r.amount,category:chosenCat,account_id:accId,frequency:freq}]).select().single();
  if(error){showToast(error.message,'error');return;}
  state.recurring.push(data);
  showToast('Ditambahkan ke tagihan rutin! 🔄');
}

async function saveScanTx(r) {
  const account_id = _selectedScanAccountId || state.accounts[0]?.id;
  const date = r.date || new Date().toISOString().split('T')[0];
  const payload = {user_id:state.currentUser.id,type:r.type||'expense',amount:Number(r.amount),category:r.category||'📦 Lainnya',account_id,note:r.note||r.merchant,date};
  const {data,error} = await state.supabase.from('transactions').insert([payload]).select().single();
  if(error){showToast(error.message,'error');return;}
  state.transactions.unshift(data);
  await applyBalance(payload);
  clearScan();
  showToast('Transaksi disimpan dari struk!');
  navigate('transactions');
}



export { renderScan, doScan, clearScan, showScanResult, saveScanTx }

// Expose for inline onclick handlers
window.doScan = doScan
window.clearScan = clearScan
window.saveScanTx = saveScanTx
window.goSplitFromScan = goSplitFromScan
window.saveBillAsRecurring = saveBillAsRecurring
window.openScanCamera = openScanCamera
window.selectScanAccount = selectScanAccount
