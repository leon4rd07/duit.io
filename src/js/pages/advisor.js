// src/js/pages/advisor.js
import { state }             from '../lib/store.js'
import { showToast }         from '../lib/toast.js'
import { navigate }          from '../lib/router.js'
import { fmt, fmtShort, fmtDate, monthKey, monthLabel } from '../lib/utils.js'
import { CATEGORIES, getCatGroups, getCatObj } from '../lib/categories.js'
import { AVATAR_COLORS }     from '../lib/config.js'
import * as DB                from '../lib/supabase.js'

import { callAI } from '../lib/ai.js'
import { ACTION_DEFINITIONS, parseActions, describeAction, executeAction } from '../lib/aiActions.js'

let advisorHistory = []
let advisorTyping  = false
let advisorPendingImage = null // { base64, mimeType, dataUrl, name } — staged before send

// ===== AI FINANCIAL ADVISOR =====

function buildFinancialContext() {
  const now = new Date();
  const mk = monthKey(now);
  const prev = new Date(now.getFullYear(), now.getMonth()-1, 1);
  const pmk = monthKey(prev);

  const thisMonthTx = state.transactions.filter(t => t.date?.startsWith(mk));
  const lastMonthTx = state.transactions.filter(t => t.date?.startsWith(pmk));

  const income  = n => state.transactions.filter(t=>t.type==='income'&&t.date?.startsWith(n)).reduce((s,t)=>s+Number(t.amount),0);
  const expense = n => state.transactions.filter(t=>t.type==='expense'&&t.date?.startsWith(n)).reduce((s,t)=>s+Number(t.amount),0);

  const thisIncome  = income(mk);
  const thisExpense = expense(mk);
  const lastIncome  = income(pmk);
  const lastExpense = expense(pmk);

  // Category breakdown this month — separate real spending from balance adjustments
  const ADJUST_CATS = ['Penyesuaian', 'Penyesuaian Saldo', 'Adjustment'];
  const catBreakdown = {};
  let adjustExpenseTotal = 0;
  thisMonthTx.filter(t=>t.type==='expense').forEach(t=>{
    const c = t.category||'Lainnya';
    if (ADJUST_CATS.includes(c)) { adjustExpenseTotal += Number(t.amount); return; }
    catBreakdown[c] = (catBreakdown[c]||0) + Number(t.amount);
  });
  const topCats = Object.entries(catBreakdown)
    .sort((a,b)=>b[1]-a[1])
    .map(([c,v])=>`${c}: Rp ${Math.round(v).toLocaleString('id-ID')}`)
    .join(', ');
  // Real spending excludes adjustments (the meaningful number for advice)
  const realExpense = thisExpense - adjustExpenseTotal;

  // Budget status
  const budgetStatus = state.budgets
    .filter(b=>b.month===mk)
    .map(b=>{
      const spent = catBreakdown[b.category]||0;
      const pct = Math.round((spent/b.limit_amount)*100);
      return `${b.category}: ${pct}% dari Rp ${Math.round(b.limit_amount).toLocaleString('id-ID')}`;
    }).join(', ');

  // Active debts with short IDs
  const activeDebts = state.debts.filter(d=>!d.settled);
  const totalLent = activeDebts.filter(d=>d.direction==='lent').reduce((s,d)=>s+Number(d.remaining),0);
  const totalOwe  = activeDebts.filter(d=>d.direction==='owe').reduce((s,d)=>s+Number(d.remaining),0);
  const debtList = activeDebts.slice(0, 20).map(d => {
    const shortId = (d.id||'').substring(0, 8);
    const dir = d.direction === 'lent' ? 'piutang' : 'hutang';
    return `[${shortId}] ${d.contact_name} ${dir} Rp ${Math.round(d.remaining).toLocaleString('id-ID')}`;
  }).join(' | ') || 'Tidak ada';

  // Active wishlist items with short IDs and daily savings calc
  const planningWl = (state.wishlist || []).filter(w => w.status === 'planning');
  const totalWlNeeded = planningWl.reduce((s,w) => s + Number(w.price), 0);
  const totalWlSaved  = planningWl.reduce((s,w) => s + Number(w.saved_amount||0), 0);
  const wishlistList = planningWl.slice(0, 15).map(w => {
    const shortId = (w.id||'').substring(0, 8);
    const saved = Number(w.saved_amount||0);
    const price = Number(w.price);
    const remaining = Math.max(0, price - saved);
    const pct = price > 0 ? Math.round((saved/price)*100) : 0;
    const prLabel = {1:'tinggi', 2:'sedang', 3:'rendah'}[w.priority||2];
    let dailyInfo = '';
    if (w.target_date) {
      const today = new Date(); today.setHours(0,0,0,0);
      const target = new Date(w.target_date); target.setHours(0,0,0,0);
      const days = Math.ceil((target - today)/86400000);
      if (days > 0 && remaining > 0) {
        const daily = remaining / days;
        dailyInfo = ` target ${w.target_date} (${days} hari, butuh Rp ${Math.round(daily).toLocaleString('id-ID')}/hari)`;
      } else if (days <= 0 && remaining > 0) {
        dailyInfo = ` target ${w.target_date} ⚠️ LEWAT`;
      } else if (remaining <= 0) {
        dailyInfo = ' 🎉 SIAP DIBELI';
      }
    }
    return `[${shortId}] "${w.name}" Rp ${Math.round(price).toLocaleString('id-ID')} prio ${prLabel} progres ${pct}%${dailyInfo}`;
  }).join('\n') || '(tidak ada wishlist aktif)';

  // 6-month net savings
  const sixMonthNet = [];
  for(let i=5;i>=0;i--){
    const d=new Date(now.getFullYear(),now.getMonth()-i,1);
    const k=monthKey(d);
    const net=income(k)-expense(k);
    sixMonthNet.push(`${d.toLocaleDateString('id-ID',{month:'short'})}: Rp ${Math.round(net).toLocaleString('id-ID')}`);
  }

  const totalBalance = state.accounts.reduce((s,a)=>s+Number(a.balance),0);
  const userName = (state.currentUser?.user_metadata?.full_name || 'Pengguna').split(' ')[0];

  // Recent transactions with short IDs (last 20)
  const recentTx = state.transactions.slice(0, 20).map(t => {
    const shortId = (t.id||'').substring(0, 8);
    const acc = state.accounts.find(a => a.id === t.account_id);
    const accName = acc ? acc.name : '?';
    const typeShort = { expense: 'Out', income: 'In', transfer: 'Tf' }[t.type] || t.type;
    return `[${shortId}] ${t.date} ${typeShort} Rp ${Math.round(t.amount).toLocaleString('id-ID')} · ${t.category||'Transfer'} · ${accName}${t.note?' · '+t.note:''}`;
  }).join('\n');

  // Available categories
  const expenseCats = getCatGroups('expense');
  const incomeCats = getCatGroups('income');
  const flatExpenseCats = Object.values(expenseCats).flat().map(c => `${c.icon} ${c.name}`).join(', ');
  const flatIncomeCats  = Object.values(incomeCats).flat().map(c => `${c.icon} ${c.name}`).join(', ');

  return `Kamu adalah AI Financial Advisor untuk aplikasi duit.io. Nama pengguna: ${userName}.

DATA KEUANGAN REAL-TIME (${now.toLocaleDateString('id-ID',{month:'long',year:'numeric'})}):
- Total saldo semua rekening: Rp ${Math.round(totalBalance).toLocaleString('id-ID')}
- Rekening: ${state.accounts.map(a=>`${a.name} (${a.bank}): Rp ${Math.round(a.balance).toLocaleString('id-ID')}`).join(', ') || 'Belum ada'}
- Pemasukan bulan ini: Rp ${Math.round(thisIncome).toLocaleString('id-ID')} (bulan lalu: Rp ${Math.round(lastIncome).toLocaleString('id-ID')})
- Pengeluaran RIIL bulan ini (di luar penyesuaian saldo): Rp ${Math.round(realExpense).toLocaleString('id-ID')} (bulan lalu: Rp ${Math.round(lastExpense).toLocaleString('id-ID')})
${adjustExpenseTotal > 0 ? `- Penyesuaian saldo manual bulan ini: Rp ${Math.round(adjustExpenseTotal).toLocaleString('id-ID')} (INI BUKAN PENGELUARAN RIIL — hanya koreksi saldo. JANGAN masukkan ke analisis pengeluaran atau saran penghematan)` : ''}
- Net riil bulan ini (pemasukan − pengeluaran riil): Rp ${Math.round(thisIncome-realExpense).toLocaleString('id-ID')}
- Pengeluaran per kategori bulan ini (sudah TIDAK termasuk penyesuaian): ${topCats || 'Belum ada transaksi'}
- Status anggaran: ${budgetStatus || 'Belum ada anggaran'}
- Hutang saya: Rp ${Math.round(totalOwe).toLocaleString('id-ID')}
- Piutang (orang lain hutang ke saya): Rp ${Math.round(totalLent).toLocaleString('id-ID')}
- Hutang/Piutang aktif (dengan id): ${debtList}
- Wishlist: ${planningWl.length} item aktif, total butuh Rp ${Math.round(totalWlNeeded).toLocaleString('id-ID')}, sudah ditabung Rp ${Math.round(totalWlSaved).toLocaleString('id-ID')}
- Net tabungan 6 bulan terakhir: ${sixMonthNet.join(' | ')}
- Total transaksi tercatat: ${state.transactions.length}
- Transaksi rutin terdaftar: ${state.recurring.map(r=>r.name).join(', ') || 'Belum ada'}

20 TRANSAKSI TERAKHIR (dengan id pendek untuk referensi hapus):
${recentTx || '(belum ada transaksi)'}

WISHLIST AKTIF (dengan id pendek untuk referensi):
${wishlistList}

KATEGORI PENGELUARAN TERSEDIA: ${flatExpenseCats}
KATEGORI PEMASUKAN TERSEDIA: ${flatIncomeCats}

INSTRUKSI UMUM:
- Kamu adalah penasihat keuangan yang benar-benar peduli pada kesehatan finansial ${userName}. Tujuanmu: membantu mereka membuat keputusan keuangan yang lebih baik, bukan sekadar membacakan ulang angka.
- Jawab dalam Bahasa Indonesia yang hangat, santai, tapi tetap kredibel — seperti teman yang paham keuangan.
- SELALU mulai dengan menjawab pertanyaan yang ditanyakan secara langsung dan spesifik, baru beri konteks pendukung.
- Berikan insight yang TIDAK terlihat dari sekadar melihat angka: pola pengeluaran, tren naik/turun, rasio tabungan, area yang berisiko, peluang yang terlewat.
- Saran harus KONKRET dan bisa langsung dilakukan. Contoh buruk: "kurangi pengeluaran". Contoh baik: "pengeluaran Food kamu Rp 649rb bulan ini, naik dari biasanya — coba batasi jajan di luar ke 3x seminggu, bisa hemat ~Rp 200rb."
- Pakai angka REAL dari data untuk mendukung setiap poin. Hitung sendiri rasio/persentase bila membantu (mis. rasio tabungan = (pemasukan−pengeluaran)/pemasukan).
- "Penyesuaian Saldo" adalah koreksi teknis saldo, BUKAN pengeluaran. JANGAN pernah menyebutnya sebagai pengeluaran terbesar atau menyuruh pengguna menguranginya.
- Jangan menakut-nakuti. Jika kondisi kurang baik, sampaikan dengan empati dan langsung kasih jalan keluar yang realistis.
- Jaga jawaban tetap fokus dan tidak bertele-tele. Gunakan struktur yang mudah dibaca (poin singkat), tapi pastikan setiap analisis SELESAI — jangan berhenti di tengah.
- Format angka dalam Rupiah Indonesia (Rp X.XXX.XXX).
- Jika ditanya sesuatu di luar data yang tersedia, katakan dengan jujur dan tawarkan apa yang bisa kamu bantu.
- Akhiri dengan 1 langkah prioritas yang paling penting untuk dilakukan ${userName} sekarang.

${ACTION_DEFINITIONS}`;
}

