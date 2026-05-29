// src/js/pages/splitbill.js
import { state }             from '../lib/store.js'
import { showToast }         from '../lib/toast.js'
import { navigate }          from '../lib/router.js'
import { fmt, fmtShort, fmtDate, monthKey, monthLabel } from '../lib/utils.js'
import { CATEGORIES, getCatGroups, getCatObj } from '../lib/categories.js'
import { AVATAR_COLORS }     from '../lib/config.js'
import * as DB                from '../lib/supabase.js'

import { callAI }    from '../lib/ai.js'
import { openCamera } from '../ui/camera.js'

// ===== SPLIT BILL v2 — GoPay-style flow =====
// State machine: 'home' | 'scanning' | 'bill_detail' | 'members' | 'assign' | 'summary'
// [removed duplicate: AVATAR_COLORS]

let sbState = {
  step: 'home',           // current step
  note: '',               // bill name
  totalAmount: 0,
  taxAmount: 0,
  serviceAmount: 0,
  discountAmount: 0,
  subtotal: 0,
  items: [],              // [{name, qty, price, assignedTo:[idx,...]}]
  members: [{name:'Saya', paid:true, isMe:true}], // always starts with "Saya"
  memberSearch: '',
  splitHistory: [],       // past splits (from debts)
  scanImgData: null,
  scanImgMime: 'image/jpeg',
  scanImgFull: '',        // full base64 for display
  payAccountId: '',
};

function renderSplitBill(area, actions) {
  sbState.payAccountId = sbState.payAccountId || state.accounts[0]?.id || '';
  actions.innerHTML = sbState.step !== 'home'
    ? `<button class="btn btn-ghost btn-sm" onclick="sbGoBack()">← Kembali</button>`
    : '';

  switch (sbState.step) {
    case 'home':     sbRenderHome(area); break;
    case 'scanning': sbRenderScanning(area); break;
    case 'bill_detail': sbRenderBillDetail(area); break;
    case 'members':  sbRenderMembers(area); break;
    case 'assign':   sbRenderAssign(area); break;
    case 'summary':  sbRenderSummary(area); break;
  }
}

function sbGoBack() {
  const steps = ['home','scanning','bill_detail','members','assign','summary'];
  const idx = steps.indexOf(sbState.step);
  sbState.step = steps[Math.max(0, idx-1)];
  if (sbState.step === 'scanning') sbState.step = 'bill_detail'; // skip re-scanning
  navigate('splitbill');
}

function sbStepIndicator(current) {
  return `<div class="sb-steps">
    ${steps.map((s,i) => `<div class="sb-step ${s===current?'active':steps.indexOf(current)>i?'done':''}"></div>`).join('')}
  </div>`;
}

// ── HOME ──────────────────────────────────────────────────────────────
function sbRenderHome(area) {
  // Get split history from debts
  const splits = state.debts.filter(d => d.note?.includes('split') || d.note?.includes('Split')).slice(0, 5);

  area.innerHTML = `<div class="sb-page">
    <div class="section-title">Bikin Split Bill Baru</div>

    <div class="sb-option-card" onclick="sbStartScan()">
      <div class="sb-option-icon" style="background:var(--accent-dim)">🧾</div>
      <div style="flex:1">
        <div class="sb-option-title">Hitung otomatis pakai struk</div>
        <div class="sb-option-sub">Foto struk atau ambil dari galeri</div>
      </div>
      <div class="sb-option-arrow">›</div>
    </div>

    <div class="sb-option-card" onclick="sbStartManual()">
      <div class="sb-option-icon" style="background:var(--green-dim)">✏️</div>
      <div style="flex:1">
        <div class="sb-option-title">Atur jumlahnya sendiri</div>
        <div class="sb-option-sub">Lebih cepat, bagi rata tanpa struk</div>
      </div>
      <div class="sb-option-arrow">›</div>
    </div>

    ${splits.length ? `
    <div style="margin-top:8px">
      <div class="section-title mb-10">Riwayat Split</div>
      ${splits.map(d => `
        <div class="sb-hist-item" style="margin-bottom:8px">
          <div class="sb-hist-icon">🍽️</div>
          <div style="flex:1">
            <div class="sb-hist-name">${d.note?.replace(/ — bagian split/,'') || 'Split Bill'}</div>
            <div class="sb-hist-people">${d.contact_name}</div>
            <div class="sb-hist-status">${d.settled?'✓ Lunas':'Menunggu pembayaran'}</div>
          </div>
          <div style="text-align:right">
            <div class="sb-hist-amount">${fmtShort(d.amount)}</div>
            ${!d.settled?`<span class="badge badge-amber" style="margin-top:4px">Belum</span>`:`<span class="badge badge-green" style="margin-top:4px">Lunas</span>`}
          </div>
        </div>`).join('')}
    </div>` : ''}
  </div>`;
}

