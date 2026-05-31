// src/js/pages/recurring.js
import { state }             from '../lib/store.js'
import { showToast }         from '../lib/toast.js'
import { navigate }          from '../lib/router.js'
import { fmt, fmtShort, fmtDate, monthKey, monthLabel, toLocalDateString } from '../lib/utils.js'
import { CATEGORIES, getCatGroups, getCatObj } from '../lib/categories.js'
import { AVATAR_COLORS }     from '../lib/config.js'
import * as DB                from '../lib/supabase.js'


// ===== RECURRING =====
function renderRecurring(area, actions) {
  actions.innerHTML = `<button class="btn btn-accent btn-sm" onclick="openAddRecurring()">+ Tambah</button>`;
  const FREQ_LABELS = {daily:'Harian',weekly:'Mingguan',monthly:'Bulanan',yearly:'Tahunan'};
  area.innerHTML = `
    <div class="mb-16" style="font-size:13px;color:var(--text2)">Tap item untuk edit · Tap ✓ untuk catat transaksi</div>
    ${state.recurring.length ? state.recurring.map(r=>{
      const acc = getAccount(r.account_id);
      return `<div class="recurring-item" style="cursor:pointer" onclick="editRecurring('${r.id}')">
        <div class="recurring-icon">${r.type==='income'?'💰':'💸'}</div>
        <div class="recurring-info">
          <div class="recurring-name">${r.name}</div>
          <div class="recurring-sub">${r.category||''} · ${acc?acc.name:''}</div>
        </div>
        <div class="recurring-right">
          <div class="recurring-amount" style="color:${r.type==='income'?'var(--green)':'var(--red)'}">${r.type==='income'?'+':'-'}${fmtShort(r.amount)}</div>
          <div class="recurring-freq">${FREQ_LABELS[r.frequency]||r.frequency}</div>
        </div>
        <div style="display:flex;flex-direction:column;gap:4px;margin-left:8px" onclick="event.stopPropagation()">
          <button class="btn btn-sm btn-accent" onclick="logRecurring('${r.id}')" title="Catat sekarang">✓</button>
          <button class="btn btn-sm btn-ghost" style="color:var(--red)" onclick="deleteRecurring('${r.id}')" title="Hapus">🗑️</button>
        </div>
      </div>`;}).join('') : `<div class="empty-state"><div class="empty-icon">🔄</div><p>Belum ada transaksi rutin.<br>Tambah gaji, sewa, atau langganan.</p></div>`}`;
}

function editRecurring(id) {
  const r = state.recurring.find(x => x.id === id);
  if (!r) return;
  window._editingRecurringId = id;
  const setVal = (id, val) => { const el = document.getElementById(id); if (el) el.value = val; };
  setVal('rec-name', r.name || '');
  setVal('rec-amount', String(Math.round(Number(r.amount))).replace(/\B(?=(\d{3})+(?!\d))/g, '.'));
  // Set type toggle
  if (window.setRecType) window.setRecType(r.type);
  // Populate then set categories/accounts
  setTimeout(() => {
    setVal('rec-category', r.category || '');
    setVal('rec-account', r.account_id || '');
    setVal('rec-freq', r.frequency || 'monthly');
  }, 50);
  document.getElementById('recurring-modal')?.classList.add('open');
}

async function logRecurring(id) {
  const r = state.recurring.find(x=>x.id===id);
  if (!r) return;
  try {
    await DB.createTransaction({
      type: r.type,
      amount: r.amount,
      category: r.category,
      account_id: r.account_id,
      note: r.name,
      date: toLocalDateString(new Date())
    });
    showToast(`${r.name} dicatat ✓`);
    navigate('recurring');
  } catch (e) {
    showToast('Gagal: ' + e.message, 'error');
  }
}


export { renderRecurring, logRecurring, editRecurring }

window.logRecurring = logRecurring
window.editRecurring = editRecurring
