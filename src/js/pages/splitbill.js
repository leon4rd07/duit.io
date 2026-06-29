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
import { extractJsonObject } from '../lib/jsonExtract.js'

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

  // Absorb a pending hand-off from scan.js's "Bagi dengan teman" button.
  // scan.js writes to state.sb (a separate object) since it doesn't have
  // access to this module's internal sbState — pick it up here and consume it.
  if (state.sb && (state.sb.totalAmount || (state.sb.items && state.sb.items.length))) {
    sbState.note = state.sb.note || '';
    sbState.totalAmount = state.sb.totalAmount || 0;
    sbState.subtotal = state.sb.subtotal || state.sb.totalAmount || 0;
    sbState.taxAmount = state.sb.taxAmount || 0;
    sbState.serviceAmount = state.sb.serviceAmount || 0;
    sbState.discountAmount = state.sb.discountAmount || 0;
    sbState.items = (state.sb.items || []).map(it => ({
      name: it.name || '?',
      qty: it.qty || 1,
      price: it.price || 0,
      assignedTo: sbState.members.map((_,i)=>i),
    }));
    sbState.step = 'bill_detail';
    state.sb = null; // consumed
  }

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
  // Explicit back-map (clearer than index-walking + override, which previously
  // caused bill_detail -> back -> 'scanning' -> immediately overridden back to
  // 'bill_detail' again, making the back button look stuck/unresponsive).
  const backMap = { bill_detail: 'home', members: 'bill_detail', assign: 'members', summary: 'assign' };
  sbState.step = backMap[sbState.step] || 'home';
  navigate('splitbill');
}

const SB_STEPS = ['bill_detail', 'members', 'assign', 'summary'];
function sbStepIndicator(current) {
  return `<div class="sb-steps">
    ${SB_STEPS.map((s,i) => `<div class="sb-step ${s===current?'active':SB_STEPS.indexOf(current)>i?'done':''}"></div>`).join('')}
  </div>`;
}

