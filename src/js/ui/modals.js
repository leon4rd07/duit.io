// src/js/ui/modals.js
import { fmt, fmtShort, monthKey, toLocalDateString, attachMoneyFormatter, parseMoneyInput } from '../lib/utils.js'
import { state }          from '../lib/store.js'
import { showToast }      from '../lib/toast.js'
import { navigate }       from '../lib/router.js'
import { CATEGORIES, getCatGroups, DEFAULT_CATS, getAllCats, getCatObj } from '../lib/categories.js'
import { BANKS, ACCT_TYPES, ACCT_COLORS, AVATAR_COLORS, BANK_ICONS} from '../lib/config.js'
import * as DB from '../lib/supabase.js'

// ===== MODAL HELPERS =====
function openSheet(id) {
  document.getElementById(id).classList.add('open');
}
function closeSheet(id) {
  document.getElementById(id).classList.remove('open');
}
// Close on backdrop click
document.addEventListener('click', e => {
  if (e.target.classList.contains('sheet-overlay')) {
    e.target.classList.remove('open');
  }
});

let _confirmAction = null;
function showConfirm(icon, title, msg, okLabel, okClass, action) {
  document.getElementById('confirm-icon').textContent = icon;
  document.getElementById('confirm-title').textContent = title;
  document.getElementById('confirm-msg').textContent = msg;
  document.getElementById('confirm-ok-btn').textContent = okLabel;
  document.getElementById('confirm-ok-btn').className = 'btn ' + okClass;
  _confirmAction = action;
  openSheet('confirm-modal');
}
function runConfirmAction() {
  closeSheet('confirm-modal');
  if (_confirmAction) _confirmAction();
  _confirmAction = null;
}

// ===== ACCOUNT MODAL =====
let _editingAccountId = null;
let _selectedBank     = 'BCA';
let _selectedAcctColor= '#ff7c5c';
let _selectedAcctCat  = 'Tabungan';
let _selectedAcctType = 'Debit';
let _selectedEmoji    = '🏦';
let _customBankMode   = false;
let _customBankName   = '';

// ── Tipe rekening ──────────────────────────────────────────────

// ── Kategori — editable at runtime via localStorage ───────────
const DEFAULT_ACCT_CATS = ['Tabungan','Harian','Darurat','Investasi','Bisnis','Keluarga','Lainnya'];
function getAcctCats() {
  try {
    const saved = JSON.parse(localStorage.getItem('custom_acct_cats') || '[]');
    return [...DEFAULT_ACCT_CATS, ...saved.filter(c=>!DEFAULT_ACCT_CATS.includes(c))];
  } catch { return DEFAULT_ACCT_CATS; }
}
function saveCustomCat(name) {
  try {
    if (!saved.includes(name) && !DEFAULT_ACCT_CATS.includes(name)) {
      saved.push(name);
      localStorage.setItem('custom_acct_cats', JSON.stringify(saved));
    }
  } catch {}
}

// ── Preset banks ───────────────────────────────────────────────
const PRESET_BANKS = [
  {name:'BCA',emoji:'🏦'},{name:'Mandiri',emoji:'🏦'},
  {name:'BNI',emoji:'🏦'},{name:'BRI',emoji:'🏦'},
  {name:'GoPay',emoji:'💚'},{name:'OVO',emoji:'💜'},
  {name:'Dana',emoji:'🔵'},{name:'ShopeePay',emoji:'🛍️'},
  {name:'Tunai',emoji:'💵'},{name:'Lainnya +',emoji:'➕'},
];


// ── All available emojis for manual pick ──────────────────────


// ── Helper ─────────────────────────────────────────────────────
function getBankEmoji(bankName) {
  const preset = PRESET_BANKS.find(b=>b.name===bankName && !b.name.includes('+'));
  if (preset) return preset.emoji;
  const lower = (bankName||'').toLowerCase();
  for (const [k,v] of Object.entries(KNOWN_CUSTOM_BANKS)) {
    if (lower.includes(k)) return v.emoji;
  }
  return '🏦';
}

// ── Render pickers ─────────────────────────────────────────────
function renderTypePicker() {
  const el = document.getElementById('acct-type-picker');
  if (!el) return;
  el.innerHTML = ACCT_TYPES.map(t => {
    const active = t.id === _selectedAcctType;
    return `<div class="pill${active?' active':''}" style="${active?'background:'+t.color+'22;color:'+t.color+';border-color:'+t.color+'44':''}"
      onclick="selectAcctType('${t.id}')">${t.icon} ${t.id}</div>`;
  }).join('');
}
function selectAcctType(id) {
  _selectedAcctType = id;
  renderTypePicker();
  updateAccountPreview();
}

function renderCatPicker() {
  const el = document.getElementById('acct-cat-picker');
  if (!el) return;
  const cats = getAcctCats();
  el.innerHTML = cats.map(c => {
    const active = c === _selectedAcctCat;
    return `<div class="pill${active?' active':''}" onclick="selectAcctCat('${c}')">${c}</div>`;
  }).join('');
}
function selectAcctCat(id) {
  _selectedAcctCat = id;
  renderCatPicker();
  updateAccountPreview();
}
function toggleCustomCatInput() {
  const w = document.getElementById('custom-cat-wrap');
  w.style.display = w.style.display === 'none' ? 'block' : 'none';
  if (w.style.display === 'block') document.getElementById('custom-cat-input').focus();
}
function addCustomCategory() {
  const input = document.getElementById('custom-cat-input');
  const name = input.value.trim();
  if (!name) return;
  saveCustomCat(name);
  _selectedAcctCat = name;
  input.value = '';
  document.getElementById('custom-cat-wrap').style.display = 'none';
  renderCatPicker();
  updateAccountPreview();
  showToast('Kategori "'+name+'" ditambahkan!');
}

function renderEmojiGrid() {
  const el = document.getElementById('acct-emoji-grid');
  if (!el) return;
  el.innerHTML = ALL_EMOJIS.map(e =>
    `<span onclick="selectEmoji('${e}')"
      style="font-size:22px;cursor:pointer;padding:5px;border-radius:8px;transition:.15s;
        ${e===_selectedEmoji?'background:var(--accent-dim);outline:2px solid var(--accent);':''}
        display:inline-block">${e}</span>`
  ).join('');
}
function selectEmoji(e) {
  _selectedEmoji = e;
  renderEmojiGrid();
  updateAccountPreview();
}

function renderBankPicker(selectedBank) {
  _selectedBank = selectedBank || 'BCA';
  _customBankMode = !PRESET_BANKS.find(b=>b.name===_selectedBank && !b.name.includes('+'));
  const el = document.getElementById('bank-picker');
  if (!el) return;
  el.innerHTML = PRESET_BANKS.map(b => {
    const active = b.name === _selectedBank;
    const isLainnya = b.name.includes('+');
    return `<div class="pick-item${active?' selected':''}" onclick="selectBank('${b.name}')">
      <span class="pick-icon">${b.emoji}</span>${b.name}</div>`;
  }).join('');
  const wrap = document.getElementById('custom-bank-wrap');
  if (wrap) wrap.style.display = _customBankMode ? 'block' : 'none';
  if (_customBankMode) {
    const inp = document.getElementById('custom-bank-name');
    if (inp && !inp.value) inp.value = _selectedBank !== 'Lainnya +' ? _selectedBank : '';
  }
  updateAccountPreview();
}

function selectBank(name) {
  if (name.includes('+')) {
    _customBankMode = true;
    _selectedBank = _customBankName || '';
    document.getElementById('custom-bank-wrap').style.display = 'block';
    document.getElementById('custom-bank-name').focus();
    document.querySelectorAll('#bank-picker .pick-item').forEach((el,i)=>
      el.classList.toggle('selected', i === PRESET_BANKS.length-1));
  } else {
    _customBankMode = false;
    _selectedBank = name;
    document.getElementById('custom-bank-wrap').style.display = 'none';
    // update emoji suggestion only if user hasn't manually picked one
    const presetEmoji = PRESET_BANKS.find(b=>b.name===name)?.emoji;
    if (presetEmoji && presetEmoji !== '➕') _selectedEmoji = presetEmoji;
    renderEmojiGrid();
    document.querySelectorAll('#bank-picker .pick-item').forEach((el,i)=>
      el.classList.toggle('selected', PRESET_BANKS[i]?.name===name));
  }
  updateAccountPreview();
}

