// src/js/pages/categoryPage.js
import { state } from '../lib/store.js'
import { showToast } from '../lib/toast.js'
import { navigate } from '../lib/router.js'
import { fmtShort } from '../lib/utils.js'
import {
  getAllCats, getCatGroups, getCatObj, getAllGroupsOrdered,
  addCategory, updateCategory, deleteCategory,
  addGroup,
  saveGroupOrder, getGroupOrder,
  DEFAULT_CATS, CATEGORIES
} from '../lib/categories.js'
import { AVATAR_COLORS, CAT_EMOJI_OPTIONS, CAT_COLOR_OPTIONS } from '../lib/config.js'

// Replace global references with state
const allAccounts = () => state.accounts
const allTransactions = () => state.transactions


// Local deleteCat wrapper
function deleteCat(id) {
  deleteCategory(id)
  closeCatSheet()
  showToast('Kategori dihapus')
  navigate('categories')
}

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

  const groups = getCatGroups(_catPageType);

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
  const el = document.getElementById('grp-'+grp.replace(/\s/g,'_'));
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
    const idx = existing.findIndex(c=>c.id===catId);
    const src = isDefault;
    if (idx >= 0) existing[idx].group = newGroup;
    else existing.push({...src, group: newGroup});
  } else {
    const idx = existing.findIndex(c=>c.id===catId);
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
              ${!isBuiltin ? `<button class="btn btn-sm btn-danger" onclick="('${g}')">Hapus</button>` : `<span style="font-size:11px;color:var(--text3)">bawaan</span>`}
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
  const isBuiltin = ['Needs','Wants','Savings','Ungrouped','Pemasukan'].includes(groupName);

  const sheetEl = document.createElement('div');
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
        ${!isBuiltin?`<button class="btn btn-danger" style="width:100%;justify-content:center;margin-top:8px" onclick="('${groupName}')">🗑️ Hapus Klasifikasi Ini</button>`:''}
      </div>
    </div>`;
  document.body.appendChild(sheetEl);
  sheetEl.addEventListener('click', e => { if(e.target===sheetEl) closeCatSheet(); });
}

function addNewGroup() {
  const name = document.getElementById('new-group-name')?.value.trim();
  if (!name) { showToast('Masukkan nama grup','error'); return; }
  const type  = _catPageType;
  const order = getGroupOrder(type);
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
  const type  = _catPageType;
  const order = getGroupOrder(type);
  const idx   = order.indexOf(oldName);
  if (idx >= 0) order[idx] = newName;
  saveGroupOrder(type, order);
  // Update all cats in this group
  const custom = JSON.parse(localStorage.getItem('custom_cats_v2') || '[]');
  custom.forEach(c => { if (c.group === oldName) c.group = newName; });
  localStorage.setItem('custom_cats_v2', JSON.stringify(custom));
  // Update overridden defaults too
  const hidden = JSON.parse(localStorage.getItem('hidden_cats') || '[]');
  // cats that are default overrides already in custom list — handled above
  showToast('Diganti menjadi "'+newName+'"');
  closeCatSheet();
  navigate('categories');
}

function deleteGroup(groupName) {
  const type   = _catPageType;
  const order  = getGroupOrder(type);
  const groups = getCatGroups(type);
  const cats   = groups[groupName] || [];
  if (cats.length > 0) {
    // Move all cats in this group to Ungrouped
    const custom = JSON.parse(localStorage.getItem('custom_cats_v2') || '[]');
    const hidden = JSON.parse(localStorage.getItem('hidden_cats') || '[]');
    cats.forEach(c => {
      const isDefault = DEFAULT_CATS.find(d=>d.id===c.id);
      if (isDefault) {
        if (!hidden.includes(c.id)) hidden.push(c.id);
        const idx = custom.findIndex(x=>x.id===c.id);
        if (idx>=0) custom[idx].group='Ungrouped';
        else custom.push({...isDefault, group:'Ungrouped'});
      } else {
        const idx = custom.findIndex(x=>x.id===c.id);
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
  const groups = getAllGroupsOrdered(_newCatType);

  const sheetEl = document.createElement('div');
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
      const el = document.getElementById('cs-prev-name');
      if(el) el.textContent = e.target.value || 'Nama Kategori';
    });
    document.getElementById('cs-group')?.addEventListener('input', e=>{
      const el = document.getElementById('cs-prev-group');
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
    const active = ec === c || el.onclick?.toString().includes(`'${c}'`);
    el.style.border = `3px solid ${active?'#fff':'transparent'}`;
    el.style.boxShadow = active ? `0 0 0 2px ${c}` : 'none';
  });
  const prev = document.getElementById('cs-prev-icon');
  if(prev) prev.style.background = c+'22';
  const dot = document.getElementById('cs-prev-dot');
  if(dot) dot.style.background = c;
}

function saveCatSheet(isEdit) {
  const name  = document.getElementById('cs-name')?.value.trim();
  const group = document.getElementById('cs-group')?.value.trim();
  if (!name)  { showToast('Masukkan nama kategori','error'); return; }
  if (!group) { showToast('Masukkan nama grup','error'); return; }

  const existing = JSON.parse(localStorage.getItem('custom_cats_v2') || '[]');

  if (isEdit && _editingCatId) {
    const isDefault = DEFAULT_CATS.find(c=>c.id===_editingCatId);
    if (isDefault) {
      // Override default: hide original, save modified version as custom with same id
      const hidden = JSON.parse(localStorage.getItem('hidden_cats') || '[]');
      if (!hidden.includes(_editingCatId)) { hidden.push(_editingCatId); localStorage.setItem('hidden_cats', JSON.stringify(hidden)); }
      const idx = existing.findIndex(c=>c.id===_editingCatId);
      if (idx >= 0) existing[idx] = {id:_editingCatId, name, group, icon:_newCatEmoji, color:_newCatColor, type:_newCatType};
      else existing.push({id:_editingCatId, name, group, icon:_newCatEmoji, color:_newCatColor, type:_newCatType});
    } else {
      const idx = existing.findIndex(c=>c.id===_editingCatId);
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



export { renderCategoryManager }

window.setCatPageType    = setCatPageType
window.openAddCatSheet   = openAddCatSheet
window.openEditCatSheet  = openEditCatSheet
window.closeCatSheet     = closeCatSheet
window.setCatSheetType   = setCatSheetType
window.setCatSheetEmoji  = setCatSheetEmoji
window.setCatSheetColor  = setCatSheetColor
window.saveCatSheet      = saveCatSheet
window.openGroupManager  = openGroupManager
window.openGroupEditor   = openGroupEditor
window.addNewGroup       = addNewGroup
window.deleteCat         = deleteCat
window.handleCatDragStart= handleCatDragStart
window.handleCatDragEnd  = handleCatDragEnd
window.handleDropToGroup = handleDropToGroup
window.handleDropBeforeItem = handleDropBeforeItem
window.moveCatToGroup    = moveCatToGroup