// ── SCAN START ────────────────────────────────────────────────────────
function sbStartScan() {
  openCamera(async (dataUrl, base64, mime) => {
    sbState.scanImgFull = dataUrl;
    sbState.scanImgData = base64;
    sbState.scanImgMime = mime;
    sbState.step = 'scanning';
    navigate('splitbill');
    await sbDoScan();
  });
}

function sbStartManual() {
  sbState.items = [];
  sbState.totalAmount = 0;
  sbState.taxAmount = 0;
  sbState.serviceAmount = 0;
  sbState.subtotal = 0;
  sbState.note = '';
  sbState.step = 'bill_detail';
  navigate('splitbill');
}

// ── SCANNING (loading) ────────────────────────────────────────────────
function sbRenderScanning(area) {
  area.innerHTML = `<div style="min-height:60vh;display:flex;flex-direction:column;align-items:center;justify-content:center">
    <div class="sb-scan-loading">
      <img src="${sbState.scanImgFull}" style="width:120px;height:150px;object-fit:cover;border-radius:12px;margin-bottom:20px;border:2px solid var(--border2)"/>
      <div style="font-size:18px;font-weight:700;margin-bottom:8px">Membaca struk...</div>
      <div style="font-size:13px;color:var(--text2);margin-bottom:16px">AI sedang menganalisis struk kamu</div>
      <div class="sb-scan-progress" style="width:240px"><div class="sb-scan-bar"></div></div>
    </div>
  </div>`;
}

async function sbDoScan() {
  const prompt = `Analisis struk/bon restoran ini dengan sangat detail. Kembalikan HANYA JSON valid:\n{"restaurant":"<nama>","items":[{"name":"<nama item>","qty":<angka>,"price":<harga per item Rupiah>}],"subtotal":<angka>,"tax_amount":<jumlah pajak Rupiah>,"service_amount":<jumlah service Rupiah>,"discount_amount":<jumlah diskon>,"total":<grand total Rupiah>}\nEkstrak SEMUA item. price = harga satuan sebelum dikali qty. Kalau ada PB1/pajak hitung sebagai tax_amount.`;
  try {
    const text = await callAI('split_bill_scan', prompt, sbState.scanImgData, sbState.scanImgMime);
    const parsed = JSON.parse(text.replace(/```json|```/g,'').trim());
    sbState.note = parsed.restaurant || '';
    sbState.items = (parsed.items||[]).map(it => ({
      ...it,
      assignedTo: Array.from({length: sbState.members.length}, (_,i) => i) // all members by default
    }));
    sbState.subtotal = parsed.subtotal || 0;
    sbState.taxAmount = parsed.tax_amount || 0;
    sbState.serviceAmount = parsed.service_amount || 0;
    sbState.discountAmount = parsed.discount_amount || 0;
    sbState.totalAmount = parsed.total || (sbState.subtotal + sbState.taxAmount + sbState.serviceAmount - sbState.discountAmount);
    sbState.step = 'bill_detail';
    navigate('splitbill');
  } catch(e) {
    showToast('Gagal baca struk: ' + e.message, 'error');
    sbState.step = 'bill_detail';
    navigate('splitbill');
  }
}

