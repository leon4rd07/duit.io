// src/js/pages/transactions.js
import { state }             from '../lib/store.js'
import { showToast }         from '../lib/toast.js'
import { navigate }          from '../lib/router.js'
import { fmt, fmtShort, fmtDate, monthKey, monthLabel, toLocalDateString } from '../lib/utils.js'
import { CATEGORIES, getCatGroups, getCatObj } from '../lib/categories.js'
import { AVATAR_COLORS }     from '../lib/config.js'
import * as DB                from '../lib/supabase.js'
import { t, getLang }         from '../lib/i18n.js'

function isBalHidden() { return localStorage.getItem('hide_total_balance')==='1' }


// Filter state uses semantic IDs (not display strings) so translation doesn't break filtering
let txFilter = 'all' // 'all' | 'income' | 'expense' | 'transfer'
let txView = 'list'
let calMonth = new Date()
let calSelectedDate = null

// ===== TRANSACTIONS =====

function renderTransactions(area, actions) {
  actions.innerHTML = `<button class="btn btn-accent btn-sm" onclick="addTxFromFilter('${txFilter}')">${t('tx.add_btn')}</button>`;
  const filters = [
    { id: 'all',      label: t('tx.filter.all') },
    { id: 'income',   label: t('tx.income') },
    { id: 'expense',  label: t('tx.expense') },
    { id: 'transfer', label: t('tx.transfer') },
  ];
  const filtered = txFilter === 'all' ? state.transactions
                 : state.transactions.filter(tx => tx.type === txFilter);

  const filterBar = `
    <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:12px;flex-wrap:wrap;gap:8px">
      <div class="pills" style="margin:0;flex-wrap:nowrap;overflow-x:auto">
        ${filters.map(f => `<div class="pill${f.id===txFilter?' active':''}" onclick="setTxFilter('${f.id}')">${f.label}</div>`).join('')}
      </div>
      <div class="view-toggle">
        <div class="view-btn ${txView==='list'?'active':''}" onclick="setTxView('list')">${t('tx.view_list')}</div>
        <div class="view-btn ${txView==='calendar'?'active':''}" onclick="setTxView('calendar')">${t('tx.view_calendar')}</div>
      </div>
    </div>`;

  if (txView === 'calendar') {
    area.innerHTML = filterBar + buildCalendarHtml(filtered);
  } else {
    // Group by date
    const groups = {};
    filtered.forEach(tx => { const d = tx.date || ''; if (!groups[d]) groups[d] = []; groups[d].push(tx); });
    const sortedDates = Object.keys(groups).sort((a,b) => b.localeCompare(a));
    area.innerHTML = filterBar + (sortedDates.length ? sortedDates.map(date => `
      <div style="font-size:12px;font-weight:600;color:var(--text3);padding:0 4px;margin-bottom:4px">${fmtDate(date)}</div>
      <div class="card mb-12" style="padding:4px 8px">
        ${groups[date].map(tx => txItemHtml(tx)).join('')}
      </div>`).join('') : `<div class="empty-state"><div class="empty-icon">💸</div><p>${t('tx.no_tx')}</p></div>`);
  }
}

function setTxFilter(f) { txFilter = f; navigate('transactions'); }
function setTxView(v) { txView = v; navigate('transactions'); }