function updateCustomBankName() {
  _customBankName = document.getElementById('custom-bank-name').value.trim();
  _selectedBank = _customBankName || '';
  updateAccountPreview();
}

function renderColorPicker() {
  const el = document.getElementById('acct-color-picker');
  if (!el) return;
  el.innerHTML = ACCT_COLORS.map(c =>
    `<div onclick="selectAcctColor('${c}')" style="width:28px;height:28px;border-radius:50%;background:${c};cursor:pointer;flex-shrink:0;transition:all .15s;
      border:3px solid ${c===_selectedAcctColor?'#fff':'transparent'};
      box-shadow:${c===_selectedAcctColor?'0 0 0 2px '+c:'none'}"></div>`
  ).join('');
}
function selectAcctColor(c) {
  _selectedAcctColor = c;
  renderColorPicker();
  updateAccountPreview();
}

function updateAccountPreview() {
  const balance = parseFloat(document.getElementById('acct-balance')?.value) || 0;
  const bankDisplay = _customBankMode ? (_customBankName || 'Bank Kustom') : _selectedBank;
  const card = document.getElementById('acct-preview-card');
  if (card) card.style.borderTopColor = _selectedAcctColor;
  const prevBal = document.getElementById('prev-balance');
  if (prevBal) { prevBal.textContent = 'Rp '+balance.toLocaleString('id-ID'); prevBal.style.color = _selectedAcctColor; }
  const prevName = document.getElementById('prev-name');
  if (prevName) prevName.textContent = name;
  const prevBank = document.getElementById('prev-bank-label');
  if (prevBank) prevBank.textContent = _selectedEmoji + ' ' + bankDisplay;
  const prevBadges = document.getElementById('prev-badges');
  if (prevBadges) prevBadges.innerHTML =
    `<span style="background:var(--bg3);color:var(--text2);padding:2px 8px;border-radius:10px;font-size:11px;font-weight:600">${_selectedAcctType}</span>
     <span style="background:var(--accent-dim);color:var(--accent);padding:2px 8px;border-radius:10px;font-size:11px;font-weight:600">${_selectedAcctCat}</span>`;
}

// ── Open/close ─────────────────────────────────────────────────
function initAcctModal() {
  renderTypePicker();
  renderCatPicker();
  renderBankPicker(_selectedBank);
  renderEmojiGrid();
  renderColorPicker();
  updateAccountPreview();
  document.getElementById('custom-cat-wrap').style.display = 'none';
}

function openAddAccount() {
  try {
    _editingAccountId = null;
    _selectedBank     = 'BCA';
    _selectedAcctColor= '#ff7c5c';
    _selectedAcctCat  = 'Tabungan';
    _selectedAcctType = 'Debit';
    _selectedEmoji    = '🏦';
    _customBankMode   = false;
    _customBankName   = '';
    const setVal = (id, val, prop='value') => {
      const el = document.getElementById(id);
      if (el) el[prop] = val;
    };
    setVal('acct-modal-title', 'Tambah Rekening', 'textContent');
    setVal('acct-name', '');
    setVal('acct-balance', '');
    setVal('acct-submit-btn', 'Simpan Rekening', 'textContent');
    const delWrap = document.getElementById('acct-delete-wrap');
    if (delWrap) delWrap.style.display = 'none';
    setVal('custom-bank-name', '');
    openSheet('account-modal');
    setTimeout(initAcctModal, 30);
  } catch(err) {
    console.error('openAddAccount error:', err);
  }
}

function openEditAccount(id) {
  const a = state.accounts.find(x=>x.id===id);
  if (!a) return;
  _editingAccountId = id;
  _selectedBank     = a.bank;
  _selectedAcctColor= a.color || '#ff7c5c';
  _selectedAcctCat  = a.category || 'Tabungan';
  _selectedAcctType = a.acct_type || 'Debit';
  _selectedEmoji    = a.icon || getBankEmoji(a.bank);
  _customBankMode   = !PRESET_BANKS.find(b=>b.name===a.bank && !b.name.includes('+'));
  _customBankName   = _customBankMode ? a.bank : '';
  document.getElementById('acct-modal-title').textContent = 'Edit Rekening';
  document.getElementById('acct-name').value = a.name;
  document.getElementById('acct-balance').value = a.balance;
  document.getElementById('acct-submit-btn').textContent = 'Simpan Perubahan';
  document.getElementById('acct-delete-wrap').style.display = 'block';
  document.getElementById('custom-bank-name').value = _customBankName;
  openSheet('account-modal');
  setTimeout(initAcctModal, 30);
}

async function submitAccountModal() {
  const name = document.getElementById('acct-name')?.value.trim();
  const balance = parseMoneyInput(document.getElementById('acct-balance')?.value) || 0;
  if (!name) { showToast('Masukkan nama rekening', 'error'); return; }
  const bankFinal = _customBankMode ? (_customBankName.trim() || 'Lainnya') : _selectedBank;
  if (!bankFinal) { showToast('Pilih atau ketik nama bank/dompet', 'error'); return; }
  const btn = document.getElementById('acct-submit-btn');
  btn.disabled = true; btn.textContent = 'Menyimpan...';
  if (_editingAccountId) {
    const a = state.accounts.find(x => x.id === _editingAccountId);
    const oldBalance = Number(a?.balance) || 0;
    const balanceChanged = a && Math.round(oldBalance) !== Math.round(balance);

    // Update non-balance fields first (balance handled separately to keep audit trail)
    const metaPayload = {
      name, bank: bankFinal,
      color: _selectedAcctColor,
      category: _selectedAcctCat,
      icon: _selectedEmoji,
      acct_type: _selectedAcctType,
    };
    const {error} = await state.supabase.from('accounts').update(metaPayload).eq('id',_editingAccountId);
    if (error) { showToast(error.message,'error'); btn.disabled=false; btn.textContent='Simpan Perubahan'; return; }
    if (a) Object.assign(a, metaPayload);

    // If balance changed: auto-create adjustment transaction (income/expense for the diff)
    if (balanceChanged) {
      try {
        const { tx, diff } = await DB.setAccountBalance(_editingAccountId, balance, {
          note: 'Penyesuaian saldo manual',
        });
        const diffStr = (diff>=0?'+':'−') + 'Rp ' + Math.round(Math.abs(diff)).toLocaleString('id-ID');
        showToast(`Rekening diperbarui ✓ (penyesuaian ${diffStr})`);
      } catch (e) {
        showToast('Saldo gagal diupdate: ' + e.message, 'error');
        btn.disabled=false;
        btn.textContent='Simpan Perubahan';
        return;
      }
    } else {
      showToast('Rekening diperbarui ✓');
    }
  } else {
    const payload = {
      name, bank: bankFinal, balance,
      color: _selectedAcctColor,
      category: _selectedAcctCat,
      icon: _selectedEmoji,
      acct_type: _selectedAcctType,
    };
    const {data,error} = await state.supabase.from('accounts').insert([{user_id:state.currentUser.id,...payload}]).select().single();
    if (error) { showToast(error.message,'error'); btn.disabled=false; btn.textContent='Simpan Rekening'; return; }
    state.accounts.push(data);
    showToast('Rekening ditambahkan! 🎉');
  }
  closeSheet('account-modal');
  btn.disabled=false;
  navigate('accounts');
}

function deleteAccountFromModal() {
  if (!_editingAccountId) return;
  const a = state.accounts.find(x => x.id === _editingAccountId);
  showConfirm('🗑️','Hapus Rekening',`Hapus "${a?.name}"? Transaksi terkait tetap ada.`,'Ya, hapus','btn-danger', async ()=>{
    await state.supabase.from('accounts').delete().eq('id',_editingAccountId);
    state.accounts = state.accounts.filter(x=>x.id!==_editingAccountId);
    closeSheet('account-modal');
    showToast('Rekening dihapus');
    navigate('accounts');
  });
}

// ===== BUDGET MODAL =====
let _selectedBudgetCat = '';
let _editingBudgetId = null;