// ── BILL DETAIL ───────────────────────────────────────────────────────
function sbRenderBillDetail(area) {
  const hasItems = sbState.items.length > 0;

  area.innerHTML = `<div class="sb-page">
    ${sbStepIndicator('bill_detail')}

    <!-- Bill name -->
    <div class="sb-bill-card">
      <div class="sb-bill-header">
        <div>
          <div style="font-size:12px;color:var(--text2);margin-bottom:4px">Nama split bill</div>
          <input type="text" value="${sbState.note}" placeholder="mis. Makan Shihlin, Nonton bareng..."
            style="background:transparent;border:none;font-size:18px;font-weight:700;color:var(--text);outline:none;width:100%;font-family:inherit"
            oninput="sbState.note=this.value"/>
        </div>
        ${sbState.scanImgFull?`
          <div style="display:flex;align-items:center;gap:10px">
            <img src="${sbState.scanImgFull}" style="width:56px;height:56px;object-fit:cover;border-radius:10px;border:1px solid var(--border2)"/>
<button class="btn btn-ghost btn-sm" onclick="sbStartScan()">📷 Foto ulang</button>
          </div>`:''
        }
      </div>
    </div>

    <!-- Items -->
    ${hasItems ? `
    <div class="sb-bill-card">
      <div class="sb-bill-header">
        <span style="font-size:14px;font-weight:700">${sbState.items.length} Item</span>
        <button class="btn btn-ghost btn-sm" onclick="sbAddItem()">+ Tambah item</button>
      </div>
      ${sbState.items.map((it,i) => `
        <div class="sb-bill-row item">
          <div class="sb-bill-item-name">${it.name}</div>
          <span class="sb-bill-item-qty">x${it.qty}</span>
          <span style="font-weight:600;min-width:70px;text-align:right">Rp ${(it.price*it.qty).toLocaleString('id-ID')}</span>
          <button onclick="sbRemoveItem(${i})" style="background:none;border:none;color:var(--text3);cursor:pointer;font-size:16px;margin-left:8px">×</button>
        </div>`).join('')}
    </div>` :
    `<button class="sb-option-card" onclick="sbAddItem()" style="border-style:dashed">
      <div class="sb-option-icon" style="background:var(--bg3)">+</div>
      <div><div class="sb-option-title">Tambah item manual</div><div class="sb-option-sub">Atau scan struk untuk deteksi otomatis</div></div>
    </button>`}

    <!-- Totals -->
    <div class="sb-bill-card">
      <div class="sb-bill-row subtotal">
        <span>Subtotal</span>
        <span>Rp ${(sbState.subtotal||sbState.totalAmount).toLocaleString('id-ID')}</span>
      </div>
      ${sbState.taxAmount>0?`<div class="sb-bill-row subtotal"><span>Pajak</span><span>Rp ${sbState.taxAmount.toLocaleString('id-ID')}</span></div>`:''}
      ${sbState.serviceAmount>0?`<div class="sb-bill-row subtotal"><span>Servis</span><span>Rp ${sbState.serviceAmount.toLocaleString('id-ID')}</span></div>`:''}
      ${sbState.discountAmount>0?`<div class="sb-bill-row subtotal"><span style="color:var(--green)">Diskon</span><span style="color:var(--green)">-Rp ${sbState.discountAmount.toLocaleString('id-ID')}</span></div>`:''}
      <div class="sb-bill-row total">
        <span>Jumlah total</span>
        <span style="color:var(--accent)">Rp ${sbState.totalAmount.toLocaleString('id-ID')}</span>
      </div>
    </div>

    <!-- Manual total input if no items -->
    ${!hasItems ? `
    <div class="sb-bill-card" style="padding:16px 18px">
      <div style="font-size:12px;color:var(--text2);margin-bottom:8px;font-weight:600;text-transform:uppercase;letter-spacing:.4px">Total tagihan</div>
      <div style="display:flex;align-items:center;gap:6px">
        <span style="font-size:22px;font-weight:700;color:var(--text2)">Rp</span>
        <input type="number" value="${sbState.totalAmount||''}" placeholder="0"
          style="flex:1;background:transparent;border:none;font-size:32px;font-weight:800;color:var(--accent);outline:none;font-family:inherit"
          oninput="sbState.totalAmount=parseFloat(this.value)||0;sbState.subtotal=sbState.totalAmount"/>
      </div>
    </div>` : ''}

    <button class="sb-confirm-btn" onclick="sbGoToMembers()">Konfirmasi →</button>
  </div>`;
}

