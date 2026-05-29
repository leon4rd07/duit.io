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
      ${!settled?`<button class="btn btn-sm btn-ghost" style="font-size:11px;margin-top:4px" onclick="settleDebt('${d.id}')">Lunas ✓</button>`:'<span class="badge badge-green">Lunas</span>'}
    </div>
  </div>`;
}

// openAddDebt & settleDebt replaced by modal versions above


export { renderDebts }
