// src/js/pages/bills.js
import { state }             from '../lib/store.js'
import { showToast }         from '../lib/toast.js'
import { navigate }          from '../lib/router.js'
import { fmt, fmtShort, fmtDate, monthKey, monthLabel, toLocalDateString } from '../lib/utils.js'
import { CATEGORIES, getCatGroups, getCatObj } from '../lib/categories.js'
import { AVATAR_COLORS }     from '../lib/config.js'
import * as DB                from '../lib/supabase.js'


// ===== BILLS PAGE =====
const BILL_TYPES = [
  {id:'pln',   icon:'⚡', label:'PLN Listrik',    cat:'💡 Tagihan & Utilitas', keywords:['pln','listrik','kwh']},
  {id:'pdam',  icon:'💧', label:'PDAM Air',        cat:'💡 Tagihan & Utilitas', keywords:['pdam','air bersih']},
  {id:'internet',icon:'🌐',label:'Internet/WiFi',  cat:'💡 Tagihan & Utilitas', keywords:['indihome','biznet','firstmedia','myrepublic','icon+','wifi','internet']},
  {id:'phone', icon:'📱', label:'Pulsa/Paket',     cat:'💡 Tagihan & Utilitas', keywords:['telkomsel','xl','indosat','tri','smartfren','pulsa','paket data']},
  {id:'bpjs',  icon:'🏥', label:'BPJS',            cat:'💊 Kesehatan',           keywords:['bpjs','kesehatan','ketenagakerjaan']},
  {id:'tv',    icon:'📺', label:'TV Kabel/OTT',    cat:'🎮 Hiburan',             keywords:['firstmedia','useetv','netflix','disney','spotify','vidio']},
  {id:'rent',  icon:'🏠', label:'Sewa/Kos',        cat:'💡 Tagihan & Utilitas', keywords:['kos','kontrakan','sewa','rent']},
  {id:'other', icon:'📋', label:'Lainnya',          cat:'💡 Tagihan & Utilitas', keywords:[]},
];

let billScanMode = null; // null = overview, or bill_type id for manual entry

function renderBills(area, actions) {
  actions.innerHTML = `<button class="btn btn-accent btn-sm" onclick="navigate('scan')">📷 Scan Struk</button>`;
  
  // Detect recurring bills from transactions
  const threeMonths = [];
  for(let i=0;i<3;i++){const d=new Date();d.setMonth(d.getMonth()-i);threeMonths.push(monthKey(d));}
  
  const detectedBills = [];
  BILL_TYPES.filter(b=>b.id!=='other').forEach(btype => {
    const matches = state.transactions.filter(t => {
      const txt = ((t.note||'')+(t.category||'')).toLowerCase();
      return btype.keywords.some(k=>txt.includes(k));
    });
    if (matches.length) {
      const lastPaid = matches[0];
      const avgAmount = matches.reduce((s,t)=>s+Number(t.amount),0)/matches.length;
      detectedBills.push({...btype, lastPaid, avgAmount, count:matches.length});
    }
  });

  // Bills due this month from recurring
  const billRecurring = state.recurring.filter(r => 
    BILL_TYPES.some(b => b.keywords.some(k=>(r.name||'').toLowerCase().includes(k)))
  );

  area.innerHTML = `
    <div style="font-size:13px;color:var(--text2);margin-bottom:16px">Pantau dan catat semua tagihan rutin Anda</div>

    ${billRecurring.length ? `
    <div class="card mb-16">
      <div class="section-title mb-12">Tagihan Rutin Terdaftar</div>
      ${billRecurring.map(r=>{
        const bt = BILL_TYPES.find(b=>b.keywords.some(k=>(r.name||'').toLowerCase().includes(k)))||BILL_TYPES[BILL_TYPES.length-1];
        const lastLogged = state.transactions.find(t=>t.note===r.name);
        const lastDate = lastLogged?.date;
        const mk = monthKey(new Date());
        const paidThisMonth = state.transactions.some(t=>t.note===r.name&&t.date?.startsWith(mk));
        return `<div class="recurring-item" style="background:${paidThisMonth?'var(--green-dim)':'var(--bg4)'}">
          <div class="recurring-icon">${bt.icon}</div>
          <div class="recurring-info">
            <div class="recurring-name">${r.name}</div>
            <div class="recurring-sub">${lastDate?'Terakhir: '+fmtDate(lastDate):'Belum pernah dicatat'}</div>
          </div>
          <div class="recurring-right">
            <div class="recurring-amount" style="color:var(--red)">${fmtShort(r.amount)}</div>
            <span class="badge ${paidThisMonth?'badge-green':'badge-amber'}">${paidThisMonth?'✓ Lunas':'Belum'}</span>
          </div>
          ${!paidThisMonth?`<button class="btn btn-sm btn-accent" onclick="logRecurring('${r.id}')" style="margin-left:8px">✓</button>`:''}
        </div>`;}).join('')}
    </div>` : ''}

    <div class="card mb-16">
      <div class="section-title mb-12">Catat Tagihan Manual</div>
      <div class="bill-type-grid">
        ${BILL_TYPES.map(b=>`
          <div class="bill-type-btn" onclick="openManualBill('${b.id}')">
            <span class="bill-icon">${b.icon}</span>
            ${b.label}
          </div>`).join('')}
      </div>
    </div>

    ${detectedBills.length ? `
    <div class="card mb-16">
      <div class="section-title mb-12">Riwayat Terdeteksi dari Transaksi</div>
      ${detectedBills.map(b=>`
        <div style="display:flex;align-items:center;gap:12px;padding:12px 0;border-bottom:1px solid var(--border)">
          <div style="font-size:24px;width:36px;text-align:center">${b.icon}</div>
          <div style="flex:1">
            <div style="font-size:14px;font-weight:600">${b.label}</div>
            <div style="font-size:12px;color:var(--text2)">${b.count}x tercatat · Rata-rata ${fmtShort(b.avgAmount)}/bulan</div>
          </div>
          <div style="text-align:right">
            <div style="font-size:13px;font-weight:600;color:var(--red)">${fmtShort(b.lastPaid.amount)}</div>
            <div style="font-size:11px;color:var(--text3)">${fmtDate(b.lastPaid.date)}</div>
          </div>
        </div>`).join('')}
    </div>` : ''}

    <div id="manual-bill-form"></div>`;
}