// ── HOME ──────────────────────────────────────────────────────────────
function sbRenderHome(area) {
  // Group split history by event. One split event creates one debt row PER
  // unpaid member, all sharing the exact same note text — group by that so
  // a 3-person split shows as ONE card (people + total), not 3 duplicate rows.
  const splitDebts = state.debts.filter(d => d.note?.toLowerCase().includes('split'));
  const groups = {};
  splitDebts.forEach(d => {
    const key = d.note || 'Split Bill';
    if (!groups[key]) groups[key] = { label: key.replace(/\s*—\s*bagian split/i,'') || 'Split Bill', members: [], total: 0, created_at: d.created_at };
    groups[key].members.push({ name: d.contact_name, settled: d.settled });
    groups[key].total += Number(d.amount);
    if (d.created_at && (!groups[key].created_at || new Date(d.created_at) > new Date(groups[key].created_at))) {
      groups[key].created_at = d.created_at;
    }
  });
  const splits = Object.values(groups)
    .sort((a,b) => new Date(b.created_at||0) - new Date(a.created_at||0))
    .slice(0, 5);

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
      ${splits.map(g => {
        const allSettled = g.members.every(m=>m.settled);
        const unpaidCount = g.members.filter(m=>!m.settled).length;
        return `
        <div class="sb-hist-item" style="margin-bottom:8px">
          <div class="sb-hist-icon">🍽️</div>
          <div style="flex:1">
            <div class="sb-hist-name">${g.label}</div>
            <div class="sb-hist-people">${g.members.map(m=>m.name).join(', ')}</div>
            <div class="sb-hist-status">${allSettled?'✓ Semua lunas':`${unpaidCount} dari ${g.members.length} belum bayar`}</div>
          </div>
          <div style="text-align:right">
            <div class="sb-hist-amount">${fmtShort(g.total)}</div>
            ${allSettled?`<span class="badge badge-green" style="margin-top:4px">Lunas</span>`:`<span class="badge badge-amber" style="margin-top:4px">Belum</span>`}
          </div>
        </div>`;
      }).join('')}
    </div>` : `
    <div style="margin-top:8px;padding:16px;text-align:center">
      <div style="font-size:12px;color:var(--text3)">Belum ada riwayat split bill. Setelah kamu selesai bikin split dan tap "Kirim ke anggota & Simpan", riwayatnya akan muncul di sini.</div>
    </div>`}
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
  const prompt = `Analisis struk/bon restoran ini dengan sangat detail. Kembalikan HANYA JSON valid:\n{"restaurant":"<nama>","items":[{"name":"<nama item>","qty":<angka>,"price":<harga per item Rupiah>}],"subtotal":<angka>,"tax_amount":<jumlah pajak Rupiah>,"service_amount":<jumlah service Rupiah>,"discount_amount":<jumlah diskon>,"total":<grand total Rupiah>}\nEkstrak SEMUA item kalau ada rinciannya. price = harga satuan SEBELUM dikali qty dan SEBELUM diskon. Kalau ada PB1/pajak/PPN hitung sebagai tax_amount. Kalau ada baris diskon/promo/saving, masukkan ke discount_amount. Kalau struk tidak punya rincian item (cth: struk pembayaran QR), kosongkan items jadi array kosong tapi tetap isi total dengan benar. Jangan tambahkan penjelasan apapun di luar JSON.`;
  let text = '';
  try {
    text = await callAI('split_bill_scan', prompt, sbState.scanImgData, sbState.scanImgMime);
    if (!text) throw new Error('Respons AI kosong');

    // Robust extraction — finds the true matching closing brace instead of a
    // greedy regex, so stray prose/braces after the JSON can't break parsing.
    const parsed = extractJsonObject(text);

    sbState.note = parsed.restaurant || '';
    sbState.items = (parsed.items||[]).map(it => ({
      name: it.name || '?',
      qty: Number(it.qty) || 1,
      price: Number(it.price) || 0,
      assignedTo: Array.from({length: sbState.members.length}, (_,i) => i) // all members by default
    }));
    sbState.subtotal = Number(parsed.subtotal) || sbState.items.reduce((s,it)=>s+(it.price*it.qty),0);
    sbState.taxAmount = Number(parsed.tax_amount) || 0;
    sbState.serviceAmount = Number(parsed.service_amount) || 0;
    sbState.discountAmount = Number(parsed.discount_amount) || 0;
    sbState.totalAmount = Number(parsed.total) || (sbState.subtotal + sbState.taxAmount + sbState.serviceAmount - sbState.discountAmount);
    sbState.step = 'bill_detail';
    navigate('splitbill');
  } catch(e) {
    console.warn('Split bill scan parse failed. Raw AI text:', text, e);
    showToast('Gagal baca struk: hasil AI tidak terbaca. Isi manual ya 🙏', 'error');
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
const SB_HISTORY_KEY = 'sb_member_history_v1';

function getMemberHistory() {
  try { return JSON.parse(localStorage.getItem(SB_HISTORY_KEY)) || []; } catch { return []; }
}
function addToMemberHistory(name) {
  if (!name || !name.trim()) return;
  let hist = getMemberHistory();
  hist = hist.filter(n => n.toLowerCase() !== name.toLowerCase()); // dedup, bump to front
  hist.unshift(name.trim());
  hist = hist.slice(0, 20); // keep most recent 20
  try { localStorage.setItem(SB_HISTORY_KEY, JSON.stringify(hist)); } catch {}
}

function sbRenderMembers(area) {
  const selected = sbState.members.filter(m => !m.isMe);
  const query = sbState.memberSearch.toLowerCase();
  const history = getMemberHistory();
  const suggestions = history.filter(n =>
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

    <!-- History (real names you've typed before — not generic placeholders) -->
    ${suggestions.length ? `
    <div class="sb-bill-card">
      <div style="font-size:12px;font-weight:700;color:var(--text3);padding:12px 16px 6px;text-transform:uppercase;letter-spacing:.4px">
        ${query ? 'Hasil pencarian' : 'Riwayat'}
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
    ` : (!sbState.memberSearch ? `
    <div class="sb-bill-card" style="padding:18px 16px;text-align:center">
      <div style="font-size:12px;color:var(--text3)">Belum ada riwayat nama. Ketik nama teman di atas untuk menambah — nama yang sudah dipakai bakal muncul di sini lain kali.</div>
    </div>
    ` : '')}

    <button class="sb-confirm-btn" onclick="sbGoToAssign()" ${selected.length===0?'style="opacity:.5;cursor:not-allowed"':''}>
      Konfirmasi anggota (${sbState.members.length} orang) →
    </button>
  </div>`;
}