function openAddBudget() {
  _selectedBudgetCat = '';
  _editingBudgetId = null;
  const setVal = (id, val) => { const el = document.getElementById(id); if (el) el.value = val; };
  setVal('budget-limit', '');
  setVal('budget-name', '');
  const titleEl = document.getElementById('budget-modal-title');
  if (titleEl) titleEl.textContent = 'Tambah Anggaran';
  const btnEl = document.getElementById('budget-submit-btn');
  if (btnEl) btnEl.textContent = 'Simpan Anggaran';
  renderBudgetCatPicker();
  attachMoneyFormatter(document.getElementById('budget-limit'));
  openSheet('budget-modal');
}

function openEditBudget(id) {
  const b = state.budgets.find(x => x.id === id);
  if (!b) return;
  _editingBudgetId = id;
  _selectedBudgetCat = b.category || '';
  const setVal = (id, val) => { const el = document.getElementById(id); if (el) el.value = val; };
  setVal('budget-name', b.name || '');
  setVal('budget-limit', String(Math.round(Number(b.limit_amount))).replace(/\B(?=(\d{3})+(?!\d))/g, '.'));
  const titleEl = document.getElementById('budget-modal-title');
  if (titleEl) titleEl.textContent = 'Edit Anggaran';
  const btnEl = document.getElementById('budget-submit-btn');
  if (btnEl) btnEl.textContent = 'Simpan Perubahan';
  renderBudgetCatPicker();
  attachMoneyFormatter(document.getElementById('budget-limit'));
  openSheet('budget-modal');
}

function renderBudgetCatPicker() {
  const groups = getCatGroups('expense');
  document.getElementById('budget-cat-picker').innerHTML = Object.entries(groups).map(([grp,cats])=>`
    <div class="pick-group-label">${grp}</div>
    ${cats.map(c=>{
      const full = c.icon+' '+c.name;
      const sel = full===_selectedBudgetCat;
      return `<div class="pick-item${sel?' selected':''}" style="${sel?'border-color:'+c.color+';background:'+c.color+'22;color:'+c.color:''}" onclick="selectBudgetCat('${full.replace(/'/g,'').replace(/"/g,'')}')">
        <span class="pick-icon">${c.icon}</span>
        <span style="font-size:10px">${c.name}</span>
      </div>`;}).join('')}`).join('');
}

function selectBudgetCat(full) {
  _selectedBudgetCat = full;
  renderBudgetCatPicker();
}

async function submitBudgetModal() {
  if (!_selectedBudgetCat) { showToast('Pilih kategori dulu', 'error'); return; }
  const limit = parseMoneyInput(document.getElementById('budget-limit').value);
  if (!limit || limit <= 0) { showToast('Masukkan jumlah anggaran', 'error'); return; }
  const name = document.getElementById('budget-name')?.value.trim() || null;
  const mk = monthKey(new Date());

  // Helper: insert/update with fallback if 'name' column doesn't exist
  async function trySave(includeName) {
    if (_editingBudgetId) {
      const payload = { category: _selectedBudgetCat, limit_amount: limit };
      if (includeName) payload.name = name;
      return await state.supabase.from('budgets')
        .update(payload).eq('id', _editingBudgetId).select().single();
    } else {
      const payload = { user_id: state.currentUser.id, category: _selectedBudgetCat, limit_amount: limit, month: mk };
      if (includeName) payload.name = name;
      return await state.supabase.from('budgets')
        .upsert([payload], { onConflict: 'user_id,category,month' })
        .select().single();
    }
  }

  let { data, error } = await trySave(true);

  // If column 'name' doesn't exist in DB, retry without it
  if (error && /column.*name/i.test(error.message)) {
    if (name) {
      showToast('Catatan: nama anggaran perlu kolom DB. Hubungi admin.', 'info');
    }
    ({ data, error } = await trySave(false));
  }

  if (error) { showToast(error.message, 'error'); return; }

  if (_editingBudgetId) {
    const b = state.budgets.find(x => x.id === _editingBudgetId);
    if (b) { b.category = _selectedBudgetCat; b.limit_amount = limit; if (name) b.name = name; }
    showToast('Anggaran diperbarui ✓');
  } else {
    const idx = state.budgets.findIndex(b => b.id === data.id);
    if (idx >= 0) state.budgets[idx] = data; else state.budgets.push(data);
    showToast('Anggaran disimpan!');
  }
  closeSheet('budget-modal');
  navigate('budget');
}

// ===== RECURRING MODAL =====
let _recType = 'expense';

function openAddRecurring() {
  try {
    _recType = 'expense';
    const setVal = (id, val) => { const el = document.getElementById(id); if (el) el.value = val; };
    setVal('rec-name', '');
    setVal('rec-amount', '');
    // Populate categories grouped
    const groups = getCatGroups('expense');
    const catEl = document.getElementById('rec-category');
    if (catEl) {
      catEl.innerHTML = Object.entries(groups).map(([grp,cats])=>
        `<optgroup label="${grp}">`+cats.map(c=>`<option value="${c.icon+' '+c.name}">${c.icon+' '+c.name}</option>`).join('')+`</optgroup>`
      ).join('');
    }
    const accEl = document.getElementById('rec-account');
    if (accEl) {
      accEl.innerHTML = state.accounts.map(a => `<option value="${a.id}">${a.icon || ''} ${a.name}</option>`).join('') || '<option>Tambah rekening dulu</option>';
    }
    const btns = document.querySelectorAll('#rec-type-toggle .type-btn');
    btns.forEach(b => b.classList.remove('active-expense','active-income'));
    if (btns[0]) btns[0].classList.add('active-expense');
    openSheet('recurring-modal');
  } catch(err) {
    console.error('openAddRecurring error:', err);
    showToast('Gagal membuka modal: ' + err.message, 'error');
  }
}

function setRecType(type) {
  _recType = type;
  const btns = document.querySelectorAll('#rec-type-toggle .type-btn');
  btns.forEach(b => b.classList.remove('active-expense','active-income'));
  if (btns[type==='expense'?0:1]) btns[type==='expense'?0:1].classList.add('active-'+type);
  const groups = getCatGroups(type);
  const catEl = document.getElementById('rec-category');
  if (catEl) {
    catEl.innerHTML = Object.entries(groups).map(([grp,cats])=>
      `<optgroup label="${grp}">`+cats.map(c=>`<option value="${c.icon+' '+c.name}">${c.icon+' '+c.name}</option>`).join('')+`</optgroup>`
    ).join('');
  }
}

async function submitRecurringModal() {
  const name = document.getElementById('rec-name')?.value.trim();
  const amount = parseMoneyInput(document.getElementById('rec-amount').value);
  const category = document.getElementById('rec-category').value;
  const account_id = document.getElementById('rec-account').value;
  const frequency = document.getElementById('rec-freq').value;
  if (!name) { showToast('Masukkan nama', 'error'); return; }
  if (!amount) { showToast('Masukkan jumlah', 'error'); return; }
  const { data, error } = await state.supabase.from('recurring')
    .insert([{ user_id: state.currentUser.id, name, type: _recType, amount, category, account_id, frequency }])
    .select().single();
  if (error) { showToast(error.message, 'error'); return; }
  state.recurring.push(data);
  closeSheet('recurring-modal');
  showToast('Transaksi rutin ditambahkan!');
  navigate('recurring');
}

// Override the old deleteRecurring to use confirm modal
function deleteRecurring(id) {
  const r = state.recurring.find(x => x.id === id);
  showConfirm('🗑️', 'Hapus Rutin', `Hapus "${r?.name}" dari transaksi rutin?`, 'Ya, hapus', 'btn-danger', async () => {
    await state.supabase.from('recurring').delete().eq('id', id);
    state.recurring = state.recurring.filter(x => x.id !== id);
    showToast('Dihapus');
    navigate('recurring');
  });
}

// ===== DEBT MODAL =====
let _debtDir = 'lent';

function openAddDebt() {
  try {
    _debtDir = 'lent';
    const setVal = (id, val) => { const el = document.getElementById(id); if (el) el.value = val; };
    setVal('debt-contact', '');
    setVal('debt-amount', '');
    setVal('debt-note', '');
    setVal('debt-due', '');
    const btns = document.querySelectorAll('#debt-dir-toggle .type-btn');
    btns.forEach(b => b.classList.remove('active-income','active-expense'));
    if (btns[0]) btns[0].classList.add('active-income');
    openSheet('debt-modal');
  } catch(err) {
    console.error('openAddDebt error:', err);
    showToast('Gagal membuka modal: ' + err.message, 'error');
  }
}