function renderAdvisor(area, actions) {
  actions.innerHTML = `<button class="btn btn-ghost btn-sm" onclick="clearAdvisorHistory()">🗑️ Bersihkan chat</button>`;

  // Compute current month stats
  const now = new Date();
  const mk = monthKey(now);
  const totalBalance = state.accounts.reduce((s,a) => s + Number(a.balance), 0);
  const thisIncome   = state.transactions.filter(t=>t.type==='income'&&t.date?.startsWith(mk)).reduce((s,t)=>s+Number(t.amount),0);
  const thisExpense  = state.transactions.filter(t=>t.type==='expense'&&t.date?.startsWith(mk)).reduce((s,t)=>s+Number(t.amount),0);

  const quickPrompts = [
    'Bagaimana kondisi keuanganku bulan ini?',
    'Di mana aku paling boros?',
    'Berapa yang bisa aku tabung bulan ini?',
    'Apakah anggaranku sehat?',
    'Kasih tips hemat berdasarkan data transaksi aku',
    'Analisis tren keuangan 6 bulan terakhirku',
  ];

  area.innerHTML = `
    <div class="advisor-wrap">
      <div class="advisor-context-bar">
        <div class="ctx-stat">Saldo: <span>${fmtShort(totalBalance)}</span></div>
        <div class="ctx-stat">Pemasukan: <span style="color:var(--green)">${fmtShort(thisIncome)}</span></div>
        <div class="ctx-stat">Pengeluaran: <span style="color:var(--red)">${fmtShort(thisExpense)}</span></div>
        <div class="ctx-stat">Net: <span style="color:${thisIncome-thisExpense>=0?'var(--green)':'var(--red)'}">${fmtShort(thisIncome-thisExpense)}</span></div>
      </div>

      <div class="quick-chips" id="quick-chips">
        ${quickPrompts.map(q=>`<div class="quick-chip" onclick="sendAdvisorMsg(${JSON.stringify(q)})">${q}</div>`).join('')}
      </div>

      <div class="advisor-messages" id="advisor-msgs">
        ${renderMessages()}
      </div>

      <div class="advisor-input-area" id="advisor-input-area">
        <div class="advisor-img-preview" id="advisor-img-preview"></div>
        <div class="advisor-input-wrap">
          <input type="file" id="advisor-img-input" accept="image/*" style="display:none" onchange="handleAdvisorImageSelect(event)">
          <button class="advisor-attach-btn" onclick="document.getElementById('advisor-img-input').click()" title="Lampirkan foto riwayat transaksi (galeri atau kamera)">📎</button>
          <textarea class="advisor-input" id="advisor-input" placeholder="Tanya atau minta aksi..." rows="1"
            onkeydown="if(event.key==='Enter'&&!event.shiftKey){event.preventDefault();triggerAdvisorSend()}"
            oninput="this.style.height='auto';this.style.height=Math.min(this.scrollHeight,100)+'px'"></textarea>
          <button class="advisor-send" id="advisor-send-btn" onclick="triggerAdvisorSend()" title="Kirim">➤</button>
        </div>
      </div>
    </div>`;

  renderAdvisorImgPreview();
  scrollAdvisorToBottom();
}

