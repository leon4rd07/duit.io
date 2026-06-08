// src/js/pages/dashboard.js
import { Chart } from 'chart.js/auto'
import { state, getAccount } from '../lib/store.js'
import * as DB from '../lib/supabase.js'
import { showToast } from '../lib/toast.js'
import { navigate } from '../lib/router.js'
import { fmt, fmtShort, fmtDate, monthKey, monthLabel } from '../lib/utils.js'
import { getCatObj, CAT_COLORS } from '../lib/categories.js'
import { AVATAR_COLORS, BANK_ICONS} from '../lib/config.js'
import { t } from '../lib/i18n.js'

function isBalHidden(id) { try { if (localStorage.getItem('hide_total_balance')==='1') return true; const p = JSON.parse(localStorage.getItem('acct_prefs_v1')||'{}'); return p[`hide_bal_${id}`]===true } catch { return false } }
function maskIf(hidden, str) { return hidden ? '••••••' : str }

// ===== DASHBOARD =====
function renderDashboard(area, actions) {
  const mk = monthKey(state.dashboardMonth);
  const monthTx = state.transactions.filter(t => t.date?.startsWith(mk));
  const income = monthTx.filter(t=>t.type==='income').reduce((s,t)=>s+Number(t.amount),0);
  const expense = monthTx.filter(t=>t.type==='expense').reduce((s,t)=>s+Number(t.amount),0);
  const net = income - expense;
  const totalBalance = state.accounts.reduce((s,a)=>s+Number(a.balance),0);

  // Month navigation in actions
  actions.innerHTML = `
    <div class="month-nav">
      <button onclick="changeMonth(-1)">‹</button>
      <span>${monthLabel(state.dashboardMonth)}</span>
      <button onclick="changeMonth(1)">›</button>
    </div>`;

  // Build daily cashflow data
  const daysInMonth = new Date(state.dashboardMonth.getFullYear(), state.dashboardMonth.getMonth()+1, 0).getDate();
  const dailyData = Array.from({length:daysInMonth},(_,i)=>({day:i+1,inc:0,exp:0}));
  monthTx.forEach(t=>{
    const d = parseInt(t.date?.split('-')[2]||'1')-1;
    if(d>=0&&d<daysInMonth) {
      if(t.type==='income') dailyData[d].inc+=Number(t.amount);
      if(t.type==='expense') dailyData[d].exp+=Number(t.amount);
    }
  });

  // Category breakdown for donut
  const catExp = {};
  monthTx.filter(t=>t.type==='expense').forEach(t=>{ catExp[t.category]=(catExp[t.category]||0)+Number(t.amount); });
  const catEntries = Object.entries(catExp).sort((a,b)=>b[1]-a[1]).slice(0,6);

  const recent = state.transactions.slice(0,8);

  area.innerHTML = `
    <div class="summary-grid mb-16">
      <div class="summary-card">
        <div class="stat-label">${t('dash.total_balance')}</div>
        <div class="stat-value accent" style="font-size:18px">${isBalHidden('total') ? '••••' : fmtShort(totalBalance)}</div>
      </div>
      <div class="summary-card">
        <div class="stat-label">${t('dash.income')}</div>
        <div class="stat-value positive" style="font-size:18px">${isBalHidden('total') ? '••••' : fmtShort(income)}</div>
      </div>
      <div class="summary-card">
        <div class="stat-label">${t('dash.expense')}</div>
        <div class="stat-value negative" style="font-size:18px">${isBalHidden('total') ? '••••' : fmtShort(expense)}</div>
      </div>
    </div>

    <div class="grid-2 mb-16">
      <div class="card">
        <div class="section-title mb-12">${t('dash.cat_by_spending')}</div>
        ${catEntries.length ? `
          <div class="donut-wrap" style="height:240px">
            <canvas id="cat-chart"></canvas>
            <div class="donut-center">
              <div class="donut-center-label">${t('dash.total_out')}</div>
              <div class="donut-center-value">${fmtShort(expense)}</div>
            </div>
          </div>
          <div class="dash-cat-list">
            ${catEntries.slice(0,5).map(([cat,val])=>{
              const pct = expense ? ((val/expense)*100).toFixed(1) : '0.0';
              const obj = getCatObj(cat);
              const icon = obj?.icon || '•';
              const color = obj?.color || CAT_COLORS[cat] || '#636e72';
              return `<div class="dash-cat-row">
                <span class="dash-cat-dot" style="background:${color}"></span>
                <span class="dash-cat-name">${icon} ${cat}</span>
                <span class="dash-cat-pct">${pct}%</span>
                <span class="dash-cat-val">${fmtShort(val)}</span>
              </div>`;
            }).join('')}
          </div>
        ` : `<div class="empty-state" style="padding:20px"><div class="empty-icon">📂</div><p>${t('dash.empty_data')}</p></div>`}
      </div>
      <div class="card">
        <div class="section-title mb-12">${t('dash.daily_cashflow')}</div>
        <div class="chart-wrap" style="height:280px"><canvas id="daily-chart"></canvas></div>
      </div>
    </div>

    <div class="card mb-16">
      <div class="flex items-center justify-between mb-12">
        <div class="section-title" style="margin:0">${t('dash.recent_tx')}</div>
        <button class="btn btn-ghost btn-sm" onclick="navigate('transactions')">${t('btn.see_all')} →</button>
      </div>
      <div class="recent-list">
        ${recent.length ? recent.map(t=>txItemHtml(t)).join('') : `<div class="empty-state"><div class="empty-icon">💸</div><p>${t('empty.tx_this_month')}</p></div>`}
      </div>
    </div>
    
    <div class="card">
      <div class="flex items-center justify-between mb-12">
        <div class="section-title" style="margin:0">${t('dash.accounts')}</div>
        <button class="btn btn-ghost btn-sm" onclick="navigate('accounts')">${t('btn.manage')} →</button>
      </div>
      <div style="display:flex;gap:10px;flex-wrap:wrap">
        ${state.accounts.slice(0,4).map(a=>`
          <div style="background:var(--bg3);border-radius:10px;padding:12px 16px;min-width:130px">
            <div style="font-size:11px;color:var(--text2);margin-bottom:3px">${a.icon || BANK_ICONS[a.bank] || '💳'} ${a.bank}</div>
            <div style="font-size:13px;font-weight:600;margin-bottom:2px">${a.name}</div>
            <div style="font-size:15px;font-weight:700;color:var(--accent)">${maskIf(isBalHidden(a.id), fmtShort(a.balance))}</div>
          </div>`).join('') || `<div class="text-muted text-sm">${t('empty.accounts')}</div>`}
      </div>
    </div>`;

  // Render charts
  setTimeout(()=>{
    if(catEntries.length) {
      const ctx1 = document.getElementById('cat-chart')?.getContext('2d');
      if(ctx1) new Chart(ctx1, {
        type:'doughnut',
        data:{
          // Labels include emoji icon prefix: "🍜 Food"
          labels: catEntries.map(c => {
            const obj = getCatObj(c[0]);
            const icon = obj?.icon || '•';
            return `${icon} ${c[0]}`;
          }),
          datasets:[{
            data: catEntries.map(c => c[1]),
            backgroundColor: catEntries.map(c => (getCatObj(c[0])?.color) || CAT_COLORS[c[0]] || '#636e72'),
            borderWidth: 0,
            hoverOffset: 4,
          }]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          cutout: '65%',
          plugins: {
            legend: { display: false },
            tooltip: { callbacks: { label: d => ' ' + fmtShort(d.raw) } },
          }
        }
      });
    }
    const ctx2 = document.getElementById('daily-chart')?.getContext('2d');
    if(ctx2) {
      const labels = dailyData.filter(d=>d.inc||d.exp).map(d=>d.day+'');
      const incData = dailyData.filter(d=>d.inc||d.exp).map(d=>d.inc);
      const expData = dailyData.filter(d=>d.inc||d.exp).map(d=>d.exp);
      new Chart(ctx2, {
        type:'bar',
        data:{labels,datasets:[
          {label:'Masuk',data:incData,backgroundColor:'rgba(74,222,128,0.7)',borderRadius:4},
          {label:'Keluar',data:expData,backgroundColor:'rgba(255,95,109,0.7)',borderRadius:4}
        ]},
        options:{responsive:true,maintainAspectRatio:false,plugins:{legend:{display:false}},scales:{x:{grid:{display:false},ticks:{color:'#5a6075',font:{size:10}}},y:{grid:{color:'rgba(255,255,255,0.04)'},ticks:{color:'#5a6075',font:{size:10},callback:v=>fmtShort(v)}}},barPercentage:0.7}
      });
    }
  },50);
}

