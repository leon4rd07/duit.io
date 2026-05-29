// src/js/lib/store.js
// ── Centralized app state ─────────────────────────────────────────────
// Single source of truth — all modules import from here

export const state = {
  // Auth
  currentUser: null,
  supabase:    null,

  // Data
  accounts:     [],
  transactions: [],
  budgets:      [],
  recurring:    [],
  debts:        [],

  // UI
  currentPage:    'dashboard',
  dashboardMonth: new Date(),
  txFilter:       'Semua',
  txView:         'list',         // 'list' | 'calendar'
  calMonth:       new Date(),
  calSelectedDate: null,
  theme:          'dark',         // 'dark' | 'light'

  // Scan
  scanImageData:     null,
  scanImageBase64Full: '',
  scanImageMimeType: 'image/jpeg',
  scanIsAnalyzing:   false,
  lastScanResult:    null,
  selectedScanAccountId: '',

  // Split bill
  sb: {
    step: 'home',
    note: '',
    totalAmount: 0,
    taxAmount: 0,
    serviceAmount: 0,
    discountAmount: 0,
    subtotal: 0,
    items: [],
    members: [{ name: 'Saya', paid: true, isMe: true }],
    memberSearch: '',
    scanImgData: null,
    scanImgMime: 'image/jpeg',
    scanImgFull: '',
    payAccountId: '',
  },

  // Category manager
  catPageType: 'expense',
  showAddCatForm: false,
  newCat: {
    emoji: '📦', color: '#ff7c5c', type: 'expense', group: '',
  },
  editingCatId: null,
}

/** Reset split bill state */
export function resetSplitState() {
  state.sb = {
    step: 'home', note: '', totalAmount: 0, taxAmount: 0,
    serviceAmount: 0, discountAmount: 0, subtotal: 0,
    items: [], members: [{ name: 'Saya', paid: true, isMe: true }],
    memberSearch: '', scanImgData: null, scanImgMime: 'image/jpeg',
    scanImgFull: '', payAccountId: state.accounts[0]?.id || '',
  }
}

// ── Global helper functions ───────────────────────────────────────────
export function getAccount(id) {
  return state.accounts.find(a => a.id === id)
}

export function fmtShortLocal(n) {
  const a = Math.abs(n)
  if (a >= 1e9) return 'Rp ' + (a/1e9).toFixed(1) + 'M'
  if (a >= 1e6) return 'Rp ' + (a/1e6).toFixed(1) + 'jt'
  if (a >= 1e3) return 'Rp ' + (a/1e3).toFixed(0) + 'rb'
  return 'Rp ' + a
}
window.getAccount = getAccount
