// src/js/ui/modals.js
import { state }          from '../lib/store.js'
import { showToast }      from '../lib/toast.js'
import { navigate }       from '../lib/router.js'
import { fmt, fmtShort } from '../lib/utils.js'
import { CATEGORIES, getCatGroups } from '../lib/categories.js'
import { BANKS, ACCT_TYPES, ACCT_COLORS, AVATAR_COLORS } from '../lib/config.js'
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
  if (!el) return;
  const cats = getAcctCats();
  el.innerHTML = cats.map(c => {
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
  if (!el) return;
  el.innerHTML = PRESET_BANKS.map(b => {
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
  _editingAccountId = null;
  _selectedBank     = 'BCA';
  _selectedAcctColor= '#ff7c5c';
  _selectedAcctCat  = 'Tabungan';
  _selectedAcctType = 'Debit';
  _selectedEmoji    = '🏦';
  _customBankMode   = false;
  _customBankName   = '';
  document.getElementById('acct-modal-title').textContent = 'Tambah Rekening';
  document.getElementById('acct-name').value = '';
  document.getElementById('acct-balance').value = '';
  document.getElementById('acct-submit-btn').textContent = 'Simpan Rekening';
  document.getElementById('acct-delete-wrap').style.display = 'none';
  document.getElementById('custom-bank-name').value = '';
  openSheet('account-modal');
  setTimeout(initAcctModal, 30);
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
  if (!name) { showToast('Masukkan nama rekening', 'error'); return; }
  const bankFinal = _customBankMode ? (_customBankName.trim() || 'Lainnya') : _selectedBank;
  if (!bankFinal) { showToast('Pilih atau ketik nama bank/dompet', 'error'); return; }
  const btn = document.getElementById('acct-submit-btn');
  btn.disabled = true; btn.textContent = 'Menyimpan...';
  const payload = {
    name, bank: bankFinal, balance,
    color: _selectedAcctColor,
    category: _selectedAcctCat,
    icon: _selectedEmoji,
    acct_type: _selectedAcctType,
  };
  if (_editingAccountId) {
    const {error} = await state.supabase.from('accounts').update(payload).eq('id',_editingAccountId);
    if (error) { showToast(error.message,'error'); btn.disabled=false; btn.textContent='Simpan Perubahan'; return; }
    if (a) Object.assign(a, payload);
    showToast('Rekening diperbarui ✓');
  } else {
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

function openAddBudget() {
  _selectedBudgetCat = '';
  document.getElementById('budget-limit').value = '';
  renderBudgetCatPicker();
  openSheet('budget-modal');
}

function renderBudgetCatPicker() {
  const groups = getCatGroups('expense');
  document.getElementById('budget-cat-picker').innerHTML = Object.entries(groups).map(([grp,cats])=>`
    <div style="width:100%;font-size:10px;font-weight:700;color:var(--text3);letter-spacing:.5px;text-transform:uppercase;padding:6px 2px 4px;margin-top:4px">${grp}</div>
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
  const limit = parseFloat(document.getElementById('budget-limit').value);
  if (!limit || limit <= 0) { showToast('Masukkan jumlah anggaran', 'error'); return; }
  const mk = monthKey(new Date());
  const { data, error } = await state.supabase.from('budgets')
    .upsert([{ user_id: state.currentUser.id, category: _selectedBudgetCat, limit_amount: limit, month: mk }], { onConflict: 'user_id,category,month' })
    .select().single();
  if (error) { showToast(error.message, 'error'); return; }
  const idx = state.budgets.findIndex(b => b.id === data.id);
  if (idx >= 0) state.budgets[idx] = data; else state.budgets.push(data);
  closeSheet('budget-modal');
  showToast('Anggaran disimpan!');
  navigate('budget');
}

// ===== RECURRING MODAL =====
let _recType = 'expense';

function openAddRecurring() {
  _recType = 'expense';
  document.getElementById('rec-name').value = '';
  document.getElementById('rec-amount').value = '';
  // populate selects
  document.getElementById('rec-category').innerHTML = cats.map(c => `<option value="${c}">${c}</option>`).join('');
  document.getElementById('rec-account').innerHTML = state.accounts.map(a => `<option value="${a.id}">${a.name}</option>`).join('') || '<option>Tambah rekening dulu</option>';
  // set type toggle
  const btns = document.querySelectorAll('#rec-type-toggle .type-btn');
  btns.forEach((b,i) => { b.classList.remove('active-expense','active-income'); });
  btns[0].classList.add('active-expense');
  openSheet('recurring-modal');
}

function setRecType(type) {
  _recType = type;
  btns.forEach(b => b.classList.remove('active-expense','active-income'));
  btns[type==='expense'?0:1].classList.add('active-'+type);
  document.getElementById('rec-category').innerHTML = Object.entries(groups).map(([grp,cats])=>
    `<optgroup label="${grp}">`+cats.map(c=>`<option value="${c.icon+' '+c.name}">${c.icon+' '+c.name}</option>`).join('')+`</optgroup>`
  ).join('');
}

async function submitRecurringModal() {
  const amount = parseFloat(document.getElementById('rec-amount').value);
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
  _debtDir = 'lent';
  document.getElementById('debt-contact').value = '';
  document.getElementById('debt-amount').value = '';
  document.getElementById('debt-note').value = '';
  document.getElementById('debt-due').value = '';
  btns.forEach(b => b.classList.remove('active-income','active-expense'));
  btns[0].classList.add('active-income');
  openSheet('debt-modal');
}

function setDebtDir(dir) {
  _debtDir = dir;
  btns.forEach(b => b.classList.remove('active-income','active-expense'));
  btns[dir==='lent'?0:1].classList.add(dir==='lent'?'active-income':'active-expense');
}

async function submitDebtModal() {
  const note = document.getElementById('debt-note').value.trim();
  const dueStr = document.getElementById('debt-due').value || null;
  if (!name) { showToast('Masukkan nama orang', 'error'); return; }
  if (!amount) { showToast('Masukkan jumlah', 'error'); return; }
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
  document.getElementById('settle-title').textContent = `Pelunasan — ${d.contact_name}`;
  document.getElementById('settle-remaining').textContent = fmt(d.remaining);
  document.getElementById('settle-amount').value = '';
  openSheet('settle-modal');
}

async function submitSettleModal() {
  if (!d) return;
  const partial = parseFloat(document.getElementById('settle-amount').value);
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

// ── GROUP MANAGER ──────────────────────────────────────────────────
function openGroupManager() {
  const type   = _catPageType;
  const order  = getAllGroupsOrdered(type);
  let existing = document.getElementById('cat-add-sheet');
  if (existing) existing.remove();

  const sheetEl = document.createElement('div');
  sheetEl.id    = 'cat-add-sheet';
  sheetEl.className = 'sheet-overlay open';
  sheetEl.innerHTML = `
    <div class="sheet" style="max-width:500px">
      <div class="sheet-handle"></div>
      <div class="sheet-head">
        <div class="sheet-title">📂 Kelola Klasifikasi</div>
        <button class="sheet-close" onclick="closeCatSheet()">✕</button>
      </div>
      <div class="sheet-body">
        <div style="font-size:13px;color:var(--text2);margin-bottom:16px">
          Tambah atau hapus grup klasifikasi. Grup bawaan (Needs/Wants/Savings) tidak bisa dihapus.
        </div>
        <div id="group-list-mgr" style="display:flex;flex-direction:column;gap:6px;margin-bottom:20px">
          ${order.map((g,i) => {
            const isBuiltin = ['Needs','Wants','Savings','Ungrouped','Pemasukan'].includes(g);
            return `<div style="display:flex;align-items:center;gap:10px;padding:11px 14px;background:var(--bg3);border-radius:10px">
              <div style="font-size:20px">📂</div>
              <div style="flex:1;font-size:14px;font-weight:600">${g}</div>
              ${!isBuiltin ? `<button class="btn btn-sm btn-danger" onclick="deleteGroup('${g}')">Hapus</button>` : `<span style="font-size:11px;color:var(--text3)">bawaan</span>`}
            </div>`;
          }).join('')}
        </div>
        <div class="field">
          <label>Nama Grup Baru</label>
          <input type="text" id="new-group-name" placeholder="mis. Hobi, Anak, Tabungan Khusus..."
            onkeydown="if(event.key==='Enter')addNewGroup()"/>
        </div>
        <button class="btn btn-accent" style="width:100%;justify-content:center" onclick="addNewGroup()">+ Tambah Klasifikasi</button>
      </div>
    </div>`;
  document.body.appendChild(sheetEl);
  sheetEl.addEventListener('click', e => { if(e.target===sheetEl) closeCatSheet(); });
}

function openGroupEditor(groupName) {
  let existing = document.getElementById('cat-add-sheet');
  if (existing) existing.remove();

  sheetEl.id    = 'cat-add-sheet';
  sheetEl.className = 'sheet-overlay open';
  sheetEl.innerHTML = `
    <div class="sheet" style="max-width:400px">
      <div class="sheet-handle"></div>
      <div class="sheet-head">
        <div class="sheet-title">✏️ Edit Klasifikasi</div>
        <button class="sheet-close" onclick="closeCatSheet()">✕</button>
      </div>
      <div class="sheet-body">
        <div class="field">
          <label>Nama Klasifikasi</label>
          <input type="text" id="edit-group-name" value="${groupName}" ${isBuiltin?'readonly style="opacity:0.5"':''}/>
          ${isBuiltin?'<div style="font-size:11px;color:var(--text3);margin-top:4px">Nama klasifikasi bawaan tidak bisa diubah</div>':''}
        </div>
        <div class="sheet-actions">
          <button class="btn btn-ghost" onclick="closeCatSheet()">Batal</button>
          ${!isBuiltin?`<button class="btn btn-accent" onclick="renameGroup('${groupName}')">Simpan</button>`:''}
        </div>
        ${!isBuiltin?`<button class="btn btn-danger" style="width:100%;justify-content:center;margin-top:8px" onclick="deleteGroup('${groupName}')">🗑️ Hapus Klasifikasi Ini</button>`:''}
      </div>
    </div>`;
  document.body.appendChild(sheetEl);
  sheetEl.addEventListener('click', e => { if(e.target===sheetEl) closeCatSheet(); });
}

function addNewGroup() {
  if (!name) { showToast('Masukkan nama grup','error'); return; }
  if (order.includes(name)) { showToast('Grup sudah ada','error'); return; }
  // Insert before Ungrouped
  const uIdx = order.indexOf('Ungrouped');
  if (uIdx >= 0) order.splice(uIdx, 0, name); else order.push(name);
  saveGroupOrder(type, order);
  showToast('Klasifikasi "'+name+'" ditambahkan!');
  closeCatSheet();
  navigate('categories');
}

function renameGroup(oldName) {
  const newName = document.getElementById('edit-group-name')?.value.trim();
  if (!newName || newName === oldName) { closeCatSheet(); return; }
  if (idx >= 0) order[idx] = newName;
  saveGroupOrder(type, order);
  // Update all cats in this group
  const custom = JSON.parse(localStorage.getItem('custom_cats_v2') || '[]');
  custom.forEach(c => { if (c.group === oldName) c.group = newName; });
  localStorage.setItem('custom_cats_v2', JSON.stringify(custom));
  // Update overridden defaults too
  // cats that are default overrides already in custom list — handled above
  showToast('Diganti menjadi "'+newName+'"');
  closeCatSheet();
  navigate('categories');
}

function deleteGroup(groupName) {
  if (cats.length > 0) {
    // Move all cats in this group to Ungrouped
    cats.forEach(c => {
      if (isDefault) {
        if (!hidden.includes(c.id)) hidden.push(c.id);
        if (idx>=0) custom[idx].group='Ungrouped';
        else custom.push({...isDefault, group:'Ungrouped'});
      } else {
        if (idx>=0) custom[idx].group='Ungrouped';
      }
    });
    localStorage.setItem('custom_cats_v2', JSON.stringify(custom));
    localStorage.setItem('hidden_cats', JSON.stringify(hidden));
  }
  saveGroupOrder(type, order.filter(g=>g!==groupName));
  showToast('"'+groupName+'" dihapus, kategori dipindah ke Ungrouped');
  closeCatSheet();
  navigate('categories');
}


// ── Add / Edit sheet ─────────────────────────────────────────────────
function openAddCatSheet() {
  _editingCatId = null;
  _newCatEmoji  = '📦';
  _newCatColor  = '#ff7c5c';
  _newCatType   = _catPageType;
  _newCatGroup  = '';
  buildCatSheet('Tambah Kategori', '', '', false);
}
function openEditCatSheet(id) {
  const c = getAllCats().find(x=>x.id===id);
  if (!c) return;
  _editingCatId = id;
  _newCatEmoji  = c.icon;
  _newCatColor  = c.color;
  _newCatType   = c.type;
  _newCatGroup  = c.group;
  buildCatSheet('Edit Kategori', c.name, c.group, true);
}

function buildCatSheet(title, nameVal, groupVal, isEdit) {
  // Inject a temporary sheet into the page
  let existing = document.getElementById('cat-add-sheet');
  if (existing) existing.remove();

  const allCats = getAllCats();

  sheetEl.id = 'cat-add-sheet';
  sheetEl.className = 'sheet-overlay open';
  sheetEl.innerHTML = `
    <div class="sheet" style="max-width:500px">
      <div class="sheet-handle"></div>
      <div class="sheet-head">
        <div class="sheet-title">${title}</div>
        <button class="sheet-close" onclick="closeCatSheet()">✕</button>
      </div>
      <div class="sheet-body">

        <div class="field">
          <label>Jenis</label>
          <div style="display:flex;gap:6px">
            <div class="pill ${_newCatType==='expense'?'active':''}" id="ctype-exp" onclick="setCatSheetType('expense')">💸 Pengeluaran</div>
            <div class="pill ${_newCatType==='income'?'active':''}" id="ctype-inc" onclick="setCatSheetType('income')">💰 Pemasukan</div>
          </div>
        </div>

        <div class="field-row">
          <div class="field">
            <label>Nama Kategori</label>
            <input type="text" id="cs-name" value="${nameVal}" placeholder="mis. Streaming, Gym..."/>
          </div>
          <div class="field">
            <label>Grup</label>
            <input type="text" id="cs-group" value="${groupVal || _newCatGroup}" placeholder="mis. Hiburan, Rumah..." list="cs-group-list"/>
            <datalist id="cs-group-list">
              ${groups.map(g=>`<option value="${g}">`).join('')}
            </datalist>
          </div>
        </div>

        <div class="field">
          <label>Ikon</label>
          <div class="emoji-pick-grid" id="cs-emoji-grid">
            ${CAT_EMOJI_OPTIONS.map(e=>`
              <span class="emoji-pick-item${e===_newCatEmoji?' sel':''}" onclick="setCatSheetEmoji('${e}')">${e}</span>
            `).join('')}
          </div>
        </div>

        <div class="field">
          <label>Warna</label>
          <div style="display:flex;gap:7px;flex-wrap:wrap" id="cs-color-grid">
            ${CAT_COLOR_OPTIONS.map(c=>`
              <div onclick="setCatSheetColor('${c}')" style="width:28px;height:28px;border-radius:50%;background:${c};cursor:pointer;flex-shrink:0;
                border:3px solid ${c===_newCatColor?'#fff':'transparent'};
                box-shadow:${c===_newCatColor?'0 0 0 2px '+c:'none'};transition:.15s"></div>
            `).join('')}
          </div>
        </div>

        <!-- Preview row -->
        <div style="display:flex;align-items:center;gap:12px;background:var(--bg3);border-radius:10px;padding:12px 14px;margin-bottom:4px">
          <div id="cs-prev-icon" style="width:44px;height:44px;border-radius:12px;background:${_newCatColor}22;display:flex;align-items:center;justify-content:center;font-size:24px">${_newCatEmoji}</div>
          <div style="flex:1">
            <div id="cs-prev-name" style="font-size:14px;font-weight:600">${nameVal||'Nama Kategori'}</div>
            <div id="cs-prev-group" style="font-size:11px;color:var(--text2)">${groupVal||_newCatGroup||'Grup'}</div>
          </div>
          <div id="cs-prev-dot" style="width:10px;height:10px;border-radius:50%;background:${_newCatColor}"></div>
        </div>

        <div class="sheet-actions" style="margin-top:16px">
          <button class="btn btn-ghost" onclick="closeCatSheet()">Batal</button>
          <button class="btn btn-accent" onclick="saveCatSheet(${isEdit})">${isEdit?'Simpan Perubahan':'Tambah Kategori'}</button>
        </div>
        ${isEdit&&_editingCatId?`<button class="btn btn-danger" style="width:100%;justify-content:center;margin-top:8px" onclick="deleteCat('${_editingCatId}')">🗑️ Hapus Kategori Ini</button>`:''}
      </div>
    </div>`;

  document.body.appendChild(sheetEl);
  sheetEl.addEventListener('click', e => { if(e.target===sheetEl) closeCatSheet(); });

  // Live preview bindings
  setTimeout(()=>{
    document.getElementById('cs-name')?.addEventListener('input', e=>{
      if(el) el.textContent = e.target.value || 'Nama Kategori';
    });
    document.getElementById('cs-group')?.addEventListener('input', e=>{
      if(el) el.textContent = e.target.value || 'Grup';
    });
  }, 30);
}

function closeCatSheet() {
  document.getElementById('cat-add-sheet')?.remove();
}

function setCatSheetType(t) {
  _newCatType = t;
  document.getElementById('ctype-exp')?.classList.toggle('active', t==='expense');
  document.getElementById('ctype-inc')?.classList.toggle('active', t==='income');
}

function setCatSheetEmoji(e) {
  _newCatEmoji = e;
  document.querySelectorAll('.emoji-pick-item').forEach(el =>
    el.classList.toggle('sel', el.textContent === e));
  const prev = document.getElementById('cs-prev-icon');
  if(prev) { prev.textContent = e; prev.style.background = _newCatColor+'22'; }
}

function setCatSheetColor(c) {
  _newCatColor = c;
  document.querySelectorAll('#cs-color-grid div').forEach(el => {
    const ec = el.style.background;
    el.style.border = `3px solid ${active?'#fff':'transparent'}`;
    el.style.boxShadow = active ? `0 0 0 2px ${c}` : 'none';
  });
  if(prev) prev.style.background = c+'22';
  const dot = document.getElementById('cs-prev-dot');
  if(dot) dot.style.background = c;
}

function saveCatSheet(isEdit) {
  const group = document.getElementById('cs-group')?.value.trim();
  if (!name)  { showToast('Masukkan nama kategori','error'); return; }
  if (!group) { showToast('Masukkan nama grup','error'); return; }


  if (isEdit && _editingCatId) {
    if (isDefault) {
      // Override default: hide original, save modified version as custom with same id
      if (!hidden.includes(_editingCatId)) { hidden.push(_editingCatId); localStorage.setItem('hidden_cats', JSON.stringify(hidden)); }
      if (idx >= 0) existing[idx] = {id:_editingCatId, name, group, icon:_newCatEmoji, color:_newCatColor, type:_newCatType};
      else existing.push({id:_editingCatId, name, group, icon:_newCatEmoji, color:_newCatColor, type:_newCatType});
    } else {
      if (idx >= 0) existing[idx] = {...existing[idx], name, group, icon:_newCatEmoji, color:_newCatColor, type:_newCatType};
    }
    showToast('Kategori diperbarui ✓');
  } else {
    const id = 'custom_' + Date.now();
    existing.push({id, name, icon:_newCatEmoji, color:_newCatColor, group, type:_newCatType});
    showToast(`"${_newCatEmoji} ${name}" ditambahkan!`);
  }

  localStorage.setItem('custom_cats_v2', JSON.stringify(existing));
  _catPageType = _newCatType;
  closeCatSheet();
  navigate('categories');
}

// keep old name working
function toggleAddCatForm() { openAddCatSheet(); }
function setNewCatType(t)   { _newCatType = t; }
function setNewCatEmoji(e)  { _newCatEmoji = e; }
function setNewCatColor(c)  { _newCatColor = c; }
function saveNewCategory()  { saveCatSheet(false); }


export function initModals() {
  injectModalHTML()
  // window assignments already done at module level above
}

function injectModalHTML() {
  // Modal HTML is already in index.html shell — nothing to inject
}

// ===== ADD/EDIT TRANSACTION =====
let editingTxId = null;
let txType = 'expense';
function openAddTransaction() {
  editingTxId = null;
  document.getElementById('tx-amount').value = '';
  document.getElementById('tx-note').value = '';
  document.getElementById('tx-date').value = new Date().toISOString().split('T')[0];
  setTxType('expense');
  populateTxAccounts();
  document.getElementById('tx-modal').classList.add('open');
}

function openEditTx(id) {
  const t = state.transactions.find(x=>x.id===id);
  if (!t) return;
  editingTxId = id;
  setTxType(t.type);
  document.getElementById('tx-amount').value = t.amount;
  document.getElementById('tx-note').value = t.note||'';
  document.getElementById('tx-date').value = t.date;
  populateTxAccounts(t.account_id, t.to_account_id, t.category);
  document.getElementById('tx-modal').classList.add('open');
}

function closeTxModal() { document.getElementById('tx-modal').classList.remove('open'); }

function setTxType(type) {
  txType = type;
  const btns = document.querySelectorAll('#tx-type-toggle .type-btn');
  btns.forEach((b,i)=>{
    b.classList.remove('active-expense','active-income','active-transfer');
    if(['expense','income','transfer'][i]===type) b.classList.add('active-'+type);
  });
  document.getElementById('tx-toac-wrap').style.display = type==='transfer'?'block':'none';
  document.getElementById('tx-cat-wrap').style.display = type==='transfer'?'none':'block';
  populateTxCategories();
}

function populateTxAccounts(selAc, selToAc, selCat) {
  const ac = document.getElementById('tx-account');
  const toAc = document.getElementById('tx-to-account');
  const opts = state.accounts.map(a=>`<option value="${a.id}" ${a.id===selAc?'selected':''}>${BANK_ICONS[a.bank]||'💳'} ${a.name} (${fmtShort(a.balance)})</option>`).join('');
  ac.innerHTML = opts || '<option>Tambah rekening dulu</option>';
  toAc.innerHTML = opts;
  if (selToAc) { [...toAc.options].forEach(o=>{ if(o.value===selToAc) o.selected=true; }); }
  populateTxCategories(selCat);
}

function populateTxCategories(selCat) {
  const type = txType === 'income' ? 'income' : 'expense';
  const groups = getCatGroups(type);
  const sel = document.getElementById('tx-category');
  sel.innerHTML = Object.entries(groups).map(([grp, cats]) =>
    `<optgroup label="${grp}">` +
    cats.map(c => {
      const full = c.icon+' '+c.name;
      return `<option value="${full}" ${full===selCat||c.name===selCat?'selected':''}>${full}</option>`;
    }).join('') +
    `</optgroup>`
  ).join('');
}

async function saveTx() {
  const btn = document.getElementById('save-tx-btn');
  const amount = parseFloat(document.getElementById('tx-amount').value);
  const account_id = document.getElementById('tx-account').value;
  const note = document.getElementById('tx-note').value.trim();
  const date = document.getElementById('tx-date').value;
  const category = txType!=='transfer' ? document.getElementById('tx-category').value : '↔️ Transfer';
  const to_account_id = txType==='transfer' ? document.getElementById('tx-to-account').value : null;

  if (!amount || amount <= 0) { showToast('Masukkan jumlah yang valid','error'); return; }
  if (!account_id) { showToast('Pilih rekening','error'); return; }
  if (!date) { showToast('Pilih tanggal','error'); return; }

  btn.disabled = true;
  btn.innerHTML = '<span class="btn-spinner"></span>Menyimpan...';

  const payload = { user_id:state.currentUser.id, type:txType, amount, category, account_id, to_account_id, note, date };

  try {
    if (editingTxId) {
      // Reverse old balance effect
      const old = state.transactions.find(t=>t.id===editingTxId);
      if (old) await reverseBalance(old);
      await state.supabase.from('transactions').update(payload).eq('id',editingTxId);
      const idx = state.transactions.findIndex(t=>t.id===editingTxId);
      if(idx>=0) state.transactions[idx] = {...allTransactions[idx],...payload};
    } else {
      const { data, error } = await state.supabase.from('transactions').insert([payload]).select().single();
      if (error) throw error;
      state.transactions.unshift(data);
    }
    await applyBalance(payload);
    closeTxModal();
    showToast(editingTxId ? 'Transaksi diperbarui' : 'Transaksi disimpan!');
    editingTxId = null;
    navigate(currentPage);
  } catch(e) {
    showToast(e.message,'error');
    btn.disabled = false;
    btn.textContent = 'Simpan Transaksi';
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
window.selectBudgetCat        = selectBudgetCat
window.renderBudgetCatPicker  = renderBudgetCatPicker
window.submitBudgetModal      = submitBudgetModal
window.openAddRecurring       = openAddRecurring
window.setRecType             = setRecType
window.submitRecurringModal   = submitRecurringModal
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
