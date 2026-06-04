// src/js/lib/config.js
// ── App-wide constants & configuration ──────────────────────────────

export const SUPABASE_URL = 'https://bzgettxcnseptzczrdhz.supabase.co'
export const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJ6Z2V0dHhjbnNlcHR6Y3pyZGh6Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzk2MDk5NTgsImV4cCI6MjA5NTE4NTk1OH0.rWCfq56G0q8nF2yWWEVOzsTDKDnXRyCOzqjmrhVNsZE'

export const AI_PROXY_URL = '/api/ai-proxy'

export const AVATAR_COLORS = [
  '#ff7c5c','#4ecdc4','#a29bfe','#f0b958',
  '#7ab8f5','#c77dda','#5ec97e','#e17055',
]

export const BANKS = [
  { name: 'BCA',       emoji: '🏦' },
  { name: 'Mandiri',   emoji: '🏦' },
  { name: 'BNI',       emoji: '🏦' },
  { name: 'BRI',       emoji: '🏦' },
  { name: 'GoPay',     emoji: '💚' },
  { name: 'OVO',       emoji: '💜' },
  { name: 'Dana',      emoji: '🔵' },
  { name: 'ShopeePay', emoji: '🛍️' },
  { name: 'Tunai',     emoji: '💵' },
  { name: 'Lainnya +', emoji: '➕' },
]

export const KNOWN_BANKS = {
  seabank:  { emoji: '🌊' }, jenius: { emoji: '⚡' },
  allo:     { emoji: '🟠' }, jago:   { emoji: '🐆' },
  ocbc:     { emoji: '🔴' }, bsi:    { emoji: '☪️' },
  blu:      { emoji: '🔵' }, dbs:    { emoji: '🟢' },
  linkaja:  { emoji: '🔴' }, bibit:  { emoji: '🌱' },
  ajaib:    { emoji: '⚡' }, pluang: { emoji: '📈' },
}

export const ACCT_TYPES = [
  { id: 'Debit',     icon: '💳', color: '#7ab8f5' },
  { id: 'Kredit',    icon: '💳', color: '#f06070' },
  { id: 'Tunai',     icon: '💵', color: '#5ec97e' },
  { id: 'E-Wallet',  icon: '📱', color: '#a29bfe' },
  { id: 'Investasi', icon: '📈', color: '#f0b958' },
  { id: 'Pinjaman',  icon: '💸', color: '#f06070' },
]

export const ACCT_COLORS = [
  '#ff7c5c','#7ab8f5','#5ec97e','#f0b958','#a29bfe','#4ecdc4',
  '#f06070','#c77dda','#fd79a8','#fdcb6e','#00b894','#e17055',
  '#74b9ff','#55efc4','#636e72','#b2bec3',
]

// Default categories
export const DEFAULT_CATS = [
  // Needs
  { id: 'food',       name: 'Food',          icon: '🍜', color: '#ff7c5c', group: 'Needs',      type: 'expense' },
  { id: 'grocery',    name: 'Grocery',       icon: '🛒', color: '#fdcb6e', group: 'Needs',      type: 'expense' },
  { id: 'transport',  name: 'Transport',     icon: '🚌', color: '#4ecdc4', group: 'Needs',      type: 'expense' },
  { id: 'housing',    name: 'Housing',       icon: '🏠', color: '#0984e3', group: 'Needs',      type: 'expense' },
  { id: 'utilities',  name: 'Utilities',     icon: '💡', color: '#fdcb6e', group: 'Needs',      type: 'expense' },
  { id: 'medical',    name: 'Medical',       icon: '💊', color: '#fd79a8', group: 'Needs',      type: 'expense' },
  { id: 'education',  name: 'Education',     icon: '📚', color: '#a29bfe', group: 'Needs',      type: 'expense' },
  { id: 'phone',      name: 'Phone / Data',  icon: '📱', color: '#74b9ff', group: 'Needs',      type: 'expense' },
  // Wants
  { id: 'dining',     name: 'Dining Out',    icon: '🍽️', color: '#e17055', group: 'Wants',      type: 'expense' },
  { id: 'coffee',     name: 'Coffee',        icon: '☕', color: '#c67c4e', group: 'Wants',      type: 'expense' },
  { id: 'shopping',   name: 'Shopping',      icon: '🛍️', color: '#a29bfe', group: 'Wants',      type: 'expense' },
  { id: 'fashion',    name: 'Fashion',       icon: '👗', color: '#fd79a8', group: 'Wants',      type: 'expense' },
  { id: 'entertain',  name: 'Entertainment', icon: '🎮', color: '#6c5ce7', group: 'Wants',      type: 'expense' },
  { id: 'streaming',  name: 'Streaming',     icon: '📺', color: '#e84393', group: 'Wants',      type: 'expense' },
  { id: 'travel',     name: 'Travel',        icon: '✈️', color: '#00b894', group: 'Wants',      type: 'expense' },
  { id: 'beauty',     name: 'Beauty',        icon: '💄', color: '#fd79a8', group: 'Wants',      type: 'expense' },
  { id: 'sport',      name: 'Sport / Gym',   icon: '🏋️', color: '#55efc4', group: 'Wants',      type: 'expense' },
  { id: 'gifts',      name: 'Gifts',         icon: '🎁', color: '#fdcb6e', group: 'Wants',      type: 'expense' },
  // Savings
  { id: 'savings',    name: 'Savings',       icon: '🏦', color: '#00b894', group: 'Savings',    type: 'expense' },
  { id: 'invest',     name: 'Investment',    icon: '📈', color: '#74b9ff', group: 'Savings',    type: 'expense' },
  { id: 'insurance',  name: 'Insurance',     icon: '🛡️', color: '#7ab8f5', group: 'Savings',    type: 'expense' },
  // Ungrouped
  { id: 'tax',        name: 'Tax',           icon: '🧾', color: '#636e72', group: 'Ungrouped',  type: 'expense' },
  { id: 'donation',   name: 'Donation',      icon: '🤲', color: '#55efc4', group: 'Ungrouped',  type: 'expense' },
  { id: 'other_e',    name: 'Other',         icon: '📦', color: '#636e72', group: 'Ungrouped',  type: 'expense' },
  // Income
  { id: 'salary',     name: 'Salary',        icon: '💰', color: '#00b894', group: 'Pemasukan',  type: 'income'  },
  { id: 'freelance',  name: 'Freelance',     icon: '💼', color: '#55efc4', group: 'Pemasukan',  type: 'income'  },
  { id: 'business',   name: 'Business',      icon: '🏪', color: '#fdcb6e', group: 'Pemasukan',  type: 'income'  },
  { id: 'invest_in',  name: 'Investment',    icon: '📈', color: '#74b9ff', group: 'Pemasukan',  type: 'income'  },
  { id: 'rent_in',    name: 'Rental Income', icon: '🏠', color: '#0984e3', group: 'Pemasukan',  type: 'income'  },
  { id: 'bonus',      name: 'Bonus / Gift',  icon: '🎁', color: '#fd79a8', group: 'Pemasukan',  type: 'income'  },
  { id: 'other_i',    name: 'Other',         icon: '💵', color: '#b2bec3', group: 'Ungrouped',  type: 'income'  },
]