function sbAddItem() {
  const name = prompt('Nama item:');
  if (!name) return;
  const qty = parseInt(prompt('Jumlah:') || '1');
  const price = parseFloat(prompt('Harga per item (Rp):') || '0');
  if (!price) return;
  sbState.items.push({name, qty: qty||1, price, assignedTo: sbState.members.map((_,i)=>i)});
  sbState.subtotal = sbState.items.reduce((s,it)=>s+(it.price*it.qty),0);
  sbState.totalAmount = sbState.subtotal + sbState.taxAmount + sbState.serviceAmount - sbState.discountAmount;
  navigate('splitbill');
}

function sbRemoveItem(i) {
  sbState.items.splice(i,1);
  sbState.subtotal = sbState.items.reduce((s,it)=>s+(it.price*it.qty),0);
  sbState.totalAmount = sbState.subtotal + sbState.taxAmount + sbState.serviceAmount - sbState.discountAmount;
  navigate('splitbill');
}

function sbGoToMembers() {
  if (!sbState.note && !sbState.totalAmount) { showToast('Isi nama dan total dulu','error'); return; }
  sbState.step = 'members';
  navigate('splitbill');
}

// ── MEMBERS ───────────────────────────────────────────────────────────
const SUGGESTED_MEMBERS = ['Budi','Siti','Reza','Andi','Dewi','Kevin','Putri','Farhan','Nadia'];

function sbRenderMembers(area) {
  const selected = sbState.members.filter(m => !m.isMe);
  const query = sbState.memberSearch.toLowerCase();
  const suggestions = SUGGESTED_MEMBERS.filter(n =>
    !sbState.members.find(m=>m.name===n) && (!query || n.toLowerCase().includes(query))
  );

  area.innerHTML = `<div class="sb-page">
    ${sbStepIndicator('members')}

    <!-- Payer info -->
    <div class="sb-bill-card" style="padding:16px 18px">
      <div style="display:flex;align-items:center;gap:12px;margin-bottom:16px;padding-bottom:16px;border-bottom:1px solid var(--border)">
        <div style="flex:1">
          <div style="font-size:12px;color:var(--text2);margin-bottom:4px">Bayar ke</div>
          <div style="font-size:13px;font-weight:600">Saya</div>
        </div>
        <div style="flex:1">
          <div style="font-size:12px;color:var(--text2);margin-bottom:4px">Dari rekening</div>
          <select style="background:transparent;border:none;font-size:13px;font-weight:600;color:var(--text);outline:none;cursor:pointer;font-family:inherit"
            onchange="sbState.payAccountId=this.value">
            ${state.accounts.map(a=>`<option value="${a.id}" ${a.id===sbState.payAccountId?'selected':''}>${a.name}</option>`).join('')}
          </select>
        </div>
      </div>

      <!-- Selected members -->
      ${selected.length ? `
      <div style="font-size:12px;color:var(--text2);margin-bottom:8px">${selected.length} anggota dipilih</div>
      <div class="sb-selected-wrap">
        <div class="sb-selected-chip">👤 Saya</div>
        ${selected.map((m,_) => `
          <div class="sb-selected-chip" onclick="sbRemoveMember('${m.name}')" style="cursor:pointer">
            ${m.name} <span style="opacity:.6">×</span>
          </div>`).join('')}
      </div>` : `
      <div style="font-size:12px;color:var(--amber);font-weight:600">⚠ Pilih minimal 1 anggota lagi</div>`}
    </div>

    <!-- Search -->
    <input class="sb-member-search" type="text" placeholder="Cari atau ketik nama..."
      value="${sbState.memberSearch}"
      oninput="sbState.memberSearch=this.value;renderSplitBill(document.getElementById('content-area'),document.getElementById('topbar-actions'))"/>

    <!-- Add by name (if typed and not in list) -->
    ${sbState.memberSearch && !sbState.members.find(m=>m.name.toLowerCase()===sbState.memberSearch.toLowerCase()) ? `
    <div class="sb-bill-card" style="margin-bottom:10px">
      <div class="sb-member-item" onclick="sbAddMemberByName('${sbState.memberSearch}')">
        <div class="sb-member-avatar" style="background:var(--accent-dim);color:var(--accent)">+</div>
        <div class="sb-member-info">
          <div class="sb-member-name">Tambah "${sbState.memberSearch}"</div>
          <div class="sb-member-sub">Di luar kontak</div>
        </div>
        <div class="sb-member-check checked">+</div>
      </div>
    </div>` : ''}

    <!-- Suggestions -->
    <div class="sb-bill-card">
      <div style="font-size:12px;font-weight:700;color:var(--text3);padding:12px 16px 6px;text-transform:uppercase;letter-spacing:.4px">
        ${query ? 'Hasil pencarian' : 'Rekomendasi'}
      </div>
      ${suggestions.slice(0,8).map(name => {
        const isSelected = sbState.members.find(m=>m.name===name);
        return `<div class="sb-member-item" onclick="sbToggleMember('${name}')">
          <div class="sb-member-avatar" style="background:${AVATAR_COLORS[name.charCodeAt(0)%8]}22;color:${AVATAR_COLORS[name.charCodeAt(0)%8]}">${name.charAt(0)}</div>
          <div class="sb-member-info">
            <div class="sb-member-name">${name}</div>
          </div>
          <div class="sb-member-check ${isSelected?'checked':''}">${isSelected?'✓':''}</div>
        </div>`;}).join('')}
    </div>

    <button class="sb-confirm-btn" onclick="sbGoToAssign()" ${selected.length===0?'style="opacity:.5;cursor:not-allowed"':''}>
      Konfirmasi anggota (${sbState.members.length} orang) →
    </button>
  </div>`;
}

