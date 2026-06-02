// src/js/lib/aiActions.js
// ── AI Action System: parse, validate, and execute actions from AI responses ─

import { state } from './store.js'
import { getAllCats } from './categories.js'
import * as DB from './supabase.js'
import { monthKey, toLocalDateString } from './utils.js'

// ── ACTION DEFINITIONS (used in AI system prompt) ─────────────────────────

export const ACTION_DEFINITIONS = `
DAFTAR AKSI YANG TERSEDIA:

1. Ubah saldo rekening (set ke nilai baru):
<ACTION>{"type":"update_balance","account":"<nama rekening>","amount":<nilai baru>}</ACTION>

2. Tambah transaksi (income/expense/transfer):
<ACTION>{"type":"add_transaction","tx_type":"expense","amount":<jumlah>,"account":"<rekening>","category":"<kategori>","note":"<keterangan>","date":"YYYY-MM-DD (opsional, default hari ini)"}</ACTION>
Untuk transfer, tambah field "to_account":"<rekening tujuan>", category abaikan.

3. Hapus transaksi (gunakan id 8-char dari daftar transaksi di konteks):
<ACTION>{"type":"delete_transaction","id":"<id pendek>"}</ACTION>

4. Tambah/update anggaran (jika kategori sudah ada → update, kalau belum → buat):
<ACTION>{"type":"upsert_budget","category":"<kategori>","amount":<limit>,"month":"YYYY-MM (opsional, default bulan ini)"}</ACTION>

5. Hapus anggaran:
<ACTION>{"type":"delete_budget","category":"<kategori>","month":"YYYY-MM (opsional, default bulan ini)"}</ACTION>

6. Tambah hutang/piutang:
<ACTION>{"type":"add_debt","direction":"owe","contact":"<nama>","amount":<jumlah>,"note":"<keterangan>","due":"YYYY-MM-DD (opsional)"}</ACTION>
direction: "owe" = saya hutang ke dia, "lent" = dia hutang ke saya.

7. Catat pelunasan hutang (gunakan id 8-char dari daftar hutang aktif di konteks):
<ACTION>{"type":"settle_debt","id":"<id pendek>","amount":<jumlah, kosong=lunas penuh>}</ACTION>

ATURAN PENTING UNTUK AKSI:
- Selalu balas dulu dengan kalimat singkat menjelaskan apa yang akan dilakukan, BARU lampirkan <ACTION>...</ACTION>
- JSON di dalam <ACTION> harus valid (tanda kutip ganda, koma benar)
- Gunakan nama rekening/kategori/kontak yang COCOK dengan data di konteks. Kalau nama tidak jelas atau ambigu, TANYAKAN dulu — jangan menebak.
- Konversi sebutan jumlah ke angka penuh: "100rb" → 100000, "1 juta" → 1000000, "500k" → 500000.
- Boleh beberapa aksi sekaligus dalam satu respons (multiple <ACTION> blocks).
- Setiap aksi akan ditampilkan ke pengguna untuk dikonfirmasi sebelum dijalankan, jadi aman.
- Kalau user cuma tanya tanpa minta aksi, JANGAN keluarkan <ACTION> block — cukup jawab biasa.
`

// ── PARSE: extract <ACTION> blocks from AI response text ──────────────────

const ACTION_RE = /<ACTION>([\s\S]*?)<\/ACTION>/g

/**
 * Parse AI response. Returns { cleanText, actions }
 * Strips <ACTION> blocks from display text.
 */
export function parseActions(text) {
  if (!text) return { cleanText: text || '', actions: [] }

  const actions = []
  let m
  // Reset lastIndex for repeated calls
  ACTION_RE.lastIndex = 0
  while ((m = ACTION_RE.exec(text)) !== null) {
    const raw = m[1].trim()
    try {
      const action = JSON.parse(raw)
      if (action && typeof action === 'object' && action.type) {
        actions.push({ ...action, status: 'pending' })
      }
    } catch (e) {
      // Malformed JSON — skip but log
      console.warn('Failed to parse action JSON:', raw, e)
    }
  }

  const cleanText = text.replace(ACTION_RE, '').replace(/\n{3,}/g, '\n\n').trim()
  return { cleanText, actions }
}

// ── FUZZY MATCH HELPERS ───────────────────────────────────────────────────

