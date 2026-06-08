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
let _periodMonths = 6  // 1 | 3 | 6 | 12 | 24 | 'custom'
let _customFrom = ''   // YYYY-MM
let _customTo = ''     // YYYY-MM

function renderReports(area, actions) {
  if (!_reportMonth || isNaN(_reportMonth)) _reportMonth = new Date()
  const mk = monthKey(_reportMonth)

  // Build months array based on selected period
  const months = []
  if (_periodMonths === 'custom' && _customFrom && _customTo) {
    const [fy, fm] = _customFrom.split('-').map(Number)
    const [ty, tm] = _customTo.split('-').map(Number)
    let cur = new Date(fy, fm-1, 1)
    const end = new Date(ty, tm-1, 1)
    let safety = 0
    while (cur <= end && safety++ < 60) {
      months.push({
        key: monthKey(cur),
        label: cur.toLocaleDateString('id-ID', { month: 'short', year: '2-digit' })
      })
      cur = new Date(cur.getFullYear(), cur.getMonth()+1, 1)
    }
  } else {
    const n = Number(_periodMonths) || 6
    for (let i = n-1; i >= 0; i--) {
      const d = new Date()
      d.setMonth(d.getMonth() - i)
      const opts = n >= 12 ? { month: 'short', year: '2-digit' } : { month: 'short' }
      months.push({ key: monthKey(d), label: d.toLocaleDateString('id-ID', opts) })
    }
  }
  if (!months.length) {
    // Fallback to current month only if range invalid
    months.push({ key: monthKey(new Date()), label: new Date().toLocaleDateString('id-ID', { month: 'short' }) })
  }
  const periodLabel = _periodMonths === 'custom' && _customFrom && _customTo
    ? `${_customFrom} — ${_customTo}`
    : `${months.length} Bulan`

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
  const avgExpense = expenseData.length ? expenseData.reduce((s,v)=>s+v,0) / expenseData.length : 0
  const monthDisplay = _reportMonth.toLocaleDateString('id-ID', { month: 'long', year: 'numeric' })
  const isCurrentMonth = mk === monthKey(new Date())

  area.innerHTML = `
    <div class="grid-2 mb-16">
      <div class="card">
        <div class="stat-label">Total Tabungan (${periodLabel})</div>
        <div class="stat-value ${totalSaved>=0?'positive':'negative'}" style="font-size:22px">${fmtShort(totalSaved)}</div>
      </div>
      <div class="card">
        <div class="stat-label">Rata-rata Pengeluaran/Bulan</div>
        <div class="stat-value negative" style="font-size:22px">${fmtShort(avgExpense)}</div>
      </div>
    </div>

    <div class="card mb-16">
      <div class="period-selector">
        <div class="period-chips">
          ${[
            {v:1, label:'1B'},
            {v:3, label:'3B'},
            {v:6, label:'6B'},
            {v:12, label:'1T'},
            {v:24, label:'2T'},
            {v:'custom', label:'Custom'},
          ].map(p => `
            <div class="pill ${_periodMonths===p.v?'active':''}" onclick="setReportPeriod(${typeof p.v==='string'?`'${p.v}'`:p.v})">${p.label}</div>
          `).join('')}
        </div>
        ${_periodMonths === 'custom' ? `
          <div class="period-custom">
            <input type="month" value="${_customFrom}" max="${monthKey(new Date())}" onchange="setReportCustomFrom(this.value)" placeholder="Dari"/>
            <span style="color:var(--text3);font-size:14px">—</span>
            <input type="month" value="${_customTo}" max="${monthKey(new Date())}" onchange="setReportCustomTo(this.value)" placeholder="Sampai"/>
          </div>
        ` : ''}
      </div>
      <div class="section-title mb-12" style="margin-top:14px">Pemasukan vs Pengeluaran (${periodLabel})</div>
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
      <div class="section-title mb-12">Net Tabungan Bulanan (${periodLabel})</div>
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
        const cs = getComputedStyle(document.documentElement)
        const bg2 = cs.getPropertyValue('--bg2').trim() || '#1a1a1a'

        new Chart(ctx2, {
          type: 'doughnut',
          data: {
            // Labels include emoji icon prefix: "🍜 Food"
            labels: catEntries.map(c => {
              const obj = getCatObj(c[0])
              const icon = obj?.icon || '•'
              return `${icon} ${c[0]}`
            }),
            datasets: [{
              data: catEntries.map(c => c[1]),
              backgroundColor: catEntries.map(c => (getCatObj(c[0])?.color) || CAT_COLORS[c[0]] || '#636e72'),
              borderWidth: 3,
              borderColor: bg2,
              hoverOffset: 6,
            }],
          },
          options: {
            responsive: true,
            maintainAspectRatio: false,
            cutout: '62%',
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

function setReportPeriod(p) {
  _periodMonths = p
  // If switching to custom, set sensible defaults if empty
  if (p === 'custom') {
    if (!_customTo) _customTo = monthKey(new Date())
    if (!_customFrom) {
      const d = new Date()
      d.setMonth(d.getMonth() - 5)
      _customFrom = monthKey(d)
    }
  }
  navigate('reports')
}
function setReportCustomFrom(v) {
  _customFrom = v
  navigate('reports')
}
function setReportCustomTo(v) {
  _customTo = v
  navigate('reports')
}

window.reportPrevMonth = reportPrevMonth
window.reportNextMonth = reportNextMonth
window.setReportType = setReportType
window.setReportPeriod = setReportPeriod
window.setReportCustomFrom = setReportCustomFrom
window.setReportCustomTo = setReportCustomTo

export { renderReports }