function sbToggleMember(name) {
  if (idx >= 0) { sbState.members.splice(idx,1); }
  else { sbState.members.push({name, paid:false, isMe:false}); }
  // Update item assignments
  sbState.items.forEach(it => { it.assignedTo = sbState.members.map((_,i)=>i); });
  navigate('splitbill');
}
function sbAddMemberByName(name) {
  if (!sbState.members.find(m=>m.name===name)) {
    sbState.members.push({name, paid:false, isMe:false});
    sbState.items.forEach(it => { it.assignedTo = sbState.members.map((_,i)=>i); });
  }
  sbState.memberSearch = '';
  navigate('splitbill');
}
function sbRemoveMember(name) {
  sbState.members = sbState.members.filter(m=>m.isMe||m.name!==name);
  sbState.items.forEach(it => { it.assignedTo = sbState.members.map((_,i)=>i); });
  navigate('splitbill');
}

function sbGoToAssign() {
  if (sbState.members.length < 2) { showToast('Pilih minimal 1 anggota lagi','error'); return; }
  // If no items (manual mode), skip to summary
  if (!sbState.items.length) { sbState.step = 'summary'; navigate('splitbill'); return; }
  sbState.step = 'assign';
  navigate('splitbill');
}

// ── ASSIGN ITEMS ──────────────────────────────────────────────────────
function sbRenderAssign(area) {
  const subtotal = sbState.items.reduce((s,it)=>s+(it.price*it.qty),0);
  const assigned = sbState.items.filter(it=>it.assignedTo.length>0).length;

  area.innerHTML = `<div class="sb-page">
    ${sbStepIndicator('assign')}

    <div style="font-size:13px;color:var(--text2);margin-bottom:4px;text-align:center">
      Pilih siapa yang memesan setiap item
    </div>

    <!-- Bagi rata button -->
    <button onclick="sbEqualizeAll()" style="background:var(--green-dim);color:var(--green);border:1px solid rgba(94,201,126,0.25);border-radius:20px;padding:8px 20px;font-size:13px;font-weight:600;cursor:pointer;margin:0 auto;display:block;font-family:inherit">
      ⚖️ Bagi rata semuanya
    </button>

    ${sbState.items.map((it,i) => `
      <div class="sb-assign-item">
        <div class="sb-assign-item-header">
          <div class="sb-assign-item-name">${it.name} <span style="color:var(--text2);font-size:12px">x${it.qty}</span></div>
          <div class="sb-assign-item-price">Rp ${(it.price*it.qty).toLocaleString('id-ID')}</div>
        </div>
        <div class="sb-assign-avatars">
          ${sbState.members.map((m,mi) => {
            const sel = it.assignedTo.includes(mi);
            const color = AVATAR_COLORS[mi%8];
            return `<div class="sb-assign-avatar ${sel?'selected':''}" onclick="sbToggleItemAssign(${i},${mi})">
              <div class="sb-assign-avatar-dot" style="background:${color}22;color:${color}">${(m.name||'?').charAt(0)}</div>
              ${m.isMe?'Saya':m.name}
            </div>`;
          }).join('')}
        </div>
      </div>`).join('')}

    <!-- Summary count -->
    <div style="text-align:center;background:var(--green-dim);border-radius:12px;padding:12px;border:1px solid rgba(94,201,126,0.2)">
      <div style="font-size:14px;font-weight:700;color:var(--green)">${assigned} dari ${sbState.items.length} pesanan dihitung</div>
      <div style="font-size:12px;color:var(--text2);margin-top:2px">${assigned===sbState.items.length?'Semua biaya sudah masuk itungan':'Pastikan semua item sudah di-assign'}</div>
    </div>

    <button class="sb-confirm-btn" onclick="sbGoToSummary()">Lihat pembagian →</button>
  </div>`;
}