function setDebtDir(dir) {
  _debtDir = dir;
  const btns = document.querySelectorAll('#debt-dir-toggle .type-btn');
  btns.forEach(b => b.classList.remove('active-income','active-expense'));
  if (btns[dir==='lent'?0:1]) btns[dir==='lent'?0:1].classList.add(dir==='lent'?'active-income':'active-expense');
}

async function submitDebtModal() {
  const name = document.getElementById('debt-contact')?.value.trim();
  const amount = parseMoneyInput(document.getElementById('debt-amount')?.value);
  const note = document.getElementById('debt-note')?.value.trim() || '';
  const dueStr = document.getElementById('debt-due')?.value || null;
  if (!name) { showToast('Masukkan nama orang', 'error'); return; }
  if (!amount || amount <= 0) { showToast('Masukkan jumlah', 'error'); return; }
  const { data, error } = await state.supabase.from('debts')
    .insert([{ user_id: state.currentUser.id, contact_name: name, direction: _debtDir, amount, remaining: amount, note, due_date: dueStr }])
    .select().single();
  if (error) { showToast(error.message, 'error'); return; }
  state.debts.unshift(data);
  closeSheet('debt-modal');
  showToast('Hutang/piutang dicatat!');
  navigate('debts');
}

// ===== SETTLE DEBT MODAL =====
let _settlingDebtId = null;

function settleDebt(id) {
  const d = state.debts.find(x => x.id === id);
  if (!d) return;
  _settlingDebtId = id;
  const setTxt = (elId, val) => { const el = document.getElementById(elId); if (el) el.textContent = val; };
  const setVal = (elId, val) => { const el = document.getElementById(elId); if (el) el.value = val; };
  setTxt('settle-title', `Pelunasan — ${d.contact_name}`);
  setTxt('settle-remaining', fmt(d.remaining));
  setVal('settle-amount', '');
  attachMoneyFormatter(document.getElementById('settle-amount'));
  openSheet('settle-modal');
}

async function submitSettleModal() {
  const d = state.debts.find(x => x.id === _settlingDebtId);
  if (!d) return;
  const partial = parseMoneyInput(document.getElementById('settle-amount').value);
  const payAmount = partial || d.remaining;
  const newRemaining = Math.max(0, d.remaining - payAmount);
  const settled = newRemaining === 0;
  await state.supabase.from('debts').update({ remaining: newRemaining, settled }).eq('id', _settlingDebtId);
  d.remaining = newRemaining; d.settled = settled;
  closeSheet('settle-modal');
  showToast(settled ? 'Lunas! 🎉' : `Dibayar ${fmtShort(payAmount)}`);
  navigate('debts');
}




// ═══════════════════════════════════════════════════════════
// CATEGORY MANAGER PAGE
// ═══════════════════════════════════════════════════════════

let _catPageType    = 'expense'; // which tab is active
let _newCatEmoji    = '📦';
let _newCatColor    = '#ff7c5c';
let _newCatType     = 'expense';
let _newCatGroup    = '';
let _showAddCatForm = false;
let _editingCatId   = null;

function renderCategoryManager(area, actions) {
  actions.innerHTML = `
    <button class="btn btn-ghost btn-sm" onclick="openGroupManager()">📂 Kelola Grup</button>
    <button class="btn btn-accent btn-sm" onclick="openAddCatSheet()">+ Tambah</button>`;


  area.innerHTML = `
    <div class="cat-type-tab">
      <div class="cat-type-btn ${_catPageType==='expense'?'active':''}" onclick="setCatPageType('expense')">🛒 Pengeluaran</div>
      <div class="cat-type-btn ${_catPageType==='income'?'active':''}" onclick="setCatPageType('income')">💰 Pemasukan</div>
    </div>
    <div style="font-size:12px;color:var(--text3);margin-bottom:12px;text-align:center">
      Tahan ≡ lalu drag untuk pindahkan kategori ke grup lain
    </div>
    <div id="cat-list-root">
      ${Object.entries(groups).map(([grp, cats]) => `
        <div class="cat-group-row"
          ondragover="event.preventDefault();handleGroupDragOver(event,'${grp}')"
          ondrop="handleDropToGroup(event,'${grp}')"
          ondragleave="handleGroupDragLeave(event)">
          <div class="cat-group-icon">📂</div>
          <div class="cat-group-name">${grp}</div>
          <div style="display:flex;align-items:center;gap:6px">
            <span style="font-size:11px;color:var(--text3)">${cats.length}</span>
            <span class="cat-group-edit-btn" onclick="openGroupEditor('${grp}')" title="Edit grup">✏️</span>
          </div>
        </div>
        <div class="cat-section" id="grp-${grp.replace(/\s/g,'_')}"
          ondragover="event.preventDefault();this.classList.add('drop-target')"
          ondragleave="this.classList.remove('drop-target')"
          ondrop="handleDropToGroup(event,'${grp}')">
          ${cats.length === 0
            ? `<div style="padding:14px;text-align:center;font-size:12px;color:var(--text3)">Drag kategori ke sini</div>`
            : cats.map(c => `
            <div class="cat-list-item"
              draggable="true"
              data-cat-id="${c.id}"
              data-cat-group="${grp}"
              ondragstart="handleCatDragStart(event,'${c.id}','${grp}')"
              ondragend="handleCatDragEnd(event)"
              ondragover="event.preventDefault();handleItemDragOver(event)"
              ondragleave="handleItemDragLeave(event)"
              ondrop="handleDropBeforeItem(event,'${c.id}','${grp}')"
              onclick="openEditCatSheet('${c.id}')">
              <div class="cat-list-icon" style="background:${c.color}22">${c.icon}</div>
              <div class="cat-list-name">${c.name}</div>
              <div class="cat-list-del" onclick="event.stopPropagation();deleteCat('${c.id}')" title="Hapus">✕</div>
              <div class="cat-list-drag" title="Drag untuk pindah">≡</div>
            </div>`).join('')}
        </div>`).join('')}
      ${Object.keys(groups).length === 0 ? `<div class="empty-state"><div class="empty-icon">🏷️</div><p>Belum ada kategori</p></div>` : ''}
    </div>`;
}

function setCatPageType(t) { _catPageType = t; navigate('categories'); }

// ── DRAG & DROP ────────────────────────────────────────────────────
let _dragCatId    = null;
let _dragFromGroup= null;

function handleCatDragStart(e, catId, group) {
  _dragCatId     = catId;
  _dragFromGroup = group;
  e.currentTarget.classList.add('dragging');
  e.dataTransfer.effectAllowed = 'move';
}
function handleCatDragEnd(e) {
  e.currentTarget.classList.remove('dragging');
  document.querySelectorAll('.cat-list-item').forEach(el => {
    el.classList.remove('drag-over-top','drag-over-bottom');
  });
  document.querySelectorAll('.cat-section').forEach(el => el.classList.remove('drop-target'));
}
function handleItemDragOver(e) {
  const item = e.currentTarget;
  const rect  = item.getBoundingClientRect();
  const mid   = rect.top + rect.height / 2;
  item.classList.toggle('drag-over-top',    e.clientY < mid);
  item.classList.toggle('drag-over-bottom', e.clientY >= mid);
}
function handleItemDragLeave(e) {
  e.currentTarget.classList.remove('drag-over-top','drag-over-bottom');
}
function handleGroupDragOver(e, grp) {
  e.preventDefault();
  if (el) el.classList.add('drop-target');
}
function handleGroupDragLeave(e) {
  document.querySelectorAll('.cat-section').forEach(el => el.classList.remove('drop-target'));
}

function handleDropToGroup(e, targetGroup) {
  e.preventDefault();
  e.stopPropagation();
  document.querySelectorAll('.cat-section').forEach(el => el.classList.remove('drop-target'));
  if (!_dragCatId || targetGroup === _dragFromGroup) return;
  moveCatToGroup(_dragCatId, targetGroup);
}