export function findAccountByName(name) {
  if (!name) return null
  const n = String(name).toLowerCase().trim()
  // 1. exact name match
  let m = state.accounts.find(a => (a.name || '').toLowerCase() === n)
  if (m) return m
  // 2. exact bank match
  m = state.accounts.find(a => (a.bank || '').toLowerCase() === n)
  if (m) return m
  // 3. name contains
  m = state.accounts.find(a => (a.name || '').toLowerCase().includes(n))
  if (m) return m
  // 4. bank contains
  m = state.accounts.find(a => (a.bank || '').toLowerCase().includes(n))
  if (m) return m
  return null
}

export function findCategoryName(input, type) {
  if (!input) return null
  const all = getAllCats().filter(c => !type || c.type === type || c.type === 'both')
  const n = String(input).toLowerCase().trim()
  // exact full "icon + name"
  let m = all.find(c => `${c.icon} ${c.name}`.toLowerCase() === n)
  if (m) return `${m.icon} ${m.name}`
  // name only
  m = all.find(c => c.name.toLowerCase() === n)
  if (m) return `${m.icon} ${m.name}`
  // partial name
  m = all.find(c => c.name.toLowerCase().includes(n) || n.includes(c.name.toLowerCase()))
  if (m) return `${m.icon} ${m.name}`
  return null
}

function findTransactionById(shortId) {
  if (!shortId) return null
  const s = String(shortId).toLowerCase()
  return state.transactions.find(t => (t.id || '').toLowerCase().startsWith(s))
}

function findDebtById(shortId) {
  if (!shortId) return null
  const s = String(shortId).toLowerCase()
  return state.debts.find(d => (d.id || '').toLowerCase().startsWith(s))
}

// ── DESCRIBE (human-readable card titles) ────────────────────────────────

function rp(n) {
  return 'Rp ' + Math.round(Number(n) || 0).toLocaleString('id-ID')
}

/**
 * Returns { icon, title, lines: [strings], warning: string|null }
 * Used to render the confirm card.
 */
