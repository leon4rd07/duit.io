// src/js/lib/supabase.js
// ── All Supabase / database operations in one place ───────────────────
import { createClient } from '@supabase/supabase-js'
import { SUPABASE_URL, SUPABASE_KEY } from './config.js'
import { state } from './store.js'

// Initialize client
export const db = createClient(SUPABASE_URL, SUPABASE_KEY)
state.supabase = db

// ── Auth ──────────────────────────────────────────────────────────────

export const getSession = () => db.auth.getSession()

export const signIn = (email, password) =>
  db.auth.signInWithPassword({ email, password })

export const signUp = (email, password, fullName) =>
  db.auth.signUp({ email, password, options: { data: { full_name: fullName } } })

export const signOut = () => db.auth.signOut()

// ── Load all user data ────────────────────────────────────────────────

export async function loadAllData() {
  const uid = state.currentUser.id
  const [ac, tx, bg, rc, db_] = await Promise.all([
    db.from('accounts').select('*').eq('user_id', uid).order('created_at'),
    db.from('transactions').select('*').eq('user_id', uid)
      .order('date', { ascending: false })
      .order('created_at', { ascending: false }),
    db.from('budgets').select('*').eq('user_id', uid),
    db.from('recurring').select('*').eq('user_id', uid).order('created_at'),
    db.from('debts').select('*').eq('user_id', uid).order('created_at', { ascending: false }),
  ])
  state.accounts     = ac.data  || []
  state.transactions = tx.data  || []
  state.budgets      = bg.data  || []
  state.recurring    = rc.data  || []
  state.debts        = db_.data || []

  // Load category settings (custom cats, hidden cats, group order) into localStorage
  await loadCategorySettings()
}

// ── Category settings sync (cross-device categories) ─────────────────
// Settings are kept in localStorage for sync API to existing code.
// On loadAllData we pull from Supabase → write to localStorage (overrides local).
// After every mutation, categories.js calls saveCategorySettings to push back.

export async function loadCategorySettings() {
  if (!state.currentUser) return
  try {
    const { data, error } = await db.from('category_settings')
      .select('*').eq('user_id', state.currentUser.id).maybeSingle()
    if (error) { console.warn('loadCategorySettings:', error.message); return }

    if (data) {
      // Backend has settings → mirror to localStorage so the existing API reads them
      if (Array.isArray(data.custom_cats))
        localStorage.setItem('custom_cats_v2', JSON.stringify(data.custom_cats))
      if (Array.isArray(data.hidden_cats))
        localStorage.setItem('hidden_cats', JSON.stringify(data.hidden_cats))
      if (Array.isArray(data.group_order_expense))
        localStorage.setItem('group_order_expense', JSON.stringify(data.group_order_expense))
      if (Array.isArray(data.group_order_income))
        localStorage.setItem('group_order_income', JSON.stringify(data.group_order_income))
    } else {
      // First time for this user → backfill backend from whatever is in localStorage
      await saveCategorySettings()
    }
  } catch (e) {
    console.warn('loadCategorySettings error:', e)
  }
}

let _catSaveTimer = null
export function saveCategorySettings() {
  if (!state.currentUser) return
  // Debounce so rapid mutations only fire one network write
  if (_catSaveTimer) clearTimeout(_catSaveTimer)
  _catSaveTimer = setTimeout(async () => {
    try {
      const parse = (k, def) => {
        try { return JSON.parse(localStorage.getItem(k)) ?? def } catch { return def }
      }
      const payload = {
        user_id: state.currentUser.id,
        custom_cats:         parse('custom_cats_v2', []),
        hidden_cats:         parse('hidden_cats', []),
        group_order_expense: parse('group_order_expense', null),
        group_order_income:  parse('group_order_income', null),
        updated_at:          new Date().toISOString(),
      }
      const { error } = await db.from('category_settings')
        .upsert(payload, { onConflict: 'user_id' })
      if (error) console.warn('saveCategorySettings:', error.message)
    } catch (e) {
      console.warn('saveCategorySettings error:', e)
    }
  }, 600) // debounce 600ms
}

// ── Accounts ─────────────────────────────────────────────────────────

export async function createAccount(payload) {
  const { data, error } = await db.from('accounts')
    .insert([{ user_id: state.currentUser.id, ...payload }])
    .select().single()
  if (error) throw error
  state.accounts.push(data)
  return data
}

export async function updateAccount(id, payload) {
  const { error } = await db.from('accounts').update(payload).eq('id', id)
  if (error) throw error
  const a = state.accounts.find(x => x.id === id)
  if (a) Object.assign(a, payload)
}

export async function deleteAccount(id) {
  const { error } = await db.from('accounts').delete().eq('id', id)
  if (error) throw error
  state.accounts = state.accounts.filter(a => a.id !== id)
}

export async function updateAccountBalance(id, delta) {
  const acct = state.accounts.find(a => a.id === id)
  if (!acct) return
  const newBalance = Number(acct.balance) + delta
  await updateAccount(id, { balance: newBalance })
}

/**
 * Set an account's balance to an absolute value.
 * By default creates an adjustment transaction for the difference (keeps history).
 * Pass opts.silent=true to set the balance directly WITHOUT creating a transaction —
 * useful for correcting drift to match the real bank balance.
 * @returns {Promise<{tx: object|null, diff: number}>}
 */
