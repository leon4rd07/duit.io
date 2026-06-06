// public/sw.js — duit.io service worker
// Handles notification display + click-to-open
// (Caching is left to Vercel; this SW focuses on push/notification capabilities.)

const SW_VERSION = 'duit-sw-v1'

self.addEventListener('install', (event) => {
  // Activate immediately on update
  self.skipWaiting()
})

self.addEventListener('activate', (event) => {
  // Take control of all clients (open tabs/installs) right away
  event.waitUntil(self.clients.claim())
})

// When user taps a notification, focus existing window or open new
self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  const targetUrl = (event.notification.data && event.notification.data.url) || '/'
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      // If app is already open in any window, focus it and navigate
      for (const client of clientList) {
        if ('focus' in client) {
          try {
            if ('navigate' in client && targetUrl !== '/') client.navigate(targetUrl)
          } catch (e) { /* ignore — same-origin nav may not be supported */ }
          return client.focus()
        }
      }
      // Otherwise open a new window
      if (self.clients.openWindow) {
        return self.clients.openWindow(targetUrl)
      }
    })
  )
})

// Optional: Push event handler (placeholder for future Push API integration)
self.addEventListener('push', (event) => {
  if (!event.data) return
  let payload = {}
  try { payload = event.data.json() } catch { payload = { title: 'duit.io', body: event.data.text() } }
  event.waitUntil(
    self.registration.showNotification(payload.title || 'duit.io 💰', {
      body: payload.body || '',
      icon: payload.icon || '/icon-192.png',
      badge: payload.badge || '/icon-192.png',
      tag: payload.tag || 'duit-push',
      data: payload.data || {},
    })
  )
})