export function describeAction(action) {
  switch (action.type) {
    case 'update_balance': {
      const acc = findAccountByName(action.account)
      if (!acc) return {
        icon: '⚠️',
        title: 'Update Saldo',
        lines: [`Rekening "${action.account}" tidak ditemukan`],
        warning: 'invalid'
      }
      return {
        icon: '💰',
        title: 'Update Saldo',
        lines: [
          `${acc.name} (${acc.bank})`,
          `${rp(acc.balance)} → ${rp(action.amount)}`,
        ],
        warning: null,
      }
    }
    case 'add_transaction': {
      const acc = findAccountByName(action.account)
      const toAcc = action.tx_type === 'transfer' ? findAccountByName(action.to_account) : null
      const lines = []
      const typeLabel = { expense: 'Pengeluaran', income: 'Pemasukan', transfer: 'Transfer' }[action.tx_type] || action.tx_type
      lines.push(`${typeLabel}: ${rp(action.amount)}`)
      if (action.tx_type === 'transfer') {
        lines.push(`Dari: ${acc ? acc.name : '⚠️ ' + (action.account || '?')}`)
        lines.push(`Ke: ${toAcc ? toAcc.name : '⚠️ ' + (action.to_account || '?')}`)
      } else {
        const cat = findCategoryName(action.category, action.tx_type)
        lines.push(`Rekening: ${acc ? acc.name : '⚠️ ' + (action.account || '?')}`)
        if (cat) lines.push(`Kategori: ${cat}`)
        else if (action.category) lines.push(`Kategori: ⚠️ "${action.category}" (tidak ditemukan)`)
      }
      if (action.note) lines.push(`Note: ${action.note}`)
      lines.push(`Tanggal: ${action.date || toLocalDateString(new Date())}`)
      const invalid = !acc || (action.tx_type === 'transfer' && !toAcc)
      return {
        icon: action.tx_type === 'income' ? '💵' : action.tx_type === 'transfer' ? '↔️' : '💸',
        title: 'Tambah Transaksi',
        lines,
        warning: invalid ? 'invalid' : null,
      }
    }
    case 'delete_transaction': {
      const tx = findTransactionById(action.id)
      if (!tx) return {
        icon: '⚠️',
        title: 'Hapus Transaksi',
        lines: [`Transaksi id "${action.id}" tidak ditemukan`],
        warning: 'invalid'
      }
      const acc = state.accounts.find(a => a.id === tx.account_id)
      return {
        icon: '🗑️',
        title: 'Hapus Transaksi',
        lines: [
          `${tx.date} · ${rp(tx.amount)}`,
          `${tx.category || 'Transfer'}${acc ? ' · ' + acc.name : ''}`,
          tx.note ? `Note: ${tx.note}` : '',
        ].filter(Boolean),
        warning: 'destructive',
      }
    }
    case 'upsert_budget': {
      const cat = findCategoryName(action.category, 'expense')
      const mk = action.month || monthKey(new Date())
      const existing = state.budgets.find(b => b.category === cat && b.month === mk)
      return {
        icon: '🎯',
        title: existing ? 'Update Anggaran' : 'Tambah Anggaran',
        lines: [
          `Kategori: ${cat || '⚠️ ' + (action.category || '?')}`,
          `Bulan: ${mk}`,
          existing
            ? `Limit: ${rp(existing.limit_amount)} → ${rp(action.amount)}`
            : `Limit: ${rp(action.amount)}`,
        ],
        warning: cat ? null : 'invalid',
      }
    }
    case 'delete_budget': {
      const cat = findCategoryName(action.category, 'expense')
      const mk = action.month || monthKey(new Date())
      const existing = state.budgets.find(b => b.category === cat && b.month === mk)
      if (!existing) return {
        icon: '⚠️',
        title: 'Hapus Anggaran',
        lines: [`Anggaran "${action.category}" untuk ${mk} tidak ditemukan`],
        warning: 'invalid',
      }
      return {
        icon: '🗑️',
        title: 'Hapus Anggaran',
        lines: [`${cat} (${mk})`, `Limit: ${rp(existing.limit_amount)}`],
        warning: 'destructive',
      }
    }
    case 'add_debt': {
      const dirLabel = action.direction === 'lent' ? 'Piutang (dia hutang ke saya)' : 'Hutang (saya hutang ke dia)'
      return {
        icon: action.direction === 'lent' ? '📤' : '📥',
        title: 'Tambah ' + (action.direction === 'lent' ? 'Piutang' : 'Hutang'),
        lines: [
          dirLabel,
          `Kontak: ${action.contact}`,
          `Jumlah: ${rp(action.amount)}`,
          action.note ? `Note: ${action.note}` : '',
          action.due ? `Jatuh tempo: ${action.due}` : '',
        ].filter(Boolean),
        warning: !action.contact || !action.amount ? 'invalid' : null,
      }
    }
    case 'settle_debt': {
      const d = findDebtById(action.id)
      if (!d) return {
        icon: '⚠️',
        title: 'Pelunasan',
        lines: [`Hutang id "${action.id}" tidak ditemukan`],
        warning: 'invalid',
      }
      const payAmt = action.amount && Number(action.amount) > 0 ? Number(action.amount) : Number(d.remaining)
      return {
        icon: '✅',
        title: 'Catat Pelunasan',
        lines: [
          `${d.contact_name} (${d.direction === 'lent' ? 'piutang' : 'hutang'})`,
          `Sisa: ${rp(d.remaining)}`,
          `Bayar: ${rp(payAmt)}`,
        ],
        warning: null,
      }
    }
    default:
      return {
        icon: '❓',
        title: 'Aksi tidak dikenal',
        lines: [`type: ${action.type || '?'}`],
        warning: 'invalid',
      }
  }
}

// ── EXECUTE (perform the action against Supabase + state) ────────────────

/**
 * Execute an action. Throws on failure with a descriptive message.
 * Returns a short success message on success.
 */
