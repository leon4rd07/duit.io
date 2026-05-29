// src/js/pages/advisor.js
import { state }             from '../lib/store.js'
import { showToast }         from '../lib/toast.js'
import { navigate }          from '../lib/router.js'
import { fmt, fmtShort, fmtDate, monthKey, monthLabel } from '../lib/utils.js'
import { CATEGORIES, getCatGroups, getCatObj } from '../lib/categories.js'
import { AVATAR_COLORS }     from '../lib/config.js'
import * as DB                from '../lib/supabase.js'

import { callAI } from '../lib/ai.js'

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

  // Active debts
  const activeDebts = state.debts.filter(d=>!d.settled);
  const totalLent = activeDebts.filter(d=>d.direction==='lent').reduce((s,d)=>s+Number(d.remaining),0);
  const totalOwe  = activeDebts.filter(d=>d.direction==='owe').reduce((s,d)=>s+Number(d.remaining),0);

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
- Net tabungan 6 bulan terakhir: ${sixMonthNet.join(' | ')}
- Total transaksi tercatat: ${state.transactions.length}
- Transaksi rutin terdaftar: ${state.recurring.map(r=>r.name).join(', ') || 'Belum ada'}

INSTRUKSI:
- Jawab dalam Bahasa Indonesia yang santai tapi profesional
- Gunakan data di atas untuk menjawab pertanyaan keuangan spesifik
- Berikan saran konkret, bukan generik
- Format angka dalam Rupiah Indonesia (Rp X.XXX.XXX)
- Boleh pakai bullet points untuk daftar, tapi jaga agar jawaban tidak terlalu panjang
- Jika ditanya sesuatu di luar data yang tersedia, katakan dengan jujur
- Fokus pada insight yang actionable dan relevan dengan situasi pengguna`;
}

function renderAdvisor(area, actions) {
  actions.innerHTML = `<button class="btn btn-ghost btn-sm" onclick="clearAdvisorHistory()">🗑️ Bersihkan chat</button>`;


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
        ${advisorHistory.length === 0 ? `
          <div class="msg-row">
            <div class="msg-avatar ai">🤖</div>
            <div class="msg-bubble ai">
              Halo! Aku AI Financial Advisor duit.io. Aku punya akses ke data keuangan kamu — saldo, transaksi, anggaran, hutang, semuanya.<br><br>
              Mau tanya apa? Boleh langsung, misalnya: <em>"bulan ini aku boros di mana?"</em> atau <em>"bisa bantu buat rencana tabungan?"</em>
            </div>
          </div>` : advisorHistory.map(m => msgHtml(m)).join('')}
      </div>

      <div class="advisor-input-wrap">
        <textarea class="advisor-input" id="advisor-input" placeholder="Tanya sesuatu tentang keuanganmu..." rows="1"
          onkeydown="if(event.key==='Enter'&&!event.shiftKey){event.preventDefault();triggerAdvisorSend()}"
          oninput="this.style.height='auto';this.style.height=Math.min(this.scrollHeight,100)+'px'"></textarea>
        <button class="advisor-send" id="advisor-send-btn" onclick="triggerAdvisorSend()" title="Kirim">➤</button>
      </div>
    </div>`;

  scrollAdvisorToBottom();
}

function msgHtml(m) {
  const isAI = m.role === 'assistant';
  const formattedContent = isAI
    ? m.content
        .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
        .replace(/\*(.*?)\*/g, '<em>$1</em>')
        .replace(/^- (.+)$/gm, '<li>$1</li>')
        .replace(/(<li>.*<\/li>)/gs, '<ul>$1</ul>')
        .replace(/\n\n/g, '<br><br>')
        .replace(/\n/g, '<br>')
    : m.content;
  return `
    <div class="msg-row ${isAI?'ai':'user'}">
      <div class="msg-avatar ${isAI?'ai':'user'}">${isAI?'🤖':'👤'}</div>
      <div class="msg-bubble ${isAI?'ai':'user'}">${formattedContent}</div>
    </div>`;
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

  // Add user message
  advisorHistory.push({ role: 'user', content: text });
  if (msgs) {
    msgs.innerHTML += msgHtml({ role: 'user', content: text });
    // Show typing indicator
    msgs.innerHTML += `
      <div class="msg-row" id="typing-indicator">
        <div class="msg-avatar ai">🤖</div>
        <div class="msg-bubble ai typing">
          <div class="typing-dot"></div><div class="typing-dot"></div><div class="typing-dot"></div>
        </div>
      </div>`;
    scrollAdvisorToBottom();
  }

  advisorTyping = true;
  const sendBtn = document.getElementById('advisor-send-btn');
  if (sendBtn) sendBtn.disabled = true;

  try {
    const systemPrompt = buildFinancialContext();
    // Build full prompt with history for the proxy
    const historyText = advisorHistory.slice(0,-1).map(m=>
      (m.role==='user'?'User: ':'Assistant: ')+m.content
    ).join('\n\n');
    const fullPrompt = systemPrompt + '\n\n' +
      (historyText ? 'RIWAYAT PERCAKAPAN:\n'+historyText+'\n\n' : '') +
      'User: ' + text;

    const reply = await callAI('financial_advisor', fullPrompt) || 'Maaf, tidak ada respons.';
    advisorHistory.push({ role: 'assistant', content: reply });

    // Replace typing indicator with actual response
    const typing = document.getElementById('typing-indicator');
    if (typing) typing.outerHTML = msgHtml({ role: 'assistant', content: reply });

    scrollAdvisorToBottom();
  } catch(e) {
    if (typing) typing.outerHTML = msgHtml({
      role: 'assistant',
      content: `Maaf, terjadi error: ${e.message}. Coba lagi ya.`
    });
    showToast('Error: ' + e.message, 'error');
  } finally {
    advisorTyping = false;
    if (sendBtn) sendBtn.disabled = false;
    if (input) input.focus();
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
