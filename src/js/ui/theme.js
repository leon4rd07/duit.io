// src/js/ui/theme.js
import { state } from '../lib/store.js'

export function initTheme() {
  const saved = localStorage.getItem('theme') || 'dark'
  state.theme = saved
  applyTheme(saved)
}

export function applyTheme(theme) {
  document.body.classList.toggle('light', theme === 'light')
  const dark  = document.getElementById('theme-dark-btn')
  const light = document.getElementById('theme-light-btn')
  if (dark)  dark.classList.toggle('active',  theme !== 'light')
  if (light) light.classList.toggle('active', theme === 'light')
  const meta = document.querySelector('meta[name="theme-color"]')
  if (meta) meta.content = theme === 'light' ? '#f4f2ef' : '#1a1a1a'
  localStorage.setItem('theme', theme)
  state.theme = theme
}

export function toggleTheme() {
  const current = localStorage.getItem('theme') || 'dark'
  applyTheme(current === 'dark' ? 'light' : 'dark')
}