function renderMessages() {
  if (advisorHistory.length === 0) {
    return `
      <div class="msg-row ai">
        <div class="msg-avatar ai">🤖</div>
        <div class="msg-content">
          <div class="msg-bubble ai">
            Halo! Aku AI Financial Advisor duit.io. Aku punya akses ke data keuangan kamu — dan sekarang bisa juga <strong>melakukan aksi</strong> langsung di sini.<br><br>
            Coba: <em>"ubah saldo BCA jadi 100rb"</em>, <em>"tambah pengeluaran 50rb buat makan di GoPay"</em>, atau <em>"hapus transaksi terakhir"</em>. Setiap aksi akan minta konfirmasi sebelum dijalankan.
          </div>
        </div>
      </div>`;
  }
  return advisorHistory.map((m, i) => msgHtml(m, i)).join('');
}

function refreshAdvisorMessages() {
  const msgs = document.getElementById('advisor-msgs');
  if (!msgs) return;
  msgs.innerHTML = renderMessages();
  scrollAdvisorToBottom();
}

function msgHtml(m, msgIdx) {
  const isAI = m.role === 'assistant';
  const formattedContent = isAI
    ? (m.content || '')
        .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
        .replace(/\*(.*?)\*/g, '<em>$1</em>')
        .replace(/^- (.+)$/gm, '<li>$1</li>')
        .replace(/(<li>.*<\/li>)/gs, '<ul>$1</ul>')
        .replace(/\n\n/g, '<br><br>')
        .replace(/\n/g, '<br>')
    : (m.content || '');

  const bubble = formattedContent
    ? `<div class="msg-bubble ${isAI?'ai':'user'}">${formattedContent}</div>`
    : '';

  const imgHtml = (!isAI && m.image)
    ? `<img src="${m.image}" alt="lampiran" style="max-width:180px;border-radius:12px;margin-top:6px;display:block" />`
    : '';

  let bulkBtn = '';
  let cardsHtml = '';
  if (m.actions && m.actions.length) {
    const pendingCount = m.actions.filter(a => a.status === 'pending' && describeAction(a).warning !== 'invalid').length;
    if (pendingCount > 1) {
      bulkBtn = `<button class="btn btn-accent btn-sm" style="margin-bottom:8px;width:100%" onclick="advisorConfirmAllActions(${msgIdx})">✓ Konfirmasi Semua (${pendingCount})</button>`;
    }
    cardsHtml = m.actions.map((a, aIdx) => actionCardHtml(a, msgIdx, aIdx)).join('');
  }

  return `
    <div class="msg-row ${isAI?'ai':'user'}">
      <div class="msg-avatar ${isAI?'ai':'user'}">${isAI?'🤖':'👤'}</div>
      <div class="msg-content">
        ${bubble}
        ${imgHtml}
        ${bulkBtn}
        ${cardsHtml}
      </div>
    </div>`;
}

