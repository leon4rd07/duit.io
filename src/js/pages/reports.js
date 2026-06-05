// src/js/pages/reports.js
import { Chart } from 'chart.js/auto'
import { state } from '../lib/store.js'
import { showToast } from '../lib/toast.js'
import { navigate } from '../lib/router.js'
import { fmt, fmtShort, fmtDate, monthKey, monthLabel } from '../lib/utils.js'
import { getCatObj, CATEGORIES, getCatGroups, CAT_COLORS } from '../lib/categories.js'
import { AVATAR_COLORS } from '../lib/config.js'
import * as DB from '../lib/supabase.js'

// In-page state
let _reportMonth = new Date()
let _selectedType = 'expense'

function renderReports(area, actions) {
  if (!_reportMonth || isNaN(_reportMonth)) _reportMonth = new Date()
  const mk = monthKey(_reportMonth)

  // Last 6 months bar data
  const months = []
  for (let i = 5; i >= 0; i--) {
    const d = new Date()
    d.setMonth(d.getMonth() - i)
    months.push({ key: monthKey(d), label: d.toLocaleDateString('id-ID', { month: 'short' }) })
  }
  const incomeData  = months.map(m => state.transactions.filter(t => t.type === 'income'  && t.date?.startsWith(m.key)).reduce((s, t) => s + Number(t.amount), 0))
  const expenseData = months.map(m => state.transactions.filter(t => t.type === 'expense' && t.date?.startsWith(m.key)).reduce((s, t) => s + Number(t.amount), 0))
  const netData = incomeData.map((inc, i) => inc - expenseData[i])

  // This month totals
  const monthTx = state.transactions.filter(t => t.date?.startsWith(mk))
  const monthExpense = monthTx.filter(t => t.type === 'expense').reduce((s, t) => s + Number(t.amount), 0)
  const monthIncome  = monthTx.filter(t => t.type === 'income').reduce((s, t) => s + Number(t.amount), 0)

  // Category breakdown for selected type
  const catMap = {}
  monthTx.filter(t => t.type === _selectedType).forEach(t => {
    catMap[t.category] = (catMap[t.category] || 0) + Number(t.amount)
  })
  const catEntries = Object.entries(catMap).sort((a, b) => b[1] - a[1])
  const catTotal = catEntries.reduce((s, [, v]) => s + v, 0)

  const totalSaved = netData.reduce((s, n) => s + n, 0)
  const monthDisplay = _reportMonth.toLocaleDateString('id-ID', { month: 'long', year: 'numeric' })
  const isCurrentMonth = mk === monthKey(new Date())

  area.innerHTML = `
    <div class="grid-2 mb-16">
      <div class="card">
        <div class="stat-label">Total Tabungan 6 Bulan</div>
        <div class="stat-value ${totalSaved>=0?'positive':'negative'}" style="font-size:22px">${fmtShort(totalSaved)}</div>
      </div>
      <div class="card">
        <div class="stat-label">Rata-rata Pengeluaran/Bulan</div>
        <div class="stat-value negative" style="font-size:22px">${fmtShort(expenseData.reduce((s,v)=>s+v,0)/6)}</div>
      </div>
    </div>

    <div class="card mb-16">
      <div class="section-title mb-12">Pemasukan vs Pengeluaran (6 Bulan)</div>
      <div class="chart-wrap"><canvas id="trend-chart"></canvas></div>
    </div>

    <div class="card mb-16 cat-breakdown">
      <div class="month-nav">
        <button class="month-nav-btn" onclick="reportPrevMonth()">‹</button>
        <div class="month-nav-label">${monthDisplay}</div>
        <button class="month-nav-btn ${isCurrentMonth?'disabled':''}" onclick="reportNextMonth()" ${isCurrentMonth?'disabled':''}>›</button>
      </div>

      <div class="report-stat-toggle">
        <div class="report-stat-card ${_selectedType==='expense'?'active expense':''}" onclick="setReportType('expense')">
          <div class="report-stat-label">Uang Keluar</div>
          <div class="report-stat-value">${fmt(monthExpense)}</div>
        </div>
        <div class="report-stat-card ${_selectedType==='income'?'active income':''}" onclick="setReportType('income')">
          <div class="report-stat-label">Uang Masuk</div>
          <div class="report-stat-value">${fmt(monthIncome)}</div>
        </div>
      </div>

      ${catEntries.length ? `
        <div class="donut-wrap">
          <canvas id="cat-donut"></canvas>
          <div class="donut-center">
            <div class="donut-center-label">${_selectedType==='expense'?'Total Keluar':'Total Masuk'}</div>
            <div class="donut-center-value">${fmtShort(catTotal)}</div>
          </div>
        </div>
      ` : `<div class="empty-state" style="padding:30px"><p>Belum ada ${_selectedType==='expense'?'pengeluaran':'pemasukan'} di bulan ini</p></div>`}

      ${catEntries.length ? `
        <div class="cat-list">
          ${catEntries.map(([cat, val]) => {
            const pct = catTotal ? ((val / catTotal) * 100).toFixed(1) : '0.0'
            const color = CAT_COLORS[cat] || '#636e72'
            const catObj = getCatObj(cat)
            const icon = catObj?.icon || cat.split(' ')[0] || '📌'
            const name = catObj?.name || cat.replace(/^[^\w\s]+\s*/, '')
            return `
              <div class="cat-row" onclick="window.openCategoryReportPage && window.openCategoryReportPage(${JSON.stringify(cat)})">
                <div class="cat-row-icon" style="background:${color}22;color:${color}">${icon}</div>
                <div class="cat-row-name">${name}</div>
                <div class="cat-row-pct">${pct}%</div>
                <div class="cat-row-amount">${fmtShort(val)}</div>
                <div class="cat-row-chevron">›</div>
              </div>`
          }).join('')}
        </div>
      ` : ''}
    </div>

    <div class="card">
      <div class="section-title mb-12">Net Tabungan Bulanan</div>
      <div class="chart-wrap"><canvas id="net-chart"></canvas></div>
    </div>`

  setTimeout(() => {
    const chartDefaults = {
      responsive: true,
      maintainAspectRatio: false,
      plugins: { legend: { labels: { color: '#8b92a8', font: { size: 11 } } }, tooltip: { callbacks: { label: d => ' ' + fmtShort(d.raw) } } },
      scales: {
        x: { grid: { display: false }, ticks: { color: '#5a6075', font: { size: 11 } } },
        y: { grid: { color: 'rgba(255,255,255,0.04)' }, ticks: { color: '#5a6075', font: { size: 11 }, callback: v => fmtShort(v) } },
      },
    }

    const ctx1 = document.getElementById('trend-chart')?.getContext('2d')
    if (ctx1) new Chart(ctx1, {
      type: 'bar',
      data: { labels: months.map(m => m.label), datasets: [
        { label: 'Pemasukan', data: incomeData, backgroundColor: 'rgba(74,222,128,0.7)', borderRadius: 6 },
        { label: 'Pengeluaran', data: expenseData, backgroundColor: 'rgba(255,95,109,0.7)', borderRadius: 6 },
      ]},
      options: { ...chartDefaults, barPercentage: 0.6 },
    })

    if (catEntries.length) {
      const ctx2 = document.getElementById('cat-donut')?.getContext('2d')
      if (ctx2) {
        const bg2 = getComputedStyle(document.documentElement).getPropertyValue('--bg2').trim() || '#1a1a1a'
        new Chart(ctx2, {
          type: 'doughnut',
          data: {
            labels: catEntries.map(c => c[0]),
            datasets: [{
              data: catEntries.map(c => c[1]),
              backgroundColor: catEntries.map(c => CAT_COLORS[c[0]] || '#636e72'),
              borderWidth: 3,
              borderColor: bg2,
              hoverOffset: 8,
            }],
          },
          options: {
            responsive: true,
            maintainAspectRatio: false,
            cutout: '68%',
            plugins: {
              legend: { display: false },
              tooltip: {
                callbacks: {
                  label: ctx => {
                    const val = ctx.raw
                    const pct = catTotal ? ((val / catTotal) * 100).toFixed(1) : '0.0'
                    return ` ${ctx.label}: ${fmtShort(val)} (${pct}%)`
                  },
                },
              },
            },
          },
        })
      }
    }

    const ctx3 = document.getElementById('net-chart')?.getContext('2d')
    if (ctx3) new Chart(ctx3, {
      type: 'line',
      data: { labels: months.map(m => m.label), datasets: [
        { label: 'Net', data: netData, borderColor: '#ff7c5c', backgroundColor: 'rgba(255,124,92,0.1)', fill: true, tension: 0.4, pointBackgroundColor: '#ff7c5c', pointRadius: 4 },
      ]},
      options: { ...chartDefaults },
    })
  }, 50)
}

function reportPrevMonth() {
  _reportMonth = new Date(_reportMonth.getFullYear(), _reportMonth.getMonth() - 1, 1)
  navigate('reports')
}
function reportNextMonth() {
  const next = new Date(_reportMonth.getFullYear(), _reportMonth.getMonth() + 1, 1)
  const now = new Date()
  if (next.getFullYear() > now.getFullYear() || (next.getFullYear() === now.getFullYear() && next.getMonth() > now.getMonth())) return
  _reportMonth = next
  navigate('reports')
}
function setReportType(t) {
  _selectedType = t
  navigate('reports')
}

window.reportPrevMonth = reportPrevMonth
window.reportNextMonth = reportNextMonth
window.setReportType = setReportType

export { renderReports }
