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
  const [ac, tx, bg, rc, db_, wl] = await Promise.all([
    db.from('accounts').select('*').eq('user_id', uid).order('created_at'),
    db.from('transactions').select('*').eq('user_id', uid)
      .order('date', { ascending: false })
      .order('created_at', { ascending: false }),
    db.from('budgets').select('*').eq('user_id', uid),
    db.from('recurring').select('*').eq('user_id', uid).order('created_at'),
    db.from('debts').select('*').eq('user_id', uid).order('created_at', { ascending: false }),
    db.from('wishlist').select('*').eq('user_id', uid).order('created_at', { ascending: false }),
  ])
  state.accounts     = ac.data  || []
  state.transactions = tx.data  || []
  state.budgets      = bg.data  || []
  state.recurring    = rc.data  || []
  state.debts        = db_.data || []
  state.wishlist     = wl?.error ? [] : (wl?.data || [])
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
  const old = state.transactions.find(t => t.id === id)
  if (old) await reverseBalanceEffect(old)

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

// ── Wishlist ─────────────────────────────────────────────────────────────

export async function createWishlist(payload) {
  const { data, error } = await db.from('wishlist')
    .insert([{ user_id: state.currentUser.id, ...payload }])
    .select().single()
  if (error) throw error
  state.wishlist.unshift(data)
  return data
}

export async function updateWishlist(id, payload) {
  const { error } = await db.from('wishlist').update(payload).eq('id', id)
  if (error) throw error
  const w = state.wishlist.find(x => x.id === id)
  if (w) Object.assign(w, payload)
}

export async function deleteWishlist(id) {
  const { error } = await db.from('wishlist').delete().eq('id', id)
  if (error) throw error
  state.wishlist = state.wishlist.filter(w => w.id !== id)
}

/**
 * Add savings progress to a wishlist item.
 * This is purely a tracker — it does NOT touch any account balance.
 * Users decide themselves which rekening they're nabung at.
 */
export async function addSavingsToWishlist(id, amount) {
  const w = state.wishlist.find(x => x.id === id)
  if (!w) throw new Error('Wishlist tidak ditemukan')
  const newSaved = Number(w.saved_amount || 0) + Number(amount)
  await updateWishlist(id, { saved_amount: newSaved })
  return newSaved
}

/**
 * Mark a wishlist item as bought.
 * Creates an expense transaction and links it via bought_tx_id.
 */
export async function markWishlistBought(id, opts) {
  const w = state.wishlist.find(x => x.id === id)
  if (!w) throw new Error('Wishlist tidak ditemukan')
  const { accountId, amount, category, note } = opts || {}
  if (!accountId) throw new Error('Rekening harus dipilih')
  const finalAmount = Number(amount) || Number(w.price) || 0
  if (finalAmount <= 0) throw new Error('Jumlah pembelian harus > 0')

  // Create transaction
  const tx = await createTransaction({
    type: 'expense',
    amount: finalAmount,
    category: category || '🛍️ Belanja',
    account_id: accountId,
    note: note || `Wishlist: ${w.name}`,
    date: new Date().toISOString().split('T')[0],
  })

  // Update wishlist
  await updateWishlist(id, {
    status: 'bought',
    bought_at: new Date().toISOString(),
    bought_amount: finalAmount,
    bought_tx_id: tx.id,
  })
  return tx
}