function actionCardHtml(action, msgIdx, aIdx) {
  const desc = describeAction(action);
  const status = action.status || 'pending';
  const linesHtml = desc.lines.map(l => `<div class="action-card-line">${escapeHtml(l)}</div>`).join('');

  let buttonsHtml = '';
  let statusBadge = '';
  if (status === 'pending') {
    const isInvalid = desc.warning === 'invalid';
    buttonsHtml = `
      <div class="action-card-actions">
        <button class="btn btn-ghost btn-sm" onclick="advisorCancelAction(${msgIdx},${aIdx})">Batal</button>
        <button class="btn ${desc.warning === 'destructive' ? 'btn-danger' : 'btn-accent'} btn-sm" ${isInvalid ? 'disabled' : ''} onclick="advisorConfirmAction(${msgIdx},${aIdx})">
          ${desc.warning === 'destructive' ? '🗑️ Hapus' : '✓ Konfirmasi'}
        </button>
      </div>`;
    if (isInvalid) {
      statusBadge = `<div class="action-card-warn">⚠️ Tidak bisa dijalankan</div>`;
    }
  } else if (status === 'confirmed') {
    statusBadge = `<div class="action-card-status confirmed">✓ ${action.result || 'Berhasil'}</div>`;
  } else if (status === 'cancelled') {
    statusBadge = `<div class="action-card-status cancelled">✗ Dibatalkan</div>`;
  } else if (status === 'failed') {
    statusBadge = `<div class="action-card-status failed">✗ Gagal: ${action.error || 'Error tidak diketahui'}</div>`;
  }

  return `
    <div class="action-card ${status}" data-msg="${msgIdx}" data-action="${aIdx}">
      <div class="action-card-head">
        <span class="action-card-icon">${desc.icon}</span>
        <span class="action-card-title">${desc.title}</span>
      </div>
      <div class="action-card-body">${linesHtml}</div>
      ${statusBadge}
      ${buttonsHtml}
    </div>`;
}