function sbToggleMember(name) {
  const idx = sbState.members.findIndex(m=>m.name===name);
  if (idx >= 0) { sbState.members.splice(idx,1); }
  else { sbState.members.push({name, paid:false, isMe:false}); addToMemberHistory(name); }
  // Update item assignments
  sbState.items.forEach(it => { it.assignedTo = sbState.members.map((_,i)=>i); });
  navigate('splitbill');
}
function sbAddMemberByName(name) {
  if (!sbState.members.find(m=>m.name===name)) {
    sbState.members.push({name, paid:false, isMe:false});
    addToMemberHistory(name);
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
  const idx = it.assignedTo.indexOf(memberIdx);
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
    // Manual: equal split, no item-level detail available
    const perPerson = Math.floor(sbState.totalAmount / n);
    const rem = Math.round(sbState.totalAmount - perPerson * n);
    return sbState.members.map((m,i) => ({...m, share: perPerson + (i===0?rem:0), breakdown: []}));
  }
  // Item-based — track which items each member is paying for, and how much
  const subtotal = sbState.items.reduce((s,it)=>s+(it.price*it.qty),0);
  const extraRatio = subtotal > 0 ? sbState.totalAmount / subtotal : 1;
  return sbState.members.map((m,mi) => {
    let share = 0;
    const breakdown = [];
    sbState.items.forEach(it => {
      if (it.assignedTo.includes(mi)) {
        const rawShare = (it.price * it.qty) / it.assignedTo.length;
        share += rawShare;
        breakdown.push({
          name: it.name,
          splitCount: it.assignedTo.length,
          amount: Math.round(rawShare * extraRatio),
        });
      }
    });
    return {...m, share: Math.round(share * extraRatio), breakdown};
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
        <div class="sb-final-member-wrap">
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
          </div>
          ${m.breakdown && m.breakdown.length ? `
            <div class="sb-member-breakdown">
              ${m.breakdown.map(b => `<div class="sb-breakdown-row"><span>${b.name}${b.splitCount>1?` <span style="opacity:.6">(bagi ${b.splitCount})</span>`:''}</span><span>Rp ${b.amount.toLocaleString('id-ID')}</span></div>`).join('')}
            </div>
          ` : (sbState.items.length ? '' : `<div class="sb-member-breakdown-empty">Dibagi rata, tanpa rincian item</div>`)}
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
  const shares = sbCalcMemberShares();
  const lines = [`🍽️ *${sbState.note||'Split Bill'}*`, `Total: ${fmt(sbState.totalAmount)}`, ''];
  shares.forEach(m => {
    lines.push(`${m.isMe?'Saya':m.name}: Rp ${m.share.toLocaleString('id-ID')} ${m.paid?'✓':''}`);
    if (m.breakdown && m.breakdown.length) {
      m.breakdown.forEach(b => lines.push(`   • ${b.name}: Rp ${b.amount.toLocaleString('id-ID')}`));
    }
  });
  navigator.clipboard.writeText(lines.join('\n'));
  showToast('Disalin! Paste ke WhatsApp 📱');
}

async function sbFinalize() {
  const shares = sbCalcMemberShares();
  const myShare = shares[0]?.share || 0;
  const acId = sbState.payAccountId || state.accounts[0]?.id;
  const date = new Date().toISOString().split('T')[0];
  const note = sbState.note || 'Split Bill';

  try {
    // Save my own portion as a transaction — DB.createTransaction also
    // updates the account balance correctly (single source of truth for balance math).
    if (myShare > 0 && acId) {
      await DB.createTransaction({
        type: 'expense', amount: myShare, account_id: acId,
        category: 'Food', note, date,
      });
    }

    // Create piutang (lent) for members who haven't paid yet
    let debtCount = 0;
    for (let i = 1; i < shares.length; i++) {
      const m = shares[i];
      if (m.paid || m.share <= 0) continue;
      await DB.createDebt({
        contact_name: m.name, direction: 'lent',
        amount: m.share, remaining: m.share,
        note: `${note} — bagian split`, due_date: null,
      });
      debtCount++;
    }

    showToast(debtCount>0 ? `Split disimpan! ${debtCount} piutang dibuat 💚` : 'Split bill disimpan!');
    sbReset();
  } catch (e) {
    showToast('Gagal menyimpan split: ' + e.message, 'error');
  }
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