function buildCalendarHtml(filtered) {
  const y = calMonth.getFullYear(), m = calMonth.getMonth();
  const firstDay = new Date(y, m, 1).getDay();
  const daysInMonth = new Date(y, m+1, 0).getDate();
  const today = toLocalDateString(new Date());
  const mk = `${y}-${String(m+1).padStart(2,'0')}`;

  // Build day → transactions map
  const dayMap = {};
  filtered.forEach(tx => {
    if (tx.date && tx.date.startsWith(mk)) {
      const day = tx.date.split('-')[2];
      if (!dayMap[day]) dayMap[day] = [];
      dayMap[day].push(tx);
    }
  });

  const dows = [0,1,2,3,4,5,6].map(i => t(`date.dow.${i}`));
  let cells = '';
  // Empty cells before first day
  for (let i=0;i<firstDay;i++) cells += `<div class="cal-day other-month"></div>`;
  // Day cells
  for (let d=1;d<=daysInMonth;d++) {
    const dateStr = `${y}-${String(m+1).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
    const isToday = dateStr === today;
    const isSelected = dateStr === calSelectedDate;
    const dayTx = dayMap[String(d).padStart(2,'0')] || [];
    const expSum = dayTx.filter(tx => tx.type==='expense').reduce((s,tx) => s+Number(tx.amount), 0);
    const incSum = dayTx.filter(tx => tx.type==='income').reduce((s,tx) => s+Number(tx.amount), 0);
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
      <div class="cal-detail-header" style="display:flex;justify-content:space-between;align-items:center;gap:8px;flex-wrap:wrap">
        <span>${fmtDate(calSelectedDate)} — ${t('tx.count', { count: selTx.length })}</span>
        <button class="btn btn-accent btn-sm" onclick="addTxOnDate('${calSelectedDate}')">
          ${t('tx.add_long')}
        </button>
      </div>
      ${selTx.length ? selTx.map(tx => txItemHtml(tx)).join('') : `<div class="text-muted text-sm" style="padding:8px 0">${t('tx.no_tx_on_date')}</div>`}
    </div>`;
  }

  const monthInc = filtered.filter(tx => tx.type==='income' && tx.date?.startsWith(mk)).reduce((s,tx) => s+Number(tx.amount), 0);
  const monthExp = filtered.filter(tx => tx.type==='expense' && tx.date?.startsWith(mk)).reduce((s,tx) => s+Number(tx.amount), 0);

  const monthLocale = getLang() === 'en' ? 'en-US' : 'id-ID';
  return `<div class="cal-wrap">
    <div class="cal-header">
      <div class="cal-nav" onclick="changeCalMonth(-1)">‹</div>
      <div>
        <div class="cal-title">${calMonth.toLocaleDateString(monthLocale, { month: 'long', year: 'numeric' })}</div>
        <div style="font-size:11px;color:var(--text2);text-align:center;margin-top:2px">
          <span style="color:var(--green)">+${fmtShort(monthInc)}</span>
          <span style="margin:0 4px">·</span>
          <span style="color:var(--red)">-${fmtShort(monthExp)}</span>
        </div>
      </div>
      <div class="cal-nav" onclick="changeCalMonth(1)">›</div>
    </div>
    <div class="cal-grid">${dows.map(d => `<div class="cal-dow">${d}</div>`).join('')}${cells}</div>
    <div class="cal-legend">
      <div class="cal-legend-item"><div class="cal-legend-dot" style="background:var(--red)"></div>${t('tx.expense')}</div>
      <div class="cal-legend-item"><div class="cal-legend-dot" style="background:var(--green)"></div>${t('tx.income')}</div>
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
  // Store for tx modal default
  if (calSelectedDate) {
    sessionStorage.setItem('cal_selected_date', calSelectedDate);
  } else {
    sessionStorage.removeItem('cal_selected_date');
  }
  navigate('transactions');
}

export { renderTransactions, setTxFilter, setTxView, changeCalMonth, selectCalDay }

function addTxOnDate(date) {
  sessionStorage.setItem('cal_selected_date', date);
  if (window.openAddTransaction) window.openAddTransaction();
}
window.addTxOnDate = addTxOnDate;

function addTxFromFilter(filter) {
  // filter is a semantic ID: 'all' | 'income' | 'expense' | 'transfer'
  if (filter !== 'all') sessionStorage.setItem('preset_tx_type', filter);
  if (window.openAddTransaction) window.openAddTransaction();
}
window.addTxFromFilter = addTxFromFilter;

window.setTxFilter = setTxFilter
window.setTxView = setTxView
window.changeCalMonth = changeCalMonth
window.selectCalDay = selectCalDay
