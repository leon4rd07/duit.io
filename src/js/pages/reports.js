// src/js/pages/reports.js
import { state } from '../lib/store.js'
import { showToast } from '../lib/toast.js'
import { navigate } from '../lib/router.js'
import { fmt, fmtShort, fmtDate, monthKey, monthLabel } from '../lib/utils.js'
import { getCatObj, CATEGORIES, getCatGroups,
  CAT_COLORS} from '../lib/categories.js'
import { AVATAR_COLORS } from '../lib/config.js'
import * as DB from '../lib/supabase.js'
import { createBar, createDoughnut, createLine } from '../ui/charts.js'

// ===== REPORTS =====
function renderReports(area, actions) {
  // Last 6 months data
  const months = [];
  for(let i=5;i>=0;i--) {
    const d = new Date();
    d.setMonth(d.getMonth()-i);
    months.push({key:monthKey(d),label:d.toLocaleDateString('id-ID',{month:'short'})});
  }
  const incomeData = months.map(m=>state.transactions.filter(t=>t.type==='income'&&t.date?.startsWith(m.key)).reduce((s,t)=>s+Number(t.amount),0));
  const expenseData = months.map(m=>state.transactions.filter(t=>t.type==='expense'&&t.date?.startsWith(m.key)).reduce((s,t)=>s+Number(t.amount),0));
  const netData = incomeData.map((inc,i)=>inc-expenseData[i]);

  // This month category breakdown
  const mk = monthKey(new Date());
  const catExp = {};
  state.transactions.filter(t=>t.type==='expense'&&t.date?.startsWith(mk)).forEach(t=>{ catExp[t.category]=(catExp[t.category]||0)+Number(t.amount); });
  const catEntries = Object.entries(catExp).sort((a,b)=>b[1]-a[1]);
  const totalExp = catEntries.reduce((s,[,v])=>s+v,0);

  const totalSaved = netData.reduce((s,n)=>s+n,0);

  area.innerHTML = `
    <div class="grid-2 mb-16">
      <div class="card">
        <div class="stat-label">Total Tabungan 6 Bulan</div>
        <div class="stat-value ${totalSaved>=0?'positive':'negative'}" style="font-size:22px">${fmtShort(totalSaved)}</div>
      </div>
      <div class="card">
        <div class="stat-label">Rata-rata Pengeluaran/Bulan</div>
        <div class="stat-value negative" style="font-size:22px">${fmtShort(expenseData.reduce((s,v)=>s+v,0)/6)}</div>
      </div>
    </div>

    <div class="card mb-16">
      <div class="section-title mb-12">Pemasukan vs Pengeluaran (6 Bulan)</div>
      <div class="chart-wrap"><canvas id="trend-chart"></canvas></div>
    </div>

    <div class="grid-2 mb-16">
      <div class="card">
        <div class="section-title mb-12">Kategori Bulan Ini</div>
        ${catEntries.length?`<div class="chart-wrap" style="height:200px"><canvas id="pie-chart"></canvas></div>`:`<div class="empty-state" style="padding:20px"><p>Belum ada data</p></div>`}
      </div>
      <div class="card">
        <div class="section-title mb-12">Rincian Kategori</div>
        ${catEntries.map(([cat,val])=>`
          <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:10px">
            <div style="display:flex;align-items:center;gap:8px">
              <div style="width:10px;height:10px;border-radius:50%;background:${CAT_COLORS[cat]||'#636e72'};flex-shrink:0"></div>
              <span style="font-size:13px">${cat}</span>
            </div>
            <div style="text-align:right">
              <div style="font-size:13px;font-weight:600">${fmtShort(val)}</div>
              <div style="font-size:11px;color:var(--text3)">${totalExp?((val/totalExp)*100).toFixed(1):'0'}%</div>
            </div>
          </div>`).join('') || '<div class="text-muted text-sm">Belum ada data</div>'}
      </div>
    </div>

    <div class="card">
      <div class="section-title mb-12">Net Tabungan Bulanan</div>
      <div class="chart-wrap"><canvas id="net-chart"></canvas></div>
    </div>`;

  setTimeout(()=>{
    const chartDefaults = {responsive:true,maintainAspectRatio:false,plugins:{legend:{labels:{color:'#8b92a8',font:{size:11}}},tooltip:{callbacks:{label:d=>' '+fmtShort(d.raw)}}},scales:{x:{grid:{display:false},ticks:{color:'#5a6075',font:{size:11}}},y:{grid:{color:'rgba(255,255,255,0.04)'},ticks:{color:'#5a6075',font:{size:11},callback:v=>fmtShort(v)}}}};

    const ctx1 = document.getElementById('trend-chart')?.getContext('2d');
    if(ctx1) new Chart(ctx1,{type:'bar',data:{labels:months.map(m=>m.label),datasets:[{label:'Pemasukan',data:incomeData,backgroundColor:'rgba(74,222,128,0.7)',borderRadius:6},{label:'Pengeluaran',data:expenseData,backgroundColor:'rgba(255,95,109,0.7)',borderRadius:6}]},options:{...chartDefaults,barPercentage:0.6}});

    if(catEntries.length){
      const ctx2 = document.getElementById('pie-chart')?.getContext('2d');
      if(ctx2) new Chart(ctx2,{type:'doughnut',data:{labels:catEntries.map(c=>c[0]),datasets:[{data:catEntries.map(c=>c[1]),backgroundColor:catEntries.map(c=>CAT_COLORS[c[0]]||'#636e72'),borderWidth:0}]},options:{responsive:true,maintainAspectRatio:false,plugins:{legend:{display:false}},cutout:'60%'}});
    }

    const ctx3 = document.getElementById('net-chart')?.getContext('2d');
    if(ctx3) new Chart(ctx3,{type:'line',data:{labels:months.map(m=>m.label),datasets:[{label:'Net',data:netData,borderColor:'#ff7c5c',backgroundColor:'rgba(255,124,92,0.1)',fill:true,tension:0.4,pointBackgroundColor:'#ff7c5c',pointRadius:4}]},options:{...chartDefaults}});
  },50);
}




export { renderReports }