function handleDropBeforeItem(e, targetCatId, targetGroup) {
  e.preventDefault();
  e.stopPropagation();
  if (!_dragCatId) return;
  if (_dragCatId === targetCatId) return;
  // Move to same group if different
  if (_dragFromGroup !== targetGroup) moveCatToGroup(_dragCatId, targetGroup);
  // Reorder within group (just re-render for now, full ordering stored later)
  navigate('categories');
}

function moveCatToGroup(catId, newGroup) {
  // Update in custom_cats_v2 if custom, or create an override for default
  const isDefault = DEFAULT_CATS.find(c=>c.id===catId);
  const existing  = JSON.parse(localStorage.getItem('custom_cats_v2') || '[]');
  const hidden    = JSON.parse(localStorage.getItem('hidden_cats') || '[]');

  if (isDefault) {
    // Hide original, create override with new group
    if (!hidden.includes(catId)) { hidden.push(catId); localStorage.setItem('hidden_cats', JSON.stringify(hidden)); }
    const src = isDefault;
    if (idx >= 0) existing[idx].group = newGroup;
    else existing.push({...src, group: newGroup});
  } else {
    if (idx >= 0) existing[idx].group = newGroup;
  }
  localStorage.setItem('custom_cats_v2', JSON.stringify(existing));
  showToast('Dipindah ke '+newGroup);
  navigate('categories');
}

// ===== ADD/EDIT TRANSACTION =====
let editingTxId = null;
let txType = 'expense';
function openAddTransaction() {
  try {
    editingTxId = null;
    const setVal = (id, val) => { const el = document.getElementById(id); if (el) el.value = val; };
    setVal('tx-amount', '');
    setVal('tx-note', '');
    let defaultDate = toLocalDateString(new Date());
    const calDate = sessionStorage.getItem('cal_selected_date');
    if (calDate) { defaultDate = calDate; sessionStorage.removeItem('cal_selected_date'); }
    setVal('tx-date', defaultDate);

    // Check preset type from filter button click
    const presetType = sessionStorage.getItem('preset_tx_type');
    if (presetType) sessionStorage.removeItem('preset_tx_type');
    setTxType(presetType || 'expense');

    // Restore last-used accounts (only if those accounts still exist)
    const lastFromId = localStorage.getItem('last_used_from_account_id');
    const lastToId   = localStorage.getItem('last_used_to_account_id');
    const fromExists = lastFromId && state.accounts.some(a => a.id === lastFromId);
    const toExists   = lastToId && state.accounts.some(a => a.id === lastToId);
    populateTxAccounts(
      fromExists ? lastFromId : undefined,
      toExists ? lastToId : undefined,
      undefined
    );

    attachMoneyFormatter(document.getElementById('tx-amount'));
    const modalEl = document.getElementById('tx-modal');
    if (modalEl) modalEl.classList.add('open');
    setTimeout(() => document.getElementById('tx-amount')?.focus(), 100);
  } catch(err) {
    console.error('openAddTransaction error:', err);
  }
}

function openEditTx(id) {
  try {
    const t = state.transactions.find(x=>x.id===id);
    if (!t) return;
    editingTxId = id;
    setTxType(t.type);
    const setVal = (id, val) => { const el = document.getElementById(id); if (el) el.value = val; };
    // Format amount with thousands separator
    const amtStr = String(Math.round(Number(t.amount))).replace(/\B(?=(\d{3})+(?!\d))/g, '.');
    setVal('tx-amount', amtStr);
    setVal('tx-note', t.note||'');
    setVal('tx-date', t.date);
    populateTxAccounts(t.account_id, t.to_account_id, t.category);
    attachMoneyFormatter(document.getElementById('tx-amount'));
    const modalEl = document.getElementById('tx-modal');
    if (modalEl) modalEl.classList.add('open');
  } catch(err) {
    console.error('openEditTx error:', err);
  }
}

function closeTxModal() { document.getElementById('tx-modal').classList.remove('open'); }

function setTxType(type) {
  txType = type;
  const btns = document.querySelectorAll('#tx-type-toggle .type-btn');
  btns.forEach((b,i)=>{
    b.classList.remove('active-expense','active-income','active-transfer');
    if(['expense','income','transfer'][i]===type) b.classList.add('active-'+type);
  });
  const toacWrap = document.getElementById('tx-toac-wrap');
  const catWrap = document.getElementById('tx-cat-wrap');
  if (toacWrap) toacWrap.style.display = type==='transfer'?'block':'none';
  if (catWrap) catWrap.style.display = type==='transfer'?'none':'block';
  populateTxCategories();
}

function populateTxAccounts(selAc, selToAc, selCat) {
  // Set hidden inputs and button displays (2-step picker)
  const acInput = document.getElementById('tx-account');
  const toAcInput = document.getElementById('tx-to-account');
  const acDisplay = document.getElementById('tx-account-display');
  const toAcDisplay = document.getElementById('tx-to-account-display');

  // Default 'from' account
  const fromId = selAc || state.accounts[0]?.id || '';
  if (acInput) acInput.value = fromId;
  setAccountDisplay('tx-account-display', fromId, 'Pilih rekening');

  // 'to' account (transfer)
  if (toAcInput) toAcInput.value = selToAc || '';
  setAccountDisplay('tx-to-account-display', selToAc, 'Pilih rekening tujuan');

  populateTxCategories(selCat);
}

function setAccountDisplay(displayId, accId, placeholder) {
  const el = document.getElementById(displayId);
  if (!el) return;
  const a = state.accounts.find(x => x.id === accId);
  if (a) {
    el.innerHTML = `${a.icon || BANK_ICONS[a.bank] || '💳'} ${a.name} <span style="color:var(--text3);font-size:11px">(${fmtShort(a.balance)})</span>`;
  } else {
    el.textContent = placeholder;
  }
}

// ── 2-step account picker (category → account) ─────────────────────────
let _pickerTarget = 'from'; // 'from' | 'to' | 'scan'

// Account picker state — Set of expanded category names
const _pickerExpanded = new Set();

function openAccountPicker(target) {
  _pickerTarget = target;
  // On open, auto-expand first group if nothing expanded
  if (_pickerExpanded.size === 0) {
    const groups = {};
    state.accounts.forEach(a => {
      const cat = a.category || 'Lainnya';
      if (!groups[cat]) groups[cat] = [];
      groups[cat].push(a);
    });
    const firstCat = Object.keys(groups)[0];
    if (firstCat) _pickerExpanded.add(firstCat);
  }
  renderAccountPicker();
  document.getElementById('account-picker-modal')?.classList.add('open');
}

function renderAccountPicker() {
  const modal = document.getElementById('account-picker-modal');
  if (!modal) return;

  // Group accounts by category
  const groups = {};
  state.accounts.forEach(a => {
    const cat = a.category || 'Lainnya';
    if (!groups[cat]) groups[cat] = [];
    groups[cat].push(a);
  });

  const bodyHtml = `
    <div style="font-size:12px;color:var(--text2);margin-bottom:12px">Pilih rekening:</div>
    <div class="picker-cat-list">
      ${Object.entries(groups).map(([cat, accs]) => {
        const total = accs.reduce((s,a)=>s+Number(a.balance), 0);
        const expanded = _pickerExpanded.has(cat);
        const catEscaped = cat.replace(/'/g,"\\'").replace(/"/g,'&quot;');
        return `
          <div class="picker-group ${expanded?'expanded':''}">
            <div class="picker-group-header" onclick="pickerToggleCategory('${catEscaped}')">
              <div style="flex:1;min-width:0">
                <div class="picker-cat-name">📂 ${cat}</div>
                <div class="picker-cat-sub">${accs.length} rekening · ${fmtShort(total)}</div>
              </div>
              <span class="picker-group-chevron">›</span>
            </div>
            <div class="picker-group-body">
              ${accs.map(a => `
                <div class="picker-acct-item" onclick="pickerSelectAccount('${a.id}')" style="border-left:3px solid ${a.color||'var(--accent)'}">
                  <div class="picker-acct-icon">${a.icon || BANK_ICONS[a.bank] || '💳'}</div>
                  <div style="flex:1;min-width:0">
                    <div class="picker-acct-name">${a.name}</div>
                    <div class="picker-acct-bank">${a.bank}</div>
                  </div>
                  <div class="picker-acct-bal" style="color:${a.color||'var(--accent)'}">${fmtShort(a.balance)}</div>
                </div>
              `).join('')}
            </div>
          </div>
        `;
      }).join('')}
    </div>
  `;

  modal.innerHTML = `
    <div class="sheet">
      <div class="sheet-handle"></div>
      <div class="sheet-head">
        <div class="sheet-title">${_pickerTarget === 'to' ? 'Rekening Tujuan' : 'Pilih Rekening'}</div>
        <button class="sheet-close" onclick="closeAccountPicker()">✕</button>
      </div>
      <div class="sheet-body">${bodyHtml}</div>
    </div>
  `;
}