function openManualBill(typeId) {
  const bt = BILL_TYPES.find(b => b.id === typeId);
  if (!bt) return;
  const form = document.getElementById('manual-bill-form');
  form.innerHTML = `
    <div class="card" style="border-color:rgba(255,124,92,0.2)">
      <div class="flex items-center justify-between mb-16">
        <div class="section-title" style="margin:0">${bt.icon} Catat ${bt.label}</div>
        <button class="modal-close" onclick="document.getElementById('manual-bill-form').innerHTML=''">✕</button>
      </div>
      <div class="field-row">
        <div class="field">
          <label>Jumlah (Rp)</label>
          <input type="number" id="mb-amount" placeholder="0"/>
        </div>
        <div class="field">
          <label>Periode</label>
          <input type="text" id="mb-period" placeholder="mis. Juni 2025"/>
        </div>
      </div>
      <div class="field-row">
        <div class="field">
          <label>No. Pelanggan / ID</label>
          <input type="text" id="mb-custid" placeholder="Opsional"/>
        </div>
        <div class="field">
          <label>Tanggal Bayar</label>
          <input type="date" id="mb-date" value="${toLocalDateString(new Date())}"/>
        </div>
      </div>
      <div class="field">
        <label>Rekening</label>
        <select id="mb-account">${state.accounts.map(a=>`<option value="${a.id}">${a.name}</option>`).join('')}</select>
      </div>
      <div style="display:flex;gap:8px">
        <button class="btn btn-accent" style="flex:1;justify-content:center" onclick="saveManualBill('${typeId}')">Simpan Tagihan</button>
        <button class="btn btn-ghost" onclick="saveManualBillAsRecurring('${typeId}')">+ Jadikan Rutin</button>
      </div>
    </div>`;
  form.scrollIntoView({behavior:'smooth',block:'start'});
}

async function saveManualBill(typeId) {
  const bt = BILL_TYPES.find(b => b.id === typeId);
  if (!bt) { showToast('Tipe tagihan tidak ditemukan', 'error'); return; }
  const amount = parseFloat(document.getElementById('mb-amount').value);
  if (!amount) { showToast('Masukkan jumlah','error'); return; }
  const period = document.getElementById('mb-period').value;
  const custId = document.getElementById('mb-custid').value;
  const date = document.getElementById('mb-date').value;
  const acId = document.getElementById('mb-account').value;
  const note = `${bt.label}${period?' '+period:''}${custId?' ('+custId+')':''}`;
  const payload = {user_id:state.currentUser.id,type:'expense',amount,category:bt.cat,account_id:acId,note,date};
  const {data,error} = await state.supabase.from('transactions').insert([payload]).select().single();
  if(error){showToast(error.message,'error');return;}
  state.transactions.unshift(data);
  await applyBalance(payload);
  document.getElementById('manual-bill-form').innerHTML='';
  showToast(`${bt.label} dicatat! 🧾`);
  navigate('bills');
}

async function saveManualBillAsRecurring(typeId) {
  await saveManualBill(typeId);
  const {data,error} = await state.supabase.from('recurring').insert([{user_id:state.currentUser.id,name:bt.label,type:'expense',amount:amount||0,category:bt.cat,account_id:acId,frequency:'monthly'}]).select().single();
  if(!error&&data){state.recurring.push(data);showToast('Ditambahkan ke tagihan rutin! 🔄');}
}


export { renderBills, openManualBill, saveManualBill, saveManualBillAsRecurring }

window.openManualBill = openManualBill
window.saveManualBill = saveManualBill
window.saveManualBillAsRecurring = saveManualBillAsRecurring