function escapeHtml(s) {
  return String(s || '')
    .replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')
    .replace(/"/g,'&quot;').replace(/'/g,'&#39;');
}

async function advisorConfirmAction(msgIdx, aIdx) {
  const msg = advisorHistory[msgIdx];
  if (!msg || !msg.actions) return;
  const action = msg.actions[aIdx];
  if (!action || action.status !== 'pending') return;

  // Mark as running (intermediate state) — show in card
  action.status = 'running';
  refreshAdvisorMessages();

  try {
    const result = await executeAction(action);
    action.status = 'confirmed';
    action.result = result;
    showToast(result + ' ✓');
  } catch (e) {
    action.status = 'failed';
    action.error = e.message || String(e);
    showToast('Aksi gagal: ' + action.error, 'error');
  }
  refreshAdvisorMessages();
}

async function advisorConfirmAllActions(msgIdx) {
  const msg = advisorHistory[msgIdx];
  if (!msg || !msg.actions) return;
  const pendingIdxs = msg.actions
    .map((a, i) => ({ a, i }))
    .filter(x => x.a.status === 'pending' && describeAction(x.a).warning !== 'invalid')
    .map(x => x.i);

  for (const idx of pendingIdxs) {
    await advisorConfirmAction(msgIdx, idx); // sequential — each call also re-renders
  }
}

function advisorCancelAction(msgIdx, aIdx) {
  const msg = advisorHistory[msgIdx];
  if (!msg || !msg.actions) return;
  const action = msg.actions[aIdx];
  if (!action || action.status !== 'pending') return;
  action.status = 'cancelled';
  refreshAdvisorMessages();
}

function scrollAdvisorToBottom() {
  setTimeout(()=>{
    const msgs = document.getElementById('advisor-msgs');
    if (msgs) msgs.scrollTop = msgs.scrollHeight;
  }, 50);
}

function handleAdvisorImageSelect(e) {
  const file = e.target.files?.[0];
  if (!file) return;
  if (!file.type.startsWith('image/')) {
    showToast('File harus berupa gambar', 'error');
    e.target.value = '';
    return;
  }
  const reader = new FileReader();
  reader.onload = () => {
    const dataUrl = reader.result;
    const base64 = String(dataUrl).split(',')[1] || '';
    advisorPendingImage = { base64, mimeType: file.type, dataUrl, name: file.name };
    renderAdvisorImgPreview();
  };
  reader.onerror = () => showToast('Gagal membaca gambar', 'error');
  reader.readAsDataURL(file);
  e.target.value = ''; // allow re-selecting the same file later
}

function renderAdvisorImgPreview() {
  const el = document.getElementById('advisor-img-preview');
  if (!el) return;
  if (!advisorPendingImage) {
    el.className = 'advisor-img-preview';
    el.innerHTML = '';
    return;
  }
  el.className = 'advisor-img-preview show';
  el.innerHTML = `
    <img src="${advisorPendingImage.dataUrl}" alt="preview" />
    <span style="font-size:12px;color:var(--text2);flex:1">Riwayat transaksi siap dianalisis</span>
    <span class="remove-img" onclick="removeAdvisorImage()" title="Hapus gambar">✕</span>
  `;
}

function removeAdvisorImage() {
  advisorPendingImage = null;
  renderAdvisorImgPreview();
}

function triggerAdvisorSend() {
  const input = document.getElementById('advisor-input');
  const text = input?.value.trim() || '';
  const img = advisorPendingImage;
  if (!text && !img) return;
  input.value = '';
  input.style.height = 'auto';
  advisorPendingImage = null;
  renderAdvisorImgPreview();
  sendAdvisorMsg(text, img);
}

async function sendAdvisorMsg(text, image = null) {
  if (advisorTyping) return;
  if (!text && !image) return;

  // Hide quick chips after first message
  const chips = document.getElementById('quick-chips');
  if (chips) chips.style.display = 'none';

  // Add user message and re-render (image shown as a thumbnail in the bubble)
  advisorHistory.push({
    role: 'user',
    content: text || (image ? '📷 Foto riwayat transaksi' : ''),
    image: image ? image.dataUrl : undefined,
  });
  refreshAdvisorMessages();

  // Show typing indicator
  const msgs = document.getElementById('advisor-msgs');
  if (msgs) {
    msgs.insertAdjacentHTML('beforeend', `
      <div class="msg-row ai" id="typing-indicator">
        <div class="msg-avatar ai">🤖</div>
        <div class="msg-content">
          <div class="msg-bubble ai typing">
            <div class="typing-dot"></div><div class="typing-dot"></div><div class="typing-dot"></div>
          </div>
        </div>
      </div>`);
    scrollAdvisorToBottom();
  }

  advisorTyping = true;
  const sendBtn = document.getElementById('advisor-send-btn');
  if (sendBtn) sendBtn.disabled = true;

  try {
    const systemPrompt = buildFinancialContext();
    // For prior assistant turns, include action outcomes so AI knows what happened
    const historyText = advisorHistory.slice(0,-1).map(m => {
      if (m.role === 'user') return 'User: ' + (m.content || '');
      let line = 'Assistant: ' + (m.content || '');
      if (m.actions && m.actions.length) {
        const outcomes = m.actions.map(a => {
          if (a.status === 'confirmed') return `[Aksi dijalankan: ${a.type} → ${a.result}]`;
          if (a.status === 'cancelled') return `[Aksi ${a.type} dibatalkan oleh pengguna]`;
          if (a.status === 'failed')    return `[Aksi ${a.type} gagal: ${a.error}]`;
          return `[Aksi ${a.type} menunggu konfirmasi]`;
        }).join(' ');
        line += '\n' + outcomes;
      }
      return line;
    }).join('\n\n');

    let fullPrompt;
    if (image) {
      // Bulk transaction extraction from an image (bank statement, e-wallet
      // mutation screenshot, or a handwritten transaction log).
      const imgInstructions = `PENTING — Pengguna baru melampirkan FOTO RIWAYAT TRANSAKSI (bisa berupa screenshot mutasi rekening/e-wallet, foto buku catatan, atau daftar transaksi tertulis).
Tugasmu: baca SEMUA transaksi yang terlihat di gambar, lalu untuk SETIAP transaksi yang ditemukan buat SATU blok <ACTION> terpisah dengan format add_transaction (lihat definisi aksi di atas). Jangan gabungkan beberapa transaksi menjadi satu aksi.
Aturan ekstraksi:
- tx_type: "expense" untuk uang keluar/debit, "income" untuk uang masuk/kredit.
- amount: angka murni tanpa simbol Rp atau pemisah ribuan (mis. 50000, bukan "50.000" atau "Rp 50rb").
- account: pilih nama rekening yang PALING SESUAI dari daftar rekening pengguna di atas. Kalau gambar menyebut rekening yang gak ada di daftar, tetap pilih yang paling masuk akal.
- category: tebak dari deskripsi transaksi (mis. "INDOMARET" → Grocery, "GOJEK" → Transport).
- date: ambil dari tanggal di gambar (format YYYY-MM-DD). Kalau gambar tidak menunjukkan tahun, asumsikan tahun ${new Date().getFullYear()}. Kalau benar-benar tidak ada tanggal sama sekali, gunakan hari ini.
- note: deskripsi singkat transaksi sesuai yang tertulis di gambar.
Sebelum daftar aksi, beri ringkasan SANGAT singkat (1 kalimat saja, mis. "Aku menemukan 5 transaksi di gambar ini, cek dan konfirmasi satu-satu di bawah ya."). JANGAN berikan analisis keuangan panjang di respons ini — fokus hanya pada ekstraksi transaksi. Pengguna akan meninjau dan konfirmasi tiap transaksi sebelum disimpan.`;
      fullPrompt = systemPrompt + '\n\n' + imgInstructions +
        (text ? `\n\nCatatan tambahan dari pengguna: ${text}` : '');
    } else {
      fullPrompt = systemPrompt + '\n\n' +
        (historyText ? 'RIWAYAT PERCAKAPAN:\n'+historyText+'\n\n' : '') +
        'User: ' + text;
    }

    const reply = image
      ? await callAI('financial_advisor', fullPrompt, image.base64, image.mimeType)
      : await callAI('financial_advisor', fullPrompt);

    // Parse out actions from reply (multiple <ACTION> blocks supported —
    // each detected transaction becomes its own confirmation card)
    const { cleanText, actions } = parseActions(reply || '');

    advisorHistory.push({
      role: 'assistant',
      content: cleanText || (actions.length ? 'Aksi siap dijalankan:' : 'Maaf, tidak ada respons.'),
      actions: actions.length ? actions : undefined,
    });

    // Remove typing indicator and re-render
    const typing = document.getElementById('typing-indicator');
    if (typing) typing.remove();
    refreshAdvisorMessages();

  } catch(e) {
    const typing = document.getElementById('typing-indicator');
    if (typing) typing.remove();
    advisorHistory.push({
      role: 'assistant',
      content: `Maaf, terjadi error: ${e.message}. Coba lagi ya.`,
    });
    refreshAdvisorMessages();
    showToast('Error: ' + e.message, 'error');
  } finally {
    advisorTyping = false;
    const sendBtn2 = document.getElementById('advisor-send-btn');
    if (sendBtn2) sendBtn2.disabled = false;
    const input2 = document.getElementById('advisor-input');
    if (input2) input2.focus();
  }
}

function clearAdvisorHistory() {
  advisorHistory = [];
  advisorPendingImage = null;
  navigate('advisor');
}

export { renderAdvisor, sendAdvisorMsg, clearAdvisorHistory }

window.sendAdvisorMsg = sendAdvisorMsg
window.triggerAdvisorSend = triggerAdvisorSend
window.clearAdvisorHistory = clearAdvisorHistory
window.advisorConfirmAction = advisorConfirmAction
window.advisorConfirmAllActions = advisorConfirmAllActions
window.advisorCancelAction = advisorCancelAction
window.handleAdvisorImageSelect = handleAdvisorImageSelect
window.removeAdvisorImage = removeAdvisorImage