function changeMonth(delta) {
  state.dashboardMonth = new Date(state.dashboardMonth.getFullYear(), state.dashboardMonth.getMonth()+delta, 1);
  navigate('dashboard');
}

function txItemHtml(tx, showDelete = false) {
  const acc = getAccount(tx.account_id);
  const catObj = getCatObj(tx.category||'');
  const icon = tx.type==='transfer' ? '↔️' : (catObj.icon||'💸');
  const iconBg = tx.type==='income'?'var(--green-dim)':tx.type==='transfer'?'rgba(96,165,250,0.12)':'var(--red-dim)';
  const amtClass = tx.type==='income'?'income':tx.type==='transfer'?'transfer':'expense';
  const sign = tx.type==='income'?'+':tx.type==='transfer'?'':'−';
  return `<div class="tx-item" style="position:relative">
    <div style="display:flex;align-items:center;gap:12px;flex:1" onclick="openEditTx('${tx.id}')">
      <div class="tx-icon" style="background:${iconBg}">${icon}</div>
      <div class="tx-info">
        <div class="tx-name">${tx.note||tx.category||t('tx.fallback')}</div>
        <div class="tx-sub">${tx.category||t('tx.transfer')} · ${acc?acc.name:''} · ${fmtDate(tx.date)}</div>
      </div>
      <div class="tx-amount ${amtClass}">${sign}${isBalHidden('total') ? '•••••' : fmtShort(tx.amount)}</div>
    </div>
    <button class="tx-delete-btn" onclick="event.stopPropagation();deleteTx('${tx.id}')" title="${t('btn.delete')}">🗑️</button>
  </div>`;
}

async function deleteTx(id) {
  const doDelete = async () => {
    try {
      await DB.deleteTransaction(id)
      showToast(t('tx.deleted'))
      navigate('transactions')
    } catch(e) {
      showToast(t('tx.delete_fail', { error: e.message }), 'error')
    }
  }
  if (typeof window.showConfirm === 'function') {
    window.showConfirm('🗑️', t('tx.delete_title'), t('tx.delete_desc'), t('tx.delete_btn'), 'btn-danger', doDelete)
  } else {
    if (confirm(t('tx.delete_confirm_short'))) doDelete()
  }
}
window.deleteTx = deleteTx


export { renderDashboard, changeMonth, txItemHtml }
window.txItemHtml = txItemHtml
window.deleteTx = deleteTx

window.changeMonth = changeMonth
