// src/js/pages/dashboard.js
import { state, getAccount } from '../lib/store.js'
import * as DB from '../lib/supabase.js'
import { showToast } from '../lib/toast.js'
import { navigate } from '../lib/router.js'
import { fmt, fmtShort, fmtDate, monthKey, monthLabel } from '../lib/utils.js'
import { getCatObj, CAT_COLORS } from '../lib/categories.js'
import { AVATAR_COLORS, BANK_ICONS} from '../lib/config.js'

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
        <div class="stat-label">Saldo Total</div>
        <div class="stat-value accent" style="font-size:18px">${fmtShort(totalBalance)}</div>
      </div>
      <div class="summary-card">
        <div class="stat-label">Pemasukan</div>
        <div class="stat-value positive" style="font-size:18px">${fmtShort(income)}</div>
      </div>
      <div class="summary-card">
        <div class="stat-label">Pengeluaran</div>
        <div class="stat-value negative" style="font-size:18px">${fmtShort(expense)}</div>
      </div>
    </div>

    <div class="grid-2 mb-16">
      <div class="card">
        <div class="section-title mb-12">Pengeluaran per Kategori</div>
        ${catEntries.length ? `<div class="chart-wrap" style="height:180px"><canvas id="cat-chart"></canvas></div>` : `<div class="empty-state" style="padding:20px"><div class="empty-icon">📂</div><p>Belum ada data</p></div>`}
      </div>
      <div class="card">
        <div class="section-title mb-12">Arus Kas Harian</div>
        <div class="chart-wrap" style="height:180px"><canvas id="daily-chart"></canvas></div>
      </div>
    </div>

    <div class="card mb-16">
      <div class="flex items-center justify-between mb-12">
        <div class="section-title" style="margin:0">Transaksi Terbaru</div>
        <button class="btn btn-ghost btn-sm" onclick="navigate('transactions')">Lihat semua →</button>
      </div>
      <div class="recent-list">
        ${recent.length ? recent.map(t=>txItemHtml(t)).join('') : `<div class="empty-state"><div class="empty-icon">💸</div><p>Belum ada transaksi bulan ini</p></div>`}
      </div>
    </div>
    
    <div class="card">
      <div class="flex items-center justify-between mb-12">
        <div class="section-title" style="margin:0">Rekening</div>
        <button class="btn btn-ghost btn-sm" onclick="navigate('accounts')">Kelola →</button>
      </div>
      <div style="display:flex;gap:10px;flex-wrap:wrap">
        ${state.accounts.slice(0,4).map(a=>`
          <div style="background:var(--bg3);border-radius:10px;padding:12px 16px;min-width:130px">
            <div style="font-size:11px;color:var(--text2);margin-bottom:3px">${BANK_ICONS[a.bank]||'💳'} ${a.bank}</div>
            <div style="font-size:13px;font-weight:600;margin-bottom:2px">${a.name}</div>
            <div style="font-size:15px;font-weight:700;color:var(--accent)">${fmtShort(a.balance)}</div>
          </div>`).join('') || '<div class="text-muted text-sm">Tambah rekening untuk mulai</div>'}
      </div>
    </div>`;

  // Render charts
  setTimeout(()=>{
    if(catEntries.length) {
      const ctx1 = document.getElementById('cat-chart')?.getContext('2d');
      if(ctx1) new Chart(ctx1, {
        type:'doughnut',
        data:{labels:catEntries.map(c=>c[0]),datasets:[{data:catEntries.map(c=>c[1]),backgroundColor:catEntries.map(c=>CAT_COLORS[c[0]]||'#636e72'),borderWidth:0,hoverOffset:4}]},
        options:{responsive:true,maintainAspectRatio:false,plugins:{legend:{display:false},tooltip:{callbacks:{label:d=>' '+fmtShort(d.raw)}}},cutout:'65%'}
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

function txItemHtml(t, showDelete = false) {
  const acc = getAccount(t.account_id);
  const catObj = getCatObj(t.category||'');
  const icon = t.type==='transfer' ? '↔️' : (catObj.icon||'💸');
  const iconBg = t.type==='income'?'var(--green-dim)':t.type==='transfer'?'rgba(96,165,250,0.12)':'var(--red-dim)';
  const amtClass = t.type==='income'?'income':t.type==='transfer'?'transfer':'expense';
  const sign = t.type==='income'?'+':t.type==='transfer'?'':'−';
  return `<div class="tx-item" style="position:relative">
    <div style="display:flex;align-items:center;gap:12px;flex:1" onclick="openEditTx('${t.id}')">
      <div class="tx-icon" style="background:${iconBg}">${icon}</div>
      <div class="tx-info">
        <div class="tx-name">${t.note||t.category||'Transaksi'}</div>
        <div class="tx-sub">${t.category||'Transfer'} · ${acc?acc.name:''} · ${fmtDate(t.date)}</div>
      </div>
      <div class="tx-amount ${amtClass}">${sign}${fmtShort(t.amount)}</div>
    </div>
    <button class="tx-delete-btn" onclick="event.stopPropagation();deleteTx('${t.id}')" title="Hapus">🗑️</button>
  </div>`;
}

async function deleteTx(id) {
  if (!confirm('Hapus transaksi ini?')) return;
  try {
    await DB.deleteTransaction(id)
    showToast('Transaksi dihapus')
    navigate('transactions')
  } catch(e) {
    showToast('Gagal menghapus: ' + e.message, 'error')
  }
}
window.deleteTx = deleteTx


export { renderDashboard, changeMonth }

window.changeMonth = changeMonth
