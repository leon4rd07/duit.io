// src/js/pages/budget.js
import { state }             from '../lib/store.js'
import { showToast }         from '../lib/toast.js'
import { navigate }          from '../lib/router.js'
import { fmt, fmtShort, fmtDate, monthKey, monthLabel } from '../lib/utils.js'
import { CATEGORIES, getCatGroups, getCatObj } from '../lib/categories.js'
import { AVATAR_COLORS }     from '../lib/config.js'
import * as DB                from '../lib/supabase.js'


// ===== BUDGET =====
function renderBudget(area, actions) {
  const mk = monthKey(new Date());
  actions.innerHTML = `<button class="btn btn-accent btn-sm" onclick="openAddBudget()">+ Anggaran</button>`;
  const monthBudgets = state.budgets.filter(b=>b.month===mk);
  const monthExp = {};
  state.transactions.filter(t=>t.type==='expense'&&t.date?.startsWith(mk)).forEach(t=>{ monthExp[t.category]=(monthExp[t.category]||0)+Number(t.amount); });

  area.innerHTML = `
    <div style="font-size:13px;color:var(--text2);margin-bottom:16px">Anggaran ${new Date().toLocaleDateString('id-ID',{month:'long',year:'numeric'})}</div>
    <div class="card">
      ${monthBudgets.length ? monthBudgets.map(b=>{
        const spent = monthExp[b.category]||0;
        const pct = Math.min(100,(spent/b.limit_amount)*100);
        const cls = pct>=100?'over':pct>=80?'warn':'ok';
        return `<div class="budget-item">
          <div class="budget-header">
            <div class="budget-cat">${b.category}</div>
            <div style="display:flex;align-items:center;gap:8px">
              <div class="budget-amounts">${fmtShort(spent)} / ${fmtShort(b.limit_amount)}</div>
              <span class="badge badge-${cls==='ok'?'green':cls==='warn'?'amber':'red'}">${pct.toFixed(0)}%</span>
              <button class="btn btn-sm btn-danger" onclick="deleteBudget('${b.id}')">✕</button>
            </div>
          </div>
          <div class="progress-bar"><div class="progress-fill ${cls}" style="width:${pct}%"></div></div>
          ${pct>=100?`<div style="font-size:11px;color:var(--red);margin-top:4px">Melebihi anggaran ${fmtShort(spent-b.limit_amount)}</div>`:''}
        </div>`;}).join('') : `<div class="empty-state" style="padding:32px 0"><div class="empty-icon">🎯</div><p>Belum ada anggaran bulan ini</p></div>`}
    </div>`;
}

// openAddBudget replaced by modal version above

async function deleteBudget(id) {
  await state.supabase.from('budgets').delete().eq('id',id);
  state.budgets = state.budgets.filter(b=>b.id!==id);
  showToast('Anggaran dihapus');
  navigate('budget');
}


export { renderBudget, deleteBudget }
