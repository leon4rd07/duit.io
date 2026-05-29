// src/js/pages/accounts.js
import { state }             from '../lib/store.js'
import { showToast }         from '../lib/toast.js'
import { navigate }          from '../lib/router.js'
import { fmt, fmtShort, fmtDate, monthKey, monthLabel } from '../lib/utils.js'
import { CATEGORIES, getCatGroups, getCatObj } from '../lib/categories.js'
import { AVATAR_COLORS }     from '../lib/config.js'
import * as DB                from '../lib/supabase.js'

import { ACCT_TYPES } from '../lib/config.js'

// ===== ACCOUNTS =====
function renderAccounts(area, actions) {
  actions.innerHTML = `<button class="btn btn-accent btn-sm" onclick="openAddAccount()">+ Rekening</button>`;
  const total = state.accounts.reduce((s,a)=>s+Number(a.balance),0);
  // Group by category
  const catGroups = {};
  state.accounts.forEach(a => {
    const cat = a.category || 'Tabungan';
    if (!catGroups[cat]) catGroups[cat] = [];
    catGroups[cat].push(a);
  });

  area.innerHTML = `
    <div class="card mb-16" style="background:linear-gradient(135deg,var(--bg3),var(--bg2))">
      <div class="stat-label">Total Saldo</div>
      <div style="font-size:30px;font-weight:800;color:var(--accent);margin:4px 0">${fmt(total)}</div>
      <div style="display:flex;gap:12px;flex-wrap:wrap;margin-top:8px">
        ${Object.entries(catGroups).map(([cat,accs])=>{
          const catDef = (typeof ACCT_CATEGORIES!=='undefined'?ACCT_CATEGORIES:[]).find(c=>c.id===cat)||{icon:'📂',color:'#a29bfe'};
          const catTotal = accs.reduce((s,a)=>s+Number(a.balance),0);
          return `<div style="font-size:12px;color:var(--text2)">${catDef.icon||'📂'} ${cat}: <span style="font-weight:600;color:var(--text)">${fmtShort(catTotal)}</span></div>`;
        }).join('')}
      </div>
    </div>
    ${Object.entries(catGroups).map(([cat,accs])=>`
      <div class="section-title mb-8">${cat}</div>
      <div class="grid-2 mb-16">
        ${accs.map(a=>{
          const txCount = state.transactions.filter(t=>t.account_id===a.id||t.to_account_id===a.id).length;
          const accColor = a.color || 'var(--accent)';
          return `<div class="account-card" onclick="openEditAccount('${a.id}')" style="border-top:3px solid ${accColor}">
            <div class="account-bank">${a.icon||'🏦'} ${a.bank}</div>
            <div class="account-name">${a.name}</div>
            <div class="account-balance" style="color:${accColor}">${fmt(a.balance)}</div>
            <div style="margin-top:8px;display:flex;gap:5px;flex-wrap:wrap">
              ${a.acct_type?`<span style="font-size:10px;font-weight:600;background:var(--bg4);color:var(--text3);padding:2px 6px;border-radius:6px">${a.acct_type}</span>`:''}
              <span style="font-size:10px;color:var(--text3)">${txCount} transaksi</span>
            </div>
          </div>`;}).join('')}
      </div>`).join('')}
    ${!state.accounts.length?`<div class="empty-state"><div class="empty-icon">💳</div><p>Belum ada rekening.<br>Tambah rekening pertama Anda!</p></div>`:''}`;
}

// openAddAccount, openEditAccount, deleteAccount replaced by modal versions above


export { renderAccounts }
