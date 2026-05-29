// src/js/pages/recurring.js
import { state }             from '../lib/store.js'
import { showToast }         from '../lib/toast.js'
import { navigate }          from '../lib/router.js'
import { fmt, fmtShort, fmtDate, monthKey, monthLabel } from '../lib/utils.js'
import { CATEGORIES, getCatGroups, getCatObj } from '../lib/categories.js'
import { AVATAR_COLORS }     from '../lib/config.js'
import * as DB                from '../lib/supabase.js'


// ===== RECURRING =====
function renderRecurring(area, actions) {
  actions.innerHTML = `<button class="btn btn-accent btn-sm" onclick="openAddRecurring()">+ Tambah</button>`;
  const FREQ_LABELS = {daily:'Harian',weekly:'Mingguan',monthly:'Bulanan',yearly:'Tahunan'};
  area.innerHTML = `
    <div class="mb-16" style="font-size:13px;color:var(--text2)">Transaksi terjadwal — catat setiap siklus secara manual</div>
    ${state.recurring.length ? state.recurring.map(r=>{
      const acc = getAccount(r.account_id);
      return `<div class="recurring-item">
        <div class="recurring-icon">${r.type==='income'?'💰':'💸'}</div>
        <div class="recurring-info">
          <div class="recurring-name">${r.name}</div>
          <div class="recurring-sub">${r.category||''} · ${acc?acc.name:''}</div>
        </div>
        <div class="recurring-right">
          <div class="recurring-amount" style="color:${r.type==='income'?'var(--green)':'var(--red)'}">${r.type==='income'?'+':'-'}${fmtShort(r.amount)}</div>
          <div class="recurring-freq">${FREQ_LABELS[r.frequency]||r.frequency}</div>
        </div>
        <div style="display:flex;flex-direction:column;gap:4px;margin-left:8px">
          <button class="btn btn-sm btn-accent" onclick="logRecurring('${r.id}')" title="Catat sekarang">✓</button>
          <button class="btn btn-sm btn-danger" onclick="deleteRecurring('${r.id}')" title="Hapus">✕</button>
        </div>
      </div>`;}).join('') : `<div class="empty-state"><div class="empty-icon">🔄</div><p>Belum ada transaksi rutin.<br>Tambah gaji, sewa, atau langganan.</p></div>`}`;
}

// openAddRecurring replaced by modal version above

async function logRecurring(id) {
  const r = state.recurring.find(x=>x.id===id);
  if (!r) return;
  const payload = {user_id:state.currentUser.id,type:r.type,amount:r.amount,category:r.category,account_id:r.account_id,note:r.name,date:new Date().toISOString().split('T')[0]};
  const {data,error} = await state.supabase.from('transactions').insert([payload]).select().single();
  if(error){showToast(error.message,'error');return;}
  state.transactions.unshift(data);
  await applyBalance(payload);
  showToast(`${r.name} dicatat!`);
  navigate('recurring');
}

// deleteRecurring replaced by modal version above


export { renderRecurring, logRecurring }