function sbToggleItemAssign(itemIdx, memberIdx) {
  const it = sbState.items[itemIdx];
  if (idx >= 0) it.assignedTo.splice(idx,1);
  else it.assignedTo.push(memberIdx);
  navigate('splitbill');
}
function sbEqualizeAll() {
  sbState.items.forEach(it => { it.assignedTo = sbState.members.map((_,i)=>i); });
  navigate('splitbill');
}
function sbGoToSummary() {
  sbState.step = 'summary';
  navigate('splitbill');
}

// ── SUMMARY ───────────────────────────────────────────────────────────
function sbCalcMemberShares() {
  const n = sbState.members.length;
  if (!sbState.items.length) {
    // Manual: equal split
    const perPerson = Math.floor(sbState.totalAmount / n);
    const rem = Math.round(sbState.totalAmount - perPerson * n);
    return sbState.members.map((m,i) => ({...m, share: perPerson + (i===0?rem:0)}));
  }
  // Item-based
  const extraRatio = subtotal > 0 ? sbState.totalAmount / subtotal : 1;
  return sbState.members.map((m,mi) => {
    let share = 0;
    sbState.items.forEach(it => {
      if (it.assignedTo.includes(mi)) {
        share += (it.price * it.qty) / it.assignedTo.length;
      }
    });
    return {...m, share: Math.round(share * extraRatio)};
  });
}

function sbRenderSummary(area) {
  const shares = sbCalcMemberShares();
  const myShare = shares[0]?.share || 0;
  const others = shares.slice(1);

  area.innerHTML = `<div class="sb-page">
    ${sbStepIndicator('summary')}

    <!-- My share hero -->
    <div class="result-hero" style="text-align:center">
      <div style="font-size:13px;color:var(--text2);margin-bottom:4px">${sbState.note||'Split Bill'}</div>
      <div class="result-amount-label">Bagian kamu</div>
      <div class="result-amount">Rp ${myShare.toLocaleString('id-ID')}</div>
      <div style="font-size:12px;color:var(--text2);margin-top:8px">dari total Rp ${sbState.totalAmount.toLocaleString('id-ID')}</div>
    </div>

    <!-- All members -->
    <div class="sb-bill-card" style="padding:16px 18px">
      <div style="font-size:13px;font-weight:700;margin-bottom:14px">Tagihan per orang</div>
      ${shares.map((m,i) => `
        <div class="sb-final-member">
          <div class="sb-final-avatar" style="background:${AVATAR_COLORS[i%8]}22;color:${AVATAR_COLORS[i%8]}">${(m.name||'?').charAt(0)}</div>
          <div style="flex:1">
            <div style="font-size:14px;font-weight:700">${m.isMe?'Saya (kamu)':m.name}</div>
            <div class="sb-final-status" style="color:${m.paid?'var(--green)':'var(--text3)'}">${m.paid?'✓ Sudah bayar':'Belum bayar'}</div>
          </div>
          <div style="text-align:right">
            <div class="sb-final-amount">Rp ${m.share.toLocaleString('id-ID')}</div>
            ${!m.isMe?`<button class="btn btn-sm btn-ghost" style="margin-top:4px;font-size:11px" onclick="sbTogglePaid(${i})">
              ${m.paid?'Batalkan':'Tandai bayar'}
            </button>`:''}
          </div>
        </div>`).join('')}
    </div>

    <!-- Actions -->
    <button class="sb-confirm-btn" onclick="sbFinalize()">
      ✓ Kirim ke anggota & Simpan
    </button>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-top:8px">
      <div class="scan-action-btn" onclick="sbCopyWA()">
        <span class="action-icon">📋</span>Salin ke WA
      </div>
      <div class="scan-action-btn" onclick="sbReset()">
        <span class="action-icon">🔄</span>Mulai baru
      </div>
    </div>
  </div>`;
}

