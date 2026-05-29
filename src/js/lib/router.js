// src/js/lib/router.js
// ── Client-side router ────────────────────────────────────────────────
import { state }      from './store.js'
import { PAGE_TITLES } from './config.js'

// Lazy-loaded page renderers — registered by each page module
const _renderers = {}

/**
 * Register a page renderer
 * @param {string} page
 * @param {function(area: HTMLElement, actions: HTMLElement): void} fn
 */
export function registerPage(page, fn) {
  _renderers[page] = fn
}

/**
 * Navigate to a page
 * @param {string} page
 */
export function navigate(page) {
  state.currentPage = page

  // Update nav active states
  document.querySelectorAll('[data-page]').forEach(el =>
    el.classList.toggle('active', el.dataset.page === page)
  )

  // Update title
  const titleEl = document.getElementById('page-title')
  if (titleEl) titleEl.textContent = PAGE_TITLES[page] || page

  // Clear topbar actions
  const actionsEl = document.getElementById('topbar-actions')
  if (actionsEl) actionsEl.innerHTML = ''

  // Destroy any active charts (Chart.js instances)
  if (window._activeChart) {
    window._activeChart.destroy()
    window._activeChart = null
  }

  // Render page
  const area = document.getElementById('content-area')
  if (!area) return

  const renderer = _renderers[page]
  if (renderer) {
    renderer(area, actionsEl)
  } else {
    area.innerHTML = `<div class="empty-state"><div class="empty-icon">🚧</div><p>Page "${page}" not found</p></div>`
  }
}