function pickerToggleCategory(cat) {
  if (_pickerExpanded.has(cat)) _pickerExpanded.delete(cat);
  else _pickerExpanded.add(cat);
  renderAccountPicker();
}

function pickerSelectAccount(accId) {
  if (_pickerTarget === 'from') {
    const inp = document.getElementById('tx-account');
    if (inp) inp.value = accId;
    setAccountDisplay('tx-account-display', accId, 'Pilih rekening');
  } else if (_pickerTarget === 'to') {
    const inp = document.getElementById('tx-to-account');
    if (inp) inp.value = accId;
    setAccountDisplay('tx-to-account-display', accId, 'Pilih rekening tujuan');
  } else if (_pickerTarget === 'scan') {
    state.selectedScanAccountId = accId;
    if (window.navigate) window.navigate('scan');
  }
  closeAccountPicker();
}

function closeAccountPicker() {
  document.getElementById('account-picker-modal')?.classList.remove('open');
}

window.openAccountPicker    = openAccountPicker;
window.pickerToggleCategory = pickerToggleCategory;
window.pickerSelectAccount  = pickerSelectAccount;
window.closeAccountPicker   = closeAccountPicker;

// ===== CATEGORY PICKER (consistent accordion UI with account picker) =====
const _catPickerExpanded = new Set();

function openCatPicker() {
  // Auto-expand first group on first open
  if (_catPickerExpanded.size === 0) {
    const type = txType === 'income' ? 'income' : 'expense';
    const groups = getCatGroups(type);
    const firstGrp = Object.keys(groups)[0];
    if (firstGrp) _catPickerExpanded.add(firstGrp);
  }
  renderTxCatPicker();
  document.getElementById('cat-picker-modal')?.classList.add('open');
}

