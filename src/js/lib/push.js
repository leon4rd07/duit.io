// src/js/lib/push.js
// Web Push subscription helpers — talks to Supabase push_subscriptions table.
import { db, state } from './supabase.js'

const VAPID_PUBLIC_KEY = import.meta.env.VITE_VAPID_PUBLIC_KEY || ''

export function isPushSupported() {
  return 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window
}

export function hasVapidKey() {
  return !!VAPID_PUBLIC_KEY
}

/**
 * Subscribe browser to push and save subscription to Supabase.
 * Returns { subscription, saved } on success, throws on error.
 */
export async function subscribeAndSave({ notifTimes, enabled = true } = {}) {
  if (!isPushSupported()) throw new Error('Push API tidak didukung di browser ini')
  if (!VAPID_PUBLIC_KEY) throw new Error('VAPID public key belum di-set di env (VITE_VAPID_PUBLIC_KEY)')
  if (!state.currentUser) throw new Error('User belum login')

  const reg = await navigator.serviceWorker.ready

  // Re-use existing sub if present, else create new
  let sub = await reg.pushManager.getSubscription()
  if (!sub) {
    sub = await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY),
    })
  }

  const json = sub.toJSON()
  if (!json.endpoint || !json.keys?.p256dh || !json.keys?.auth) {
    throw new Error('Subscription data tidak lengkap')
  }

  const tz = (() => {
    try { return Intl.DateTimeFormat().resolvedOptions().timeZone || 'Asia/Jakarta' }
    catch { return 'Asia/Jakarta' }
  })()

  const times = notifTimes && notifTimes.length
    ? notifTimes
    : JSON.parse(localStorage.getItem('notif_times') || '["21:00"]')

  const { error } = await db.from('push_subscriptions').upsert({
    user_id: state.currentUser.id,
    endpoint: json.endpoint,
    p256dh: json.keys.p256dh,
    auth: json.keys.auth,
    notif_times: times,
    notif_enabled: enabled,
    user_timezone: tz,
    updated_at: new Date().toISOString(),
  }, { onConflict: 'endpoint' })

  if (error) throw error
  return { subscription: sub, saved: true }
}

/**
 * Update times/enabled flag without re-subscribing.
 */
export async function updateSubscriptionPrefs({ notifTimes, enabled }) {
  if (!isPushSupported() || !state.currentUser) return
  try {
    const reg = await navigator.serviceWorker.ready
    const sub = await reg.pushManager.getSubscription()
    if (!sub) return
    const payload = { updated_at: new Date().toISOString() }
    if (notifTimes !== undefined) payload.notif_times = notifTimes
    if (enabled !== undefined) payload.notif_enabled = enabled
    await db.from('push_subscriptions')
      .update(payload)
      .eq('endpoint', sub.endpoint)
      .eq('user_id', state.currentUser.id)
  } catch (e) {
    console.warn('updateSubscriptionPrefs failed:', e)
  }
}

/**
 * Unsubscribe from push and remove from Supabase.
 */
export async function unsubscribeAndRemove() {
  if (!isPushSupported()) return
  try {
    const reg = await navigator.serviceWorker.ready
    const sub = await reg.pushManager.getSubscription()
    if (sub) {
      const endpoint = sub.endpoint
      try { await sub.unsubscribe() } catch {}
      if (state.currentUser) {
        await db.from('push_subscriptions')
          .delete()
          .eq('endpoint', endpoint)
          .eq('user_id', state.currentUser.id)
      }
    }
  } catch (e) {
    console.warn('unsubscribeAndRemove failed:', e)
  }
}

// Helper: convert URL-safe base64 to Uint8Array (used for VAPID key)
function urlBase64ToUint8Array(base64String) {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4)
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/')
  const raw = atob(base64)
  const out = new Uint8Array(raw.length)
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i)
  return out
}