function sbTogglePaid(memberIdx) {
  sbState.members[memberIdx].paid = !sbState.members[memberIdx].paid;
  navigate('splitbill');
}

function sbCopyWA() {
  const lines = [`🍽️ *${sbState.note||'Split Bill'}*`, `Total: ${fmt(sbState.totalAmount)}`, ''];
  shares.forEach(m => {
    lines.push(`${m.isMe?'Saya':m.name}: Rp ${m.share.toLocaleString('id-ID')} ${m.paid?'✓':''}`);
  });
  navigator.clipboard.writeText(lines.join('\n'));
  showToast('Disalin! Paste ke WhatsApp 📱');
}

async function sbFinalize() {
  const acId = sbState.payAccountId || state.accounts[0]?.id;
  const date = new Date().toISOString().split('T')[0];
  const note = sbState.note || 'Split Bill';

  // Save my transaction
  if (myShare > 0 && acId) {
    const payload = {user_id:state.currentUser.id,type:'expense',amount:myShare,category:'🍜 Food',account_id:acId,note,date};
    const {data,error} = await state.supabase.from('transactions').insert([payload]).select().single();
    if (!error && data) { state.transactions.unshift(data); await applyBalance(payload); }
  }

  // Create piutang for unpaid members
  let debtCount = 0;
  for (let i = 1; i < shares.length; i++) {
    const m = shares[i];
    if (m.paid) continue;
    const {data:d} = await state.supabase.from('debts').insert([{
      user_id:state.currentUser.id, contact_name:m.name, direction:'lent',
      amount:m.share, remaining:m.share, note:`${note} — bagian split`, due_date:null
    }]).select().single();
    if (d) { state.debts.unshift(d); debtCount++; }
  }

  showToast(debtCount>0 ? `Split disimpan! ${debtCount} piutang dibuat 💚` : 'Split bill disimpan!');
  sbReset();
}

function sbReset() {
  sbState = {
    step:'home', note:'', totalAmount:0, taxAmount:0, serviceAmount:0, discountAmount:0, subtotal:0,
    items:[], members:[{name:'Saya',paid:true,isMe:true}],
    memberSearch:'', scanImgData:null, scanImgMime:'image/jpeg', scanImgFull:'', payAccountId: state.accounts[0]?.id||''
  };
  navigate('splitbill');
}

// Legacy compat
function resetSplit() { sbReset(); }
function goSplitFromScan(amount, note) {
  sbState.totalAmount = amount;
  sbState.subtotal = amount;
  sbState.note = note;
  sbState.step = 'bill_detail';
  navigate('splitbill');
}


export { renderSplitBill, sbReset }

// Expose all sb* functions for inline onclick
window.sbGoBack         = sbGoBack
window.sbStartScan      = sbStartScan
window.sbStartManual    = sbStartManual
window.sbGoToMembers    = sbGoToMembers
window.sbGoToAssign     = sbGoToAssign
window.sbGoToSummary    = sbGoToSummary
window.sbToggleMember   = sbToggleMember
window.sbAddMemberByName= sbAddMemberByName
window.sbRemoveMember   = sbRemoveMember
window.sbToggleItemAssign= sbToggleItemAssign
window.sbEqualizeAll    = sbEqualizeAll
window.sbAddItem        = sbAddItem
window.sbRemoveItem     = sbRemoveItem
window.sbFinalize       = sbFinalize
window.sbCopyWA         = sbCopyWA
window.sbReset          = sbReset
window.sbTogglePaid     = sbTogglePaid
window.renderSplitBill  = renderSplitBill