export const GROUP_ORDER_EXPENSE = ['Needs', 'Wants', 'Savings', 'Ungrouped']
export const GROUP_ORDER_INCOME  = ['Pemasukan', 'Ungrouped']

export const PAGE_TITLES = {
  dashboard:    'Dashboard',
  accounts:     'Rekening',
  accountDetail: 'Detail Rekening',
  transactions: 'Transaksi',
  transfer:     'Transfer',
  budget:       'Anggaran',
  recurring:    'Rutin',
  debts:        'Hutang & Piutang',
  wishlist:     'Wishlist',
  scan:         'Scan Struk',
  splitbill:    'Split Bill',
  bills:        'Tagihan',
  advisor:      'AI Advisor',
  categories:   'Kelola Kategori',
  notifSettings:'Notifikasi',
  reports:      'Laporan',
  settings:     'Pengaturan',
}

export const CAT_EMOJI_OPTIONS = [
  '🍜','☕','🛒','🚌','⛽','🅿️','🛍️','👗','📱','💡','🏠','🌐','💧',
  '💊','🏋️','🎮','📺','✈️','📚','🎓','🎁','🤲','📦','💰','💼','🏪',
  '📈','🎯','🏦','💳','💵','🪙','🔥','⚡','🌊','🍕','🍔','🥗','🍰',
  '🎵','🎬','🏥','🚗','🚕','🏫','👶','🐾','🌿','💎','🔑','🛠️','🎨',
  '🎤','🎸','⚽','🏀','🏊','🧘','🧴','💄','🪴','🐶','🍺','🍷','🥂',
]

export const CAT_COLOR_OPTIONS = [
  '#ff7c5c','#ff6b6b','#fdcb6e','#f0b958','#55efc4','#00b894',
  '#4ecdc4','#74b9ff','#7ab8f5','#a29bfe','#6c5ce7','#fd79a8',
  '#e84393','#c77dda','#636e72','#0984e3','#e17055','#b2bec3',
]

export const BANK_ICONS = {
  'BCA': '🏦', 'Mandiri': '🏦', 'BNI': '🏦', 'BRI': '🏦',
  'GoPay': '💚', 'OVO': '💜', 'Dana': '🔵', 'ShopeePay': '🛍️',
  'Tunai': '💵', 'SeaBank': '🌊', 'Jenius': '⚡', 'Blu': '🔵',
  'Jago': '🐆', 'Allo': '🟠', 'OCBC': '🔴', 'BSI': '☪️',
  'LinkAja': '🔴', 'Bibit': '🌱', 'Ajaib': '⚡',
}

export const CURRENCIES = [
  { code: 'IDR', symbol: 'Rp', name: 'Rupiah Indonesia', locale: 'id-ID' },
  { code: 'USD', symbol: '$',  name: 'US Dollar',        locale: 'en-US' },
  { code: 'EUR', symbol: '€',  name: 'Euro',             locale: 'de-DE' },
  { code: 'JPY', symbol: '¥',  name: 'Japanese Yen',     locale: 'ja-JP' },
  { code: 'SGD', symbol: 'S$', name: 'Singapore Dollar', locale: 'en-SG' },
  { code: 'MYR', symbol: 'RM', name: 'Malaysian Ringgit',locale: 'ms-MY' },
  { code: 'GBP', symbol: '£',  name: 'British Pound',    locale: 'en-GB' },
  { code: 'AUD', symbol: 'A$', name: 'Australian Dollar',locale: 'en-AU' },
  { code: 'CNY', symbol: '¥',  name: 'Chinese Yuan',     locale: 'zh-CN' },
  { code: 'KRW', symbol: '₩',  name: 'Korean Won',       locale: 'ko-KR' },
]

export function getCurrentCurrency() {
  const code = localStorage.getItem('currency') || 'IDR'
  return CURRENCIES.find(c => c.code === code) || CURRENCIES[0]
}
