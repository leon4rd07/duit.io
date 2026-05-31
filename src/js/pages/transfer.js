// src/js/pages/transfer.js
import { state }             from '../lib/store.js'
import { showToast }         from '../lib/toast.js'
import { navigate }          from '../lib/router.js'
import { fmt, fmtShort, fmtDate, monthKey, monthLabel, toLocalDateString, parseMoneyInput, attachMoneyFormatter } from '../lib/utils.js'
import { CATEGORIES, getCatGroups, getCatObj } from '../lib/categories.js'
import { AVATAR_COLORS }     from '../lib/config.js'
import * as DB                from '../lib/supabase.js'


// ===== TRANSFER =====
function renderTransfer(area, actions) {
  actions.innerHTML = ``;
  const transfers = state.transactions.filter(t=>t.type==='transfer');
  area.innerHTML = `
    <div class="card mb-16">
      <div class="section-title mb-12">Pindahkan Dana Antar Rekening</div>
      <div class="field-row">
        <div class="field"><label>Dari</label><select id="tr-from">${state.accounts.map(a=>`<option value="${a.id}">${a.name} (${fmtShort(a.balance)})</option>`).join('')}</select></div>
        <div class="field"><label>Ke</label><select id="tr-to">${state.accounts.map(a=>`<option value="${a.id}">${a.name} (${fmtShort(a.balance)})</option>`).join('')}</select></div>
      </div>
      <div class="field"><label>Jumlah (Rp)</label><input type="text" inputmode="numeric" class="money-input" id="tr-amount" placeholder="0"/></div>
      <div class="field"><label>Catatan</label><input type="text" id="tr-note" placeholder="mis. Top up GoPay"/></div>
      <button class="btn btn-accent" style="width:100%;justify-content:center;padding:12px" onclick="doTransfer()">Kirim Transfer</button>
    </div>
    <div class="section-title">Riwayat Transfer</div>
    ${transfers.length ? transfers.slice(0,20).map(t=>{
      const from = getAccount(t.account_id);
      const to = getAccount(t.to_account_id);
      return `<div class="transfer-hist-item">
        <div style="font-size:22px">↔️</div>
        <div style="flex:1">
          <div style="font-size:14px;font-weight:600">${from?from.name:'?'} → ${to?to.name:'?'}</div>
          <div style="font-size:12px;color:var(--text2)">${t.note||'Transfer'} · ${fmtDate(t.date)}</div>
        </div>
        <div style="font-size:14px;font-weight:700;color:var(--blue)">${fmtShort(t.amount)}</div>
      </div>`;}).join('') : `<div class="empty-state"><div class="empty-icon">↔️</div><p>Belum ada riwayat transfer</p></div>`}`;
  setTimeout(() => attachMoneyFormatter(document.getElementById('tr-amount')), 50);
}

async function doTransfer() {
  const from = document.getElementById('tr-from')?.value;
  const to = document.getElementById('tr-to')?.value;
  const amount = parseMoneyInput(document.getElementById('tr-amount')?.value);
  const note = document.getElementById('tr-note')?.value || '';
  if (!from || !to) { showToast('Pilih rekening', 'error'); return; }
  if (from === to) { showToast('Rekening asal dan tujuan harus berbeda', 'error'); return; }
  if (!amount || amount <= 0) { showToast('Masukkan jumlah', 'error'); return; }
  const fromAc = state.accounts.find(a => a.id === from);
  if (fromAc && Number(fromAc.balance) < amount) { showToast('Saldo tidak cukup', 'error'); return; }
  try {
    await DB.createTransaction({
      type: 'transfer',
      amount,
      category: '↔️ Transfer',
      account_id: from,
      to_account_id: to,
      note,
      date: toLocalDateString(new Date())
    });
    // createTransaction already updates state.transactions and balances
    document.getElementById('tr-amount').value = '';
    document.getElementById('tr-note').value = '';
    showToast('Transfer berhasil ✓');
    navigate('transfer');
  } catch (e) {
    showToast('Gagal: ' + e.message, 'error');
  }
}


export { renderTransfer, doTransfer }

window.doTransfer = doTransfer

function openTransferModal() {
  window.navigate('transfer')
}
window.openTransferModal = openTransferModal