function renderTxCatPicker() {
  const modal = document.getElementById('cat-picker-modal');
  if (!modal) return;
  const type = txType === 'income' ? 'income' : 'expense';
  const groups = getCatGroups(type);
  const currentVal = document.getElementById('tx-category')?.value || '';

  const bodyHtml = `
    <div style="font-size:12px;color:var(--text2);margin-bottom:12px">Pilih kategori ${type==='income'?'pemasukan':'pengeluaran'}:</div>
    <div class="picker-cat-list">
      ${Object.entries(groups).map(([grp, cats]) => {
        const expanded = _catPickerExpanded.has(grp);
        const grpEscaped = grp.replace(/'/g,"\\'").replace(/"/g,'&quot;');
        return `
          <div class="picker-group ${expanded?'expanded':''}">
            <div class="picker-group-header" onclick="catPickerToggleGroup('${grpEscaped}')">
              <div style="flex:1;min-width:0">
                <div class="picker-cat-name">📁 ${grp}</div>
                <div class="picker-cat-sub">${cats.length} kategori</div>
              </div>
              <span class="picker-group-chevron">›</span>
            </div>
            <div class="picker-group-body">
              ${cats.map(c => {
                const full = c.icon + ' ' + c.name;
                const selected = full === currentVal;
                const fullEscaped = full.replace(/'/g,"\\'");
                return `
                  <div class="picker-cat-item-row ${selected?'selected':''}" onclick="catPickerSelect('${fullEscaped}')">
                    <div class="picker-cat-emoji">${c.icon}</div>
                    <div class="picker-cat-itemname">${c.name}</div>
                    <div class="picker-cat-radio ${selected?'on':''}"></div>
                  </div>
                `;
              }).join('')}
            </div>
          </div>
        `;
      }).join('')}
    </div>
  `;

  modal.innerHTML = `
    <div class="sheet">
      <div class="sheet-handle"></div>
      <div class="sheet-head">
        <div class="sheet-title">Pilih Kategori</div>
        <button class="sheet-close" onclick="closeCatPicker()">✕</button>
      </div>
      <div class="sheet-body">${bodyHtml}</div>
    </div>
  `;
}

function catPickerToggleGroup(grp) {
  if (_catPickerExpanded.has(grp)) _catPickerExpanded.delete(grp);
  else _catPickerExpanded.add(grp);
  renderTxCatPicker();
}

function catPickerSelect(full) {
  // Set hidden input value
  const inp = document.getElementById('tx-category');
  if (inp) inp.value = full;
  // Update display
  setCategoryDisplay(full);
  closeCatPicker();
}

function setCategoryDisplay(full) {
  const display = document.getElementById('tx-category-display');
  if (!display) return;
  if (!full) {
    display.innerHTML = `
      <span class="acct-display-content">
        <span class="acct-display-emoji">📂</span>
        <span class="acct-display-text" style="color:var(--text3)">Pilih kategori</span>
      </span>
      <span class="acct-display-chevron">›</span>
    `;
    return;
  }
  // Extract emoji prefix and name
  const m = full.match(/^(\S+)\s+(.+)$/);
  const emoji = m ? m[1] : '📂';
  const name = m ? m[2] : full;
  display.innerHTML = `
    <span class="acct-display-content">
      <span class="acct-display-emoji">${emoji}</span>
      <span class="acct-display-text">${name}</span>
    </span>
    <span class="acct-display-chevron">›</span>
  `;
}

function closeCatPicker() {
  document.getElementById('cat-picker-modal')?.classList.remove('open');
}

window.openCatPicker = openCatPicker;
window.catPickerToggleGroup = catPickerToggleGroup;
window.catPickerSelect = catPickerSelect;
window.closeCatPicker = closeCatPicker;

// Update the category display button (called from populateTxCategories)
function populateTxCategories(selCat) {
  // Set hidden input value
  const inp = document.getElementById('tx-category');
  if (inp) inp.value = selCat || '';
  // Update the visible display
  setCategoryDisplay(selCat || '');
  // Reset accordion state when opening fresh form
  if (!selCat) _catPickerExpanded.clear();
}

async function saveTx() {
  const btn = document.getElementById('save-tx-btn');
  const amount = parseMoneyInput(document.getElementById('tx-amount').value);
  const account_id = document.getElementById('tx-account').value;
  const note = document.getElementById('tx-note').value.trim();
  const date = document.getElementById('tx-date').value;
  const category = txType!=='transfer' ? document.getElementById('tx-category').value : '↔️ Transfer';
  const to_account_id = txType==='transfer' ? document.getElementById('tx-to-account').value : null;

  if (!amount || amount <= 0) { showToast('Masukkan jumlah yang valid','error'); return; }
  if (!account_id) { showToast('Pilih rekening','error'); return; }
  if (!date) { showToast('Pilih tanggal','error'); return; }
  if (txType === 'transfer' && (!to_account_id || account_id === to_account_id)) {
    showToast('Pilih rekening tujuan yang berbeda','error'); return;
  }

  btn.disabled = true;
  btn.innerHTML = '<span class="btn-spinner"></span>Menyimpan...';

  try {
    if (editingTxId) {
      // For edits — update DB only (don't change balances manually here since old code was buggy)
      const { error } = await state.supabase.from('transactions')
        .update({ type:txType, amount, category, account_id, to_account_id, note, date })
        .eq('id', editingTxId);
      if (error) throw error;
      const idx = state.transactions.findIndex(t=>t.id===editingTxId);
      if (idx >= 0) {
        state.transactions[idx] = {...state.transactions[idx], type:txType, amount, category, account_id, to_account_id, note, date};
      }
      showToast('Transaksi diperbarui ✓');
    } else {
      // Use DB helper that auto-updates balances
      await DB.createTransaction({ type:txType, amount, category, account_id, to_account_id, note, date });
      // Remember last-used accounts for next time
      try {
        localStorage.setItem('last_used_from_account_id', account_id);
        if (txType === 'transfer' && to_account_id) {
          localStorage.setItem('last_used_to_account_id', to_account_id);
        }
      } catch {}
      showToast('Transaksi disimpan ✓');
    }
    closeTxModal();
    editingTxId = null;
    navigate(state.currentPage);
  } catch(e) {
    showToast(e.message || 'Gagal menyimpan','error');
  } finally {
    btn.disabled = false;
    btn.textContent = editingTxId ? 'Simpan Perubahan' : 'Simpan Transaksi';
  }
}

async function applyBalance(t) {
  const ac = state.accounts.find(a=>a.id===t.account_id);
  if (!ac) return;
  let newBal = Number(ac.balance);
  if (t.type==='expense') newBal -= Number(t.amount);
  else if (t.type==='income') newBal += Number(t.amount);
  else if (t.type==='transfer') {
    newBal -= Number(t.amount);
    const toAc = state.accounts.find(a=>a.id===t.to_account_id);
    if (toAc) {
      const toNewBal = Number(toAc.balance)+Number(t.amount);
      await state.supabase.from('accounts').update({balance:toNewBal}).eq('id',toAc.id);
      toAc.balance = toNewBal;
    }
  }
  await state.supabase.from('accounts').update({balance:newBal}).eq('id',ac.id);
  ac.balance = newBal;
}

async function reverseBalance(t) {
  const ac = state.accounts.find(a=>a.id===t.account_id);
  if (!ac) return;
  let newBal = Number(ac.balance);
  if (t.type==='expense') newBal += Number(t.amount);
  else if (t.type==='income') newBal -= Number(t.amount);
  else if (t.type==='transfer') {
    newBal += Number(t.amount);
    const toAc = state.accounts.find(a=>a.id===t.to_account_id);
    if (toAc) {
      const toNewBal = Number(toAc.balance)-Number(t.amount);
      await state.supabase.from('accounts').update({balance:toNewBal}).eq('id',toAc.id);
      toAc.balance = toNewBal;
    }
  }
  await state.supabase.from('accounts').update({balance:newBal}).eq('id',ac.id);
  ac.balance = newBal;
}


// ── Initialize modals (called once after shell renders) ───────────────
export function initModals() {
  // Modal HTML is already in index.html
  // Window assignments are done at module level below
  // This function exists for backwards compatibility
}

// ── Module-level window assignments ──────────────────────────────────
// These must be at module level so onclick handlers work before initModals() is called
window.openSheet              = openSheet
window.closeSheet             = closeSheet
window.showConfirm            = showConfirm
window.runConfirmAction       = runConfirmAction
window.openAddAccount         = openAddAccount
window.openEditAccount        = openEditAccount
window.submitAccountModal     = submitAccountModal
window.deleteAccountFromModal = deleteAccountFromModal
window.initAcctModal          = initAcctModal
window.renderBankPicker       = renderBankPicker
window.selectBank             = selectBank
window.updateCustomBankName   = updateCustomBankName
window.renderTypePicker       = renderTypePicker
window.selectAcctType         = selectAcctType
window.renderCatPicker        = renderCatPicker
window.selectAcctCat          = selectAcctCat
window.toggleCustomCatInput   = toggleCustomCatInput
window.addCustomCategory      = addCustomCategory
window.renderEmojiGrid        = renderEmojiGrid
window.selectEmoji            = selectEmoji
window.renderColorPicker      = renderColorPicker
window.selectAcctColor        = selectAcctColor
window.updateAccountPreview   = updateAccountPreview
window.openAddBudget          = openAddBudget
window.openEditBudget         = openEditBudget
window.selectBudgetCat        = selectBudgetCat
window.renderBudgetCatPicker  = renderBudgetCatPicker
window.submitBudgetModal      = submitBudgetModal
window.openAddRecurring       = openAddRecurring
window.setRecType             = setRecType
window.submitRecurringModal   = submitRecurringModal
window.deleteRecurring        = deleteRecurring
window.openAddDebt            = openAddDebt
window.setDebtDir             = setDebtDir
window.submitDebtModal        = submitDebtModal
window.settleDebt             = settleDebt
window.submitSettleModal      = submitSettleModal
window.openAddTransaction     = openAddTransaction
window.closeTxModal           = closeTxModal
window.setTxType              = setTxType
window.saveTx                 = saveTx
window.openEditTx             = openEditTx
window.openEditAccount        = openEditAccount
window.logRecurring           = typeof logRecurring !== 'undefined' ? logRecurring : () => {}

// Quick date buttons in tx modal
function setTxDateQuick(offsetOrKey) {
  const dateEl = document.getElementById('tx-date');
  if (!dateEl) return;
  const d = new Date();
  if (offsetOrKey === 'yesterday') d.setDate(d.getDate() - 1);
  else if (typeof offsetOrKey === 'number') d.setDate(d.getDate() + offsetOrKey);
  dateEl.value = toLocalDateString(d);
  document.querySelectorAll('.date-quick-btn').forEach(b => b.classList.remove('active'));
  if (typeof event !== 'undefined' && event.currentTarget) event.currentTarget.classList.add('active');
}
window.setTxDateQuick = setTxDateQuick;

// ===== WISHLIST MODALS =====
let _editingWishlistId = null;
let _wlPriority = 2;
let _buyingWishlistId = null;
let _savingWishlistId = null;

function _populateWishlistAccountSelect(elId, selectedId) {
  const sel = document.getElementById(elId);
  if (!sel) return;
  const accounts = state.accounts || [];
  const options = ['<option value="">— Tidak ada —</option>']
    .concat(accounts.map(a => `<option value="${a.id}" ${a.id===selectedId?'selected':''}>${a.name} (${a.bank})</option>`));
  sel.innerHTML = options.join('');
}

function _populateBuyAccountSelect(selectedId) {
  const sel = document.getElementById('wl-buy-account');
  if (!sel) return;
  const accounts = state.accounts || [];
  if (!accounts.length) {
    sel.innerHTML = '<option value="">Belum ada rekening</option>';
    return;
  }
  sel.innerHTML = accounts.map(a => `<option value="${a.id}" ${a.id===selectedId?'selected':''}>${a.name} (${a.bank})</option>`).join('');
}

function _populateBuyCategorySelect() {
  const sel = document.getElementById('wl-buy-category');
  if (!sel) return;
  try {
    const groups = (typeof getCatGroups === 'function') ? getCatGroups('expense') : null;
    if (!groups) {
      sel.innerHTML = '<option value="🛍️ Belanja">🛍️ Belanja</option>';
      return;
    }
    const opts = ['<option value="🛍️ Belanja">🛍️ Belanja (default Wishlist)</option>'];
    Object.entries(groups).forEach(([g, cats]) => {
      opts.push(`<optgroup label="${g}">`);
      cats.forEach(c => opts.push(`<option value="${c.icon} ${c.name}">${c.icon} ${c.name}</option>`));
      opts.push('</optgroup>');
    });
    sel.innerHTML = opts.join('');
  } catch(e) {
    sel.innerHTML = '<option value="🛍️ Belanja">🛍️ Belanja</option>';
  }
}

function _setPriorityBtns(p) {
  const btns = document.querySelectorAll('#wl-priority-toggle .type-btn');
  btns.forEach((b, i) => b.classList.remove('active-expense', 'active-income', 'active-transfer'));
  // Map: 1→red(active-expense), 2→accent(active-transfer), 3→muted(active-income)
  const classes = ['active-expense', 'active-transfer', 'active-income'];
  if (btns[p-1]) btns[p-1].classList.add(classes[p-1] || 'active-transfer');
}

function setWishlistPriority(p) {
  _wlPriority = p;
  _setPriorityBtns(p);
}

function openAddWishlist() {
  try {
    _editingWishlistId = null;
    _wlPriority = 2;
    const setVal = (id, val) => { const el = document.getElementById(id); if (el) el.value = val; };
    setVal('wl-name', '');
    setVal('wl-price', '');
    setVal('wl-note', '');
    setVal('wl-url', '');
    setVal('wl-target-date', '');
    _populateWishlistAccountSelect('wl-account', '');
    _setPriorityBtns(2);
    const title = document.getElementById('wishlist-modal-title');
    if (title) title.textContent = 'Tambah Wishlist';
    const delBtn = document.getElementById('wl-delete-btn');
    if (delBtn) delBtn.style.display = 'none';
    attachMoneyFormatter(document.getElementById('wl-price'));
    openSheet('wishlist-modal');
  } catch(err) {
    console.error('openAddWishlist error:', err);
    showToast('Gagal membuka modal: ' + err.message, 'error');
  }
}

function openEditWishlist(id) {
  try {
    const w = state.wishlist.find(x => x.id === id);
    if (!w) return;
    _editingWishlistId = id;
    _wlPriority = w.priority || 2;
    const setVal = (elId, val) => { const el = document.getElementById(elId); if (el) el.value = val; };
    setVal('wl-name', w.name || '');
    const priceStr = String(Math.round(Number(w.price)||0)).replace(/\B(?=(\d{3})+(?!\d))/g, '.');
    setVal('wl-price', priceStr);
    setVal('wl-note', w.note || '');
    setVal('wl-url', w.url || '');
    setVal('wl-target-date', w.target_date || '');
    _populateWishlistAccountSelect('wl-account', w.linked_account_id || '');
    _setPriorityBtns(_wlPriority);
    const title = document.getElementById('wishlist-modal-title');
    if (title) title.textContent = 'Edit Wishlist';
    const delBtn = document.getElementById('wl-delete-btn');
    if (delBtn) delBtn.style.display = 'inline-block';
    attachMoneyFormatter(document.getElementById('wl-price'));
    openSheet('wishlist-modal');
  } catch(err) {
    console.error('openEditWishlist error:', err);
    showToast('Gagal: ' + err.message, 'error');
  }
}

async function submitWishlistModal() {
  const name = document.getElementById('wl-name')?.value.trim();
  const price = parseMoneyInput(document.getElementById('wl-price')?.value);
  const note = document.getElementById('wl-note')?.value.trim() || '';
  const url = document.getElementById('wl-url')?.value.trim() || '';
  const targetDate = document.getElementById('wl-target-date')?.value || null;
  const linkedAccount = document.getElementById('wl-account')?.value || null;

  if (!name) { showToast('Nama wajib diisi', 'error'); return; }
  if (!price || price <= 0) { showToast('Harga harus > 0', 'error'); return; }

  const payload = {
    name,
    price,
    priority: _wlPriority,
    note,
    url,
    target_date: targetDate || null,
    linked_account_id: linkedAccount || null,
  };

  try {
    if (_editingWishlistId) {
      await DB.updateWishlist(_editingWishlistId, payload);
      showToast('Wishlist diupdate ✓');
    } else {
      payload.status = 'planning';
      payload.saved_amount = 0;
      await DB.createWishlist(payload);
      showToast('Wishlist ditambah ✓');
    }
    closeSheet('wishlist-modal');
    if (state.currentPage === 'wishlist' || state.currentPage === 'dashboard') navigate(state.currentPage);
    else navigate('wishlist');
  } catch(e) {
    showToast('Gagal: ' + e.message, 'error');
  }
}

function deleteWishlistFromModal() {
  if (!_editingWishlistId) return;
  const w = state.wishlist.find(x => x.id === _editingWishlistId);
  if (!w) return;
  if (typeof window.showConfirm === 'function') {
    window.showConfirm('🗑️', 'Hapus Wishlist', `Hapus "${w.name}" dari wishlist?`, 'Hapus', 'btn-danger', async () => {
      try {
        await DB.deleteWishlist(_editingWishlistId);
        closeSheet('wishlist-modal');
        showToast('Wishlist dihapus ✓');
        navigate('wishlist');
      } catch(e) {
        showToast('Gagal: ' + e.message, 'error');
      }
    });
  }
}

// ── Mark as Bought ───────────────────────────────────────────────────────

function openMarkBoughtWishlist(id) {
  try {
    const w = state.wishlist.find(x => x.id === id);
    if (!w) return;
    _buyingWishlistId = id;
    const setVal = (elId, val) => { const el = document.getElementById(elId); if (el) el.value = val; };
    const priceStr = String(Math.round(Number(w.price)||0)).replace(/\B(?=(\d{3})+(?!\d))/g, '.');
    setVal('wl-buy-amount', priceStr);
    setVal('wl-buy-note', `Wishlist: ${w.name}`);
    _populateBuyAccountSelect(w.linked_account_id || state.accounts[0]?.id);
    _populateBuyCategorySelect();
    const title = document.getElementById('wl-buy-title');
    if (title) title.textContent = `Beli: ${w.name}`;
    attachMoneyFormatter(document.getElementById('wl-buy-amount'));
    openSheet('wishlist-buy-modal');
  } catch(err) {
    console.error('openMarkBoughtWishlist error:', err);
    showToast('Gagal: ' + err.message, 'error');
  }
}

async function submitMarkBoughtWishlist() {
  if (!_buyingWishlistId) return;
  const amount = parseMoneyInput(document.getElementById('wl-buy-amount')?.value);
  const accountId = document.getElementById('wl-buy-account')?.value;
  const category = document.getElementById('wl-buy-category')?.value || '🛍️ Belanja';
  const note = document.getElementById('wl-buy-note')?.value.trim() || '';

  if (!amount || amount <= 0) { showToast('Jumlah tidak valid', 'error'); return; }
  if (!accountId) { showToast('Pilih rekening', 'error'); return; }

  try {
    await DB.markWishlistBought(_buyingWishlistId, { accountId, amount, category, note });
    closeSheet('wishlist-buy-modal');
    showToast('Pembelian dicatat & transaksi dibuat ✓');
    navigate(state.currentPage || 'wishlist');
  } catch(e) {
    showToast('Gagal: ' + e.message, 'error');
  }
}

// ── Add Savings Progress ─────────────────────────────────────────────────

function openSaveToWishlist(id) {
  try {
    const w = state.wishlist.find(x => x.id === id);
    if (!w) return;
    _savingWishlistId = id;
    const setVal = (elId, val) => { const el = document.getElementById(elId); if (el) el.value = val; };
    const setTxt = (elId, val) => { const el = document.getElementById(elId); if (el) el.textContent = val; };
    setVal('wl-save-amount', '');
    const saved = Number(w.saved_amount)||0;
    const remaining = Math.max(0, Number(w.price) - saved);
    const fmtRp = n => 'Rp ' + Math.round(n).toLocaleString('id-ID');
    setTxt('wl-save-progress', `${w.name}: ${fmtRp(saved)} / ${fmtRp(w.price)} (sisa ${fmtRp(remaining)})`);
    const title = document.getElementById('wl-save-title');
    if (title) title.textContent = `Tabung untuk: ${w.name}`;
    attachMoneyFormatter(document.getElementById('wl-save-amount'));
    openSheet('wishlist-save-modal');
  } catch(err) {
    console.error('openSaveToWishlist error:', err);
    showToast('Gagal: ' + err.message, 'error');
  }
}

async function submitSaveToWishlist() {
  if (!_savingWishlistId) return;
  const amount = parseMoneyInput(document.getElementById('wl-save-amount')?.value);
  if (!amount || amount <= 0) { showToast('Jumlah harus > 0', 'error'); return; }

  try {
    await DB.addSavingsToWishlist(_savingWishlistId, amount);
    closeSheet('wishlist-save-modal');
    showToast(`Tabungan ditambah ✓`);
    navigate(state.currentPage || 'wishlist');
  } catch(e) {
    showToast('Gagal: ' + e.message, 'error');
  }
}

// ── Expose ───────────────────────────────────────────────────────────────

window.openAddWishlist = openAddWishlist;
window.openEditWishlist = openEditWishlist;
window.setWishlistPriority = setWishlistPriority;
window.submitWishlistModal = submitWishlistModal;
window.deleteWishlistFromModal = deleteWishlistFromModal;
window.openMarkBoughtWishlist = openMarkBoughtWishlist;
window.submitMarkBoughtWishlist = submitMarkBoughtWishlist;
window.openSaveToWishlist = openSaveToWishlist;
window.submitSaveToWishlist = submitSaveToWishlist;
