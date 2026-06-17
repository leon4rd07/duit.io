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

  // Category breakdown this month
  const catBreakdown = {};
  thisMonthTx.filter(t=>t.type==='expense').forEach(t=>{
    const c = t.category||'Lainnya';
    catBreakdown[c] = (catBreakdown[c]||0) + Number(t.amount);
  });
  const topCats = Object.entries(catBreakdown)
    .sort((a,b)=>b[1]-a[1])
    .map(([c,v])=>`${c}: Rp ${Math.round(v).toLocaleString('id-ID')}`)
    .join(', ');

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
- Pengeluaran bulan ini: Rp ${Math.round(thisExpense).toLocaleString('id-ID')} (bulan lalu: Rp ${Math.round(lastExpense).toLocaleString('id-ID')})
- Net bulan ini: Rp ${Math.round(thisIncome-thisExpense).toLocaleString('id-ID')}
- Pengeluaran per kategori bulan ini: ${topCats || 'Belum ada transaksi'}
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
- Jawab dalam Bahasa Indonesia yang santai tapi profesional
- Gunakan data di atas untuk menjawab pertanyaan keuangan spesifik
- Berikan saran konkret, bukan generik
- Format angka dalam Rupiah Indonesia (Rp X.XXX.XXX)
- Boleh pakai bullet points untuk daftar, tapi jaga agar jawaban tidak terlalu panjang
- Jika ditanya sesuatu di luar data yang tersedia, katakan dengan jujur
- Fokus pada insight yang actionable dan relevan dengan situasi pengguna

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

      <div class="advisor-input-wrap">
        <textarea class="advisor-input" id="advisor-input" placeholder="Tanya atau minta aksi (cth: ubah saldo BCA jadi 100rb)" rows="1"
          onkeydown="if(event.key==='Enter'&&!event.shiftKey){event.preventDefault();triggerAdvisorSend()}"
          oninput="this.style.height='auto';this.style.height=Math.min(this.scrollHeight,100)+'px'"></textarea>
        <button class="advisor-send" id="advisor-send-btn" onclick="triggerAdvisorSend()" title="Kirim">➤</button>
      </div>
    </div>`;

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

  let cardsHtml = '';
  if (m.actions && m.actions.length) {
    cardsHtml = m.actions.map((a, aIdx) => actionCardHtml(a, msgIdx, aIdx)).join('');
  }

  return `
    <div class="msg-row ${isAI?'ai':'user'}">
      <div class="msg-avatar ${isAI?'ai':'user'}">${isAI?'🤖':'👤'}</div>
      <div class="msg-content">
        ${bubble}
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

function triggerAdvisorSend() {
  const input = document.getElementById('advisor-input');
  const text = input?.value.trim();
  if (text) {
    input.value = '';
    input.style.height = 'auto';
    sendAdvisorMsg(text);
  }
}

async function sendAdvisorMsg(text) {
  if (advisorTyping) return;

  // Hide quick chips after first message
  const chips = document.getElementById('quick-chips');
  if (chips) chips.style.display = 'none';

  // Add user message and re-render
  advisorHistory.push({ role: 'user', content: text });
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
    // Build full prompt with history for the proxy
    // For prior assistant turns, include action outcomes so AI knows what happened
    const historyText = advisorHistory.slice(0,-1).map(m => {
      if (m.role === 'user') return 'User: ' + m.content;
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

    const fullPrompt = systemPrompt + '\n\n' +
      (historyText ? 'RIWAYAT PERCAKAPAN:\n'+historyText+'\n\n' : '') +
      'User: ' + text;

    const reply = await callAI('financial_advisor', fullPrompt) || 'Maaf, tidak ada respons.';

    // Parse out actions from reply
    const { cleanText, actions } = parseActions(reply);

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
  navigate('advisor');
}

export { renderAdvisor, sendAdvisorMsg, clearAdvisorHistory }

window.sendAdvisorMsg = sendAdvisorMsg
window.triggerAdvisorSend = triggerAdvisorSend
window.clearAdvisorHistory = clearAdvisorHistory
window.advisorConfirmAction = advisorConfirmAction
window.advisorCancelAction = advisorCancelAction