export async function executeAction(action) {
  switch (action.type) {
    case 'update_balance': {
      const acc = findAccountByName(action.account)
      if (!acc) throw new Error(`Rekening "${action.account}" tidak ditemukan`)
      const newBalance = Number(action.amount)
      if (!isFinite(newBalance)) throw new Error('Jumlah saldo tidak valid')
      await DB.updateAccount(acc.id, { balance: newBalance })
      return `Saldo ${acc.name} diubah ke ${rp(newBalance)}`
    }

    case 'add_transaction': {
      const acc = findAccountByName(action.account)
      if (!acc) throw new Error(`Rekening "${action.account}" tidak ditemukan`)
      const amount = Number(action.amount)
      if (!amount || amount <= 0) throw new Error('Jumlah tidak valid')
      const txType = ['expense', 'income', 'transfer'].includes(action.tx_type) ? action.tx_type : 'expense'

      let to_account_id = null
      let category = null
      if (txType === 'transfer') {
        const toAcc = findAccountByName(action.to_account)
        if (!toAcc) throw new Error(`Rekening tujuan "${action.to_account}" tidak ditemukan`)
        if (toAcc.id === acc.id) throw new Error('Rekening asal dan tujuan tidak boleh sama')
        to_account_id = toAcc.id
        category = '↔️ Transfer'
      } else {
        category = findCategoryName(action.category, txType) || (action.category || 'Lainnya')
      }

      const payload = {
        type: txType,
        amount,
        category,
        account_id: acc.id,
        to_account_id,
        note: action.note || '',
        date: action.date || toLocalDateString(new Date()),
      }
      await DB.createTransaction(payload)
      return `Transaksi ${rp(amount)} tercatat`
    }

    case 'delete_transaction': {
      const tx = findTransactionById(action.id)
      if (!tx) throw new Error(`Transaksi id "${action.id}" tidak ditemukan`)
      await DB.deleteTransaction(tx.id)
      return `Transaksi ${tx.date} ${rp(tx.amount)} dihapus`
    }

    case 'upsert_budget': {
      const cat = findCategoryName(action.category, 'expense')
      if (!cat) throw new Error(`Kategori "${action.category}" tidak ditemukan`)
      const amount = Number(action.amount)
      if (!amount || amount <= 0) throw new Error('Jumlah anggaran tidak valid')
      const mk = action.month || monthKey(new Date())
      await DB.upsertBudget(cat, amount, mk)
      // Refresh budgets from DB or update locally
      const idx = state.budgets.findIndex(b => b.category === cat && b.month === mk)
      if (idx >= 0) {
        state.budgets[idx].limit_amount = amount
      } else {
        state.budgets.push({ category: cat, limit_amount: amount, month: mk })
      }
      return `Anggaran ${cat} ${mk}: ${rp(amount)}`
    }

    case 'delete_budget': {
      const cat = findCategoryName(action.category, 'expense')
      if (!cat) throw new Error(`Kategori "${action.category}" tidak ditemukan`)
      const mk = action.month || monthKey(new Date())
      const existing = state.budgets.find(b => b.category === cat && b.month === mk)
      if (!existing) throw new Error(`Anggaran ${cat} ${mk} tidak ditemukan`)
      if (existing.id) {
        await DB.deleteBudget(existing.id)
      } else {
        // Fallback: delete by category/month if no id
        await DB.db.from('budgets').delete().eq('category', cat).eq('month', mk)
      }
      state.budgets = state.budgets.filter(b => !(b.category === cat && b.month === mk))
      return `Anggaran ${cat} ${mk} dihapus`
    }

    case 'add_debt': {
      const direction = action.direction === 'lent' ? 'lent' : 'owe'
      const amount = Number(action.amount)
      if (!action.contact) throw new Error('Nama kontak wajib diisi')
      if (!amount || amount <= 0) throw new Error('Jumlah tidak valid')
      const payload = {
        direction,
        contact_name: action.contact,
        amount,
        remaining: amount,
        note: action.note || '',
        due_date: action.due || null,
        settled: false,
      }
      const data = await DB.createDebt(payload)
      if (data) state.debts.unshift(data)
      return `${direction === 'lent' ? 'Piutang' : 'Hutang'} ${action.contact}: ${rp(amount)} tercatat`
    }

    case 'settle_debt': {
      const d = findDebtById(action.id)
      if (!d) throw new Error(`Hutang id "${action.id}" tidak ditemukan`)
      const payAmt = action.amount && Number(action.amount) > 0 ? Number(action.amount) : Number(d.remaining)
      const newRemaining = Math.max(0, Number(d.remaining) - payAmt)
      const settled = newRemaining <= 0
      await DB.updateDebt(d.id, { remaining: newRemaining, settled })
      const idx = state.debts.findIndex(x => x.id === d.id)
      if (idx >= 0) {
        state.debts[idx].remaining = newRemaining
        state.debts[idx].settled = settled
      }
      return `Pelunasan ${d.contact_name} ${rp(payAmt)} dicatat${settled ? ' (lunas ✓)' : ''}`
    }

    default:
      throw new Error(`Aksi "${action.type}" tidak dikenal`)
  }
}
