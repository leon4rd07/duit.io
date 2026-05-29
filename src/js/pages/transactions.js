// src/js/pages/transactions.js
import { state }             from '../lib/store.js'
import { showToast }         from '../lib/toast.js'
import { navigate }          from '../lib/router.js'
import { fmt, fmtShort, fmtDate, monthKey, monthLabel } from '../lib/utils.js'
import { CATEGORIES, getCatGroups, getCatObj } from '../lib/categories.js'
import { AVATAR_COLORS }     from '../lib/config.js'
import * as DB                from '../lib/supabase.js'


let txFilter = 'Semua'
let txView = 'list'
let calMonth = new Date()
let calSelectedDate = null

// ===== TRANSACTIONS =====

function renderTransactions(area, actions) {
  actions.innerHTML = `<button class="btn btn-accent btn-sm" onclick="openAddTransaction()">+ Transaksi</button>`;
  const cats = ['Semua','Pemasukan','Pengeluaran','Transfer'];
  const filtered = txFilter==='Semua' ? state.transactions :
    txFilter==='Pemasukan' ? state.transactions.filter(t=>t.type==='income') :
    txFilter==='Pengeluaran' ? state.transactions.filter(t=>t.type==='expense') :
    state.transactions.filter(t=>t.type==='transfer');

  const filterBar = `
    <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:12px;flex-wrap:wrap;gap:8px">
      <div class="pills" style="margin:0;flex-wrap:nowrap;overflow-x:auto">
        ${cats.map(c=>`<div class="pill${c===txFilter?' active':''}" onclick="setTxFilter('${c}')">${c}</div>`).join('')}
      </div>
      <div class="view-toggle">
        <div class="view-btn ${txView==='list'?'active':''}" onclick="setTxView('list')">☰ List</div>
        <div class="view-btn ${txView==='calendar'?'active':''}" onclick="setTxView('calendar')">📅 Kalender</div>
      </div>
    </div>`;

  if (txView === 'calendar') {
    area.innerHTML = filterBar + buildCalendarHtml(filtered);
  } else {
    // Group by date
    const groups = {};
    filtered.forEach(t=>{ const d=t.date||''; if(!groups[d]) groups[d]=[]; groups[d].push(t); });
    const sortedDates = Object.keys(groups).sort((a,b)=>b.localeCompare(a));
    area.innerHTML = filterBar + (sortedDates.length ? sortedDates.map(date=>`
      <div style="font-size:12px;font-weight:600;color:var(--text3);padding:0 4px;margin-bottom:4px">${fmtDate(date)}</div>
      <div class="card mb-12" style="padding:4px 8px">
        ${groups[date].map(t=>txItemHtml(t)).join('')}
      </div>`).join('') : `<div class="empty-state"><div class="empty-icon">💸</div><p>Tidak ada transaksi</p></div>`);
  }
}

function setTxFilter(f) { txFilter = f; navigate('transactions'); }
function setTxView(v) { txView = v; navigate('transactions'); }

function buildCalendarHtml(filtered) {
  const y = calMonth.getFullYear(), m = calMonth.getMonth();
  const firstDay = new Date(y, m, 1).getDay();
  const daysInMonth = new Date(y, m+1, 0).getDate();
  const today = new Date().toISOString().split('T')[0];
  const mk = `${y}-${String(m+1).padStart(2,'0')}`;

  // Build day → transactions map
  const dayMap = {};
  filtered.forEach(t => {
    if (t.date && t.date.startsWith(mk)) {
      const day = t.date.split('-')[2];
      if (!dayMap[day]) dayMap[day] = [];
      dayMap[day].push(t);
    }
  });

  const dows = ['Min','Sen','Sel','Rab','Kam','Jum','Sab'];
  let cells = '';
  // Empty cells before first day
  for (let i=0;i<firstDay;i++) cells += `<div class="cal-day other-month"></div>`;
  // Day cells
  for (let d=1;d<=daysInMonth;d++) {
    const dateStr = `${y}-${String(m+1).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
    const isToday = dateStr === today;
    const isSelected = dateStr === calSelectedDate;
    const dayTx = dayMap[String(d).padStart(2,'0')] || [];
    const expSum = dayTx.filter(t=>t.type==='expense').reduce((s,t)=>s+Number(t.amount),0);
    const incSum = dayTx.filter(t=>t.type==='income').reduce((s,t)=>s+Number(t.amount),0);
    cells += `<div class="cal-day${isToday?' today':''}${isSelected?' selected':''}" onclick="selectCalDay('${dateStr}')">
      <div class="cal-day-num">${d}</div>
      ${expSum>0?`<span class="cal-chip expense">-${fmtShort(expSum)}</span>`:''}
      ${incSum>0?`<span class="cal-chip income">+${fmtShort(incSum)}</span>`:''}
    </div>`;
  }

  // Selected day detail
  let detailHtml = '';
  if (calSelectedDate && calSelectedDate.startsWith(mk)) {
    const selDay = calSelectedDate.split('-')[2];
    const selTx = dayMap[selDay] || [];
    detailHtml = `<div class="cal-detail">
      <div class="cal-detail-header">${fmtDate(calSelectedDate)} — ${selTx.length} transaksi</div>
      ${selTx.length ? selTx.map(t=>txItemHtml(t)).join('') : '<div class="text-muted text-sm" style="padding:8px 0">Tidak ada transaksi</div>'}
    </div>`;
  }

  const monthInc = filtered.filter(t=>t.type==='income'&&t.date?.startsWith(mk)).reduce((s,t)=>s+Number(t.amount),0);
  const monthExp = filtered.filter(t=>t.type==='expense'&&t.date?.startsWith(mk)).reduce((s,t)=>s+Number(t.amount),0);

  return `<div class="cal-wrap">
    <div class="cal-header">
      <div class="cal-nav" onclick="changeCalMonth(-1)">‹</div>
      <div>
        <div class="cal-title">${calMonth.toLocaleDateString('id-ID',{month:'long',year:'numeric'})}</div>
        <div style="font-size:11px;color:var(--text2);text-align:center;margin-top:2px">
          <span style="color:var(--green)">+${fmtShort(monthInc)}</span>
          <span style="margin:0 4px">·</span>
          <span style="color:var(--red)">-${fmtShort(monthExp)}</span>
        </div>
      </div>
      <div class="cal-nav" onclick="changeCalMonth(1)">›</div>
    </div>
    <div class="cal-grid">${dows.map(d=>`<div class="cal-dow">${d}</div>`).join('')}${cells}</div>
    <div class="cal-legend">
      <div class="cal-legend-item"><div class="cal-legend-dot" style="background:var(--red)"></div>Pengeluaran</div>
      <div class="cal-legend-item"><div class="cal-legend-dot" style="background:var(--green)"></div>Pemasukan</div>
    </div>
  </div>
  ${detailHtml}`;
}

function changeCalMonth(delta) {
  calMonth = new Date(calMonth.getFullYear(), calMonth.getMonth()+delta, 1);
  calSelectedDate = null;
  navigate('transactions');
}
function selectCalDay(date) {
  calSelectedDate = calSelectedDate === date ? null : date;
  navigate('transactions');
}

export { renderTransactions, setTxFilter, setTxView, changeCalMonth, selectCalDay }

window.setTxFilter = setTxFilter
window.setTxView = setTxView
window.changeCalMonth = changeCalMonth
window.selectCalDay = selectCalDay