export async function setAccountBalance(id, newBalance, opts = {}) {
  const acct = state.accounts.find(a => a.id === id)
  if (!acct) throw new Error('Rekening tidak ditemukan')
  const oldBalance = Number(acct.balance) || 0
  const target = Number(newBalance) || 0
  const diff = target - oldBalance

  // No change → nothing to do
  if (Math.abs(diff) < 0.5) return { tx: null, diff: 0 }

  // Silent correction: just set the balance, no adjustment transaction
  if (opts.silent) {
    await updateAccount(id, { balance: target })
    return { tx: null, diff }
  }

  // Create an adjustment transaction for the difference
  const txType = diff >= 0 ? 'income' : 'expense'
  const payload = {
    type: txType,
    amount: Math.abs(diff),
    category: opts.category || 'Penyesuaian',
    note: opts.note || 'Penyesuaian saldo manual',
    account_id: id,
    date: opts.date || new Date().toISOString().slice(0, 10),
  }

  const tx = await createTransaction(payload) // also updates state + balance
  return { tx, diff }
}

// ── Transactions ──────────────────────────────────────────────────────

export async function createTransaction(payload) {
  const { data, error } = await db.from('transactions')
    .insert([{ user_id: state.currentUser.id, ...payload }])
    .select().single()
  if (error) throw error
  state.transactions.unshift(data)
  await applyBalanceEffect(payload)
  return data
}

export async function updateTransaction(id, newPayload) {
  // Snapshot the OLD values into a plain object BEFORE any async work, so that
  // mutating state.transactions[idx] later can't corrupt the reversal math.
  const existing = state.transactions.find(t => t.id === id)
  const oldSnapshot = existing ? {
    type: existing.type,
    amount: existing.amount,
    account_id: existing.account_id,
    to_account_id: existing.to_account_id,
  } : null

  if (oldSnapshot) await reverseBalanceEffect(oldSnapshot)

  const { error } = await db.from('transactions').update(newPayload).eq('id', id)
  if (error) throw error

  const idx = state.transactions.findIndex(t => t.id === id)
  if (idx >= 0) Object.assign(state.transactions[idx], newPayload)

  await applyBalanceEffect(newPayload)
}

export async function deleteTransaction(id) {
  const tx = state.transactions.find(t => t.id === id)
  if (tx) await reverseBalanceEffect(tx)
  await db.from('transactions').delete().eq('id', id)
  state.transactions = state.transactions.filter(t => t.id !== id)
}

// Internal: apply balance change from a transaction
async function applyBalanceEffect(tx) {
  const acct = state.accounts.find(a => a.id === tx.account_id)
  if (!acct) return
  let delta = 0
  if (tx.type === 'income')   delta = +Number(tx.amount)
  if (tx.type === 'expense')  delta = -Number(tx.amount)
  if (tx.type === 'transfer') {
    delta = -Number(tx.amount)
    await updateAccountBalance(tx.to_account_id, +Number(tx.amount))
  }
  if (delta !== 0) await updateAccountBalance(tx.account_id, delta)
}

// Internal: reverse balance change (for edit/delete)
async function reverseBalanceEffect(tx) {
  const acct = state.accounts.find(a => a.id === tx.account_id)
  if (!acct) return
  let delta = 0
  if (tx.type === 'income')   delta = -Number(tx.amount)
  if (tx.type === 'expense')  delta = +Number(tx.amount)
  if (tx.type === 'transfer') {
    delta = +Number(tx.amount)
    await updateAccountBalance(tx.to_account_id, -Number(tx.amount))
  }
  if (delta !== 0) await updateAccountBalance(tx.account_id, delta)
}

// ── Budgets ───────────────────────────────────────────────────────────

export async function upsertBudget(category, limitAmount, month) {
  const { data, error } = await db.from('budgets')
    .upsert([{ user_id: state.currentUser.id, category, limit_amount: limitAmount, month }],
      { onConflict: 'user_id,category,month' })
    .select().single()
  if (error) throw error
  const idx = state.budgets.findIndex(b => b.id === data.id)
  if (idx >= 0) state.budgets[idx] = data
  else state.budgets.push(data)
  return data
}

export async function deleteBudget(id) {
  await db.from('budgets').delete().eq('id', id)
  state.budgets = state.budgets.filter(b => b.id !== id)
}

// ── Recurring ─────────────────────────────────────────────────────────

export async function createRecurring(payload) {
  const { data, error } = await db.from('recurring')
    .insert([{ user_id: state.currentUser.id, ...payload }])
    .select().single()
  if (error) throw error
  state.recurring.push(data)
  return data
}

export async function deleteRecurring(id) {
  await db.from('recurring').delete().eq('id', id)
  state.recurring = state.recurring.filter(r => r.id !== id)
}

// ── Debts ─────────────────────────────────────────────────────────────

export async function createDebt(payload) {
  const { data, error } = await db.from('debts')
    .insert([{ user_id: state.currentUser.id, ...payload }])
    .select().single()
  if (error) throw error
  state.debts.unshift(data)
  return data
}

export async function updateDebt(id, payload) {
  await db.from('debts').update(payload).eq('id', id)
  const d = state.debts.find(x => x.id === id)
  if (d) Object.assign(d, payload)
}
