// src/js/pages/debts.js
import { state }             from '../lib/store.js'
import { showToast }         from '../lib/toast.js'
import { navigate }          from '../lib/router.js'
import { fmt, fmtShort, fmtDate, monthKey, monthLabel } from '../lib/utils.js'
import { CATEGORIES, getCatGroups, getCatObj } from '../lib/categories.js'
import { AVATAR_COLORS }     from '../lib/config.js'
import * as DB                from '../lib/supabase.js'


// ===== DEBTS =====
function renderDebts(area, actions) {
  actions.innerHTML = `<button class="btn btn-accent btn-sm" onclick="openAddDebt()">+ Catat</button>`;
  const activeDebts = state.debts.filter(d=>!d.settled);
  const lent = activeDebts.filter(d=>d.direction==='lent');
  const owe = activeDebts.filter(d=>d.direction==='owe');
  const totalLent = lent.reduce((s,d)=>s+Number(d.remaining),0);
  const totalOwe = owe.reduce((s,d)=>s+Number(d.remaining),0);

  area.innerHTML = `
    <div class="grid-2 mb-16">
      <div class="card" style="background:var(--green-dim);border-color:rgba(74,222,128,0.2)">
        <div class="stat-label">Piutang (orang lain hutang ke saya)</div>
        <div class="stat-value positive" style="font-size:20px">${fmtShort(totalLent)}</div>
      </div>
      <div class="card" style="background:var(--red-dim);border-color:rgba(255,95,109,0.2)">
        <div class="stat-label">Hutang saya</div>
        <div class="stat-value negative" style="font-size:20px">${fmtShort(totalOwe)}</div>
      </div>
    </div>
    ${lent.length?`<div class="section-title mb-12">Piutang 💚</div>${lent.map(d=>debtHtml(d)).join('')}`:''}
    ${owe.length?`<div class="section-title mb-12" style="margin-top:16px">Hutang ❤️</div>${owe.map(d=>debtHtml(d)).join('')}`:''}
    ${!activeDebts.length?`<div class="empty-state"><div class="empty-icon">🤝</div><p>Tidak ada hutang/piutang aktif</p></div>`:''}
    ${state.debts.filter(d=>d.settled).length?`<div class="section-title mb-8" style="margin-top:20px;color:var(--text3)">Selesai ✓</div>${state.debts.filter(d=>d.settled).slice(0,5).map(d=>debtHtml(d,true)).join('')}`:''}`;
}

function debtHtml(d, settled=false) {
  const now = new Date(); const due = d.due_date?new Date(d.due_date):null;
  const overdue = due&&due<now&&!settled;
  const initial = d.contact_name.charAt(0).toUpperCase();
  const colorIdx = d.contact_name.charCodeAt(0)%5;
  const avatarColors = ['#ff7c5c','#4ecdc4','#a29bfe','#f0b958','#7ab8f5'];
  return `<div class="debt-item" style="opacity:${settled?0.5:1}">
    <div class="debt-avatar" style="background:${avatarColors[colorIdx]}20;color:${avatarColors[colorIdx]}">${initial}</div>
    <div class="debt-info">
      <div class="debt-name">${d.contact_name} ${overdue?'<span class="badge badge-red">Jatuh Tempo!</span>':''}</div>
      <div class="debt-note">${d.note||'—'}</div>
      ${d.due_date?`<div style="font-size:11px;color:${overdue?'var(--red)':'var(--text3)'}">📅 ${fmtDate(d.due_date)}</div>`:''}
    </div>
    <div class="debt-right">
      <div class="debt-amount" style="color:${d.direction==='lent'?'var(--green)':'var(--red)'}">${fmtShort(d.remaining)}</div>
      <div style="display:flex;gap:4px;margin-top:4px;justify-content:flex-end">
        ${!settled?`<button class="btn btn-sm btn-ghost" style="font-size:11px" onclick="settleDebt('${d.id}')" title="Tandai lunas">✓</button>`:''}
        <button class="btn btn-sm btn-ghost" style="font-size:11px" onclick="editDebt('${d.id}')" title="Edit">✏️</button>
        <button class="btn btn-sm btn-ghost" style="font-size:11px;color:var(--red)" onclick="deleteDebt('${d.id}')" title="Hapus">🗑️</button>
      </div>
    </div>
  </div>`;
}

async function deleteDebt(id) {
  const d = state.debts.find(x => x.id === id);
  if (!d) return;
  window.showConfirm('🗑️', 'Hapus Hutang/Piutang', `Hapus catatan "${d.contact_name}"?`, 'Hapus', 'btn-danger', async () => {
    try {
      await state.supabase.from('debts').delete().eq('id', id);
      state.debts = state.debts.filter(x => x.id !== id);
      showToast('Dihapus ✓');
      navigate('debts');
    } catch (e) {
      showToast('Gagal: ' + e.message, 'error');
    }
  });
}

function editDebt(id) {
  const d = state.debts.find(x => x.id === id);
  if (!d) return;
  // Reuse the debt modal in edit mode
  window._editingDebtId = id;
  const setVal = (id, val) => { const el = document.getElementById(id); if (el) el.value = val; };
  setVal('debt-contact', d.contact_name || '');
  setVal('debt-amount', String(Math.round(Number(d.amount))).replace(/\B(?=(\d{3})+(?!\d))/g, '.'));
  setVal('debt-note', d.note || '');
  setVal('debt-due', d.due_date || '');
  // Set direction
  const btns = document.querySelectorAll('#debt-dir-toggle .type-btn');
  btns.forEach(b => b.classList.remove('active-income','active-expense'));
  if (d.direction === 'lent' && btns[0]) btns[0].classList.add('active-income');
  if (d.direction === 'owe' && btns[1]) btns[1].classList.add('active-expense');
  window._debtDirOverride = d.direction;
  document.getElementById('debt-modal')?.classList.add('open');
}

export { renderDebts }

window.deleteDebt = deleteDebt
window.editDebt   = editDebt
