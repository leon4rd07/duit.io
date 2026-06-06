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
        const cs = getComputedStyle(document.documentElement)
        const bg2 = cs.getPropertyValue('--bg2').trim() || '#1a1a1a'
        const text2 = cs.getPropertyValue('--text2').trim() || '#8b92a8'
        const text3 = cs.getPropertyValue('--text3').trim() || '#5a6075'

        // Custom plugin: draws leader lines + labels around the donut.
        // Handles single-segment (full-circle) and multi-segment with bounds clamping.
        const leaderLinesPlugin = {
          id: 'leaderLines',
          afterDraw(chart) {
            try {
              const { ctx, chartArea, canvas } = chart
              const meta = chart.getDatasetMeta(0)
              const ds = chart.data.datasets[0]
              const labels = chart.data.labels
              const dataArr = ds.data
              const total = dataArr.reduce((s, v) => s + Number(v), 0)
              if (!total || !meta.data.length) return

              // Top-5 segments by value
              const items = meta.data.map((arc, i) => ({
                i, arc, value: Number(dataArr[i]), label: labels[i], pct: dataArr[i] / total,
              }))
              const topItems = items.slice().sort((a, b) => b.value - a.value).slice(0, 5)
              const topIdxSet = new Set(topItems.map(t => t.i))

              ctx.save()
              ctx.font = '600 11.5px system-ui, -apple-system, sans-serif'
              ctx.lineWidth = 1

              const placedLabels = { left: [], right: [] }
              const labelHeight = 18
              const safeMargin = 14
              const canvasW = canvas.width / (window.devicePixelRatio || 1)
              const canvasH = canvas.height / (window.devicePixelRatio || 1)

              // If only ONE dominant segment (>= 95%), place label at fixed safe position
              const isSingleDominant = topItems.length === 1 || topItems[0].pct >= 0.97

              items.forEach(({ i, arc, label, pct }) => {
                if (!topIdxSet.has(i)) return
                if (pct < 0.02) return

                const outerR = arc.outerRadius
                const cx = arc.x
                const cy = arc.y

                let midAngle, x1, y1, x2, y2, isRight

                if (isSingleDominant && pct >= 0.97) {
                  // Force position at upper-right for the single segment
                  midAngle = -Math.PI / 4 // top-right diagonal
                  x1 = cx + Math.cos(midAngle) * outerR
                  y1 = cy + Math.sin(midAngle) * outerR
                  x2 = cx + Math.cos(midAngle) * (outerR + 14)
                  y2 = cy + Math.sin(midAngle) * (outerR + 14)
                  isRight = true
                } else {
                  midAngle = (arc.startAngle + arc.endAngle) / 2
                  x1 = cx + Math.cos(midAngle) * outerR
                  y1 = cy + Math.sin(midAngle) * outerR
                  const bendR = outerR + 14
                  x2 = cx + Math.cos(midAngle) * bendR
                  y2 = cy + Math.sin(midAngle) * bendR
                  isRight = Math.cos(midAngle) >= 0
                }

                // Clamp y2 within canvas bounds with margin
                y2 = Math.max(safeMargin, Math.min(canvasH - safeMargin, y2))
                const side = isRight ? 'right' : 'left'
                const sideMul = isRight ? 1 : -1

                // Avoid vertical overlap on same side
                for (const py of placedLabels[side]) {
                  if (Math.abs(y2 - py) < labelHeight) {
                    y2 = y2 < py ? py - labelHeight : py + labelHeight
                  }
                }
                y2 = Math.max(safeMargin, Math.min(canvasH - safeMargin, y2))
                placedLabels[side].push(y2)

                // Horizontal position for label/dot
                let dotX = isRight
                  ? Math.min(x2 + 14, canvasW - 6)
                  : Math.max(x2 - 14, 6)

                // Draw line: edge → bend → horizontal to dot
                ctx.strokeStyle = text3
                ctx.beginPath()
                ctx.moveTo(x1, y1)
                ctx.lineTo(x2, y2)
                ctx.lineTo(dotX, y2)
                ctx.stroke()

                // Dot at the end of the line (segment color)
                ctx.fillStyle = ds.backgroundColor[i]
                ctx.beginPath()
                ctx.arc(dotX, y2, 3, 0, Math.PI * 2)
                ctx.fill()

                // Label text — strip emoji prefix for cleanliness
                const cleanLabel = (label || '').replace(/^[^\w\s]+\s*/, '') || label || ''
                ctx.fillStyle = text2
                ctx.textAlign = isRight ? 'left' : 'right'
                ctx.textBaseline = 'middle'
                // Compute max label width allowed in this side
                const maxTextW = isRight
                  ? Math.max(20, canvasW - dotX - 8)
                  : Math.max(20, dotX - 8)
                // Truncate if too long
                let displayLabel = cleanLabel
                while (ctx.measureText(displayLabel).width > maxTextW && displayLabel.length > 3) {
                  displayLabel = displayLabel.slice(0, -2) + '…'
                }
                ctx.fillText(displayLabel, dotX + sideMul * 5, y2)
              })

              ctx.restore()
            } catch (err) {
              console.warn('Leader lines plugin error:', err)
            }
          },
        }

        new Chart(ctx2, {
          type: 'doughnut',
          data: {
            labels: catEntries.map(c => c[0]),
            datasets: [{
              data: catEntries.map(c => c[1]),
              backgroundColor: catEntries.map(c => CAT_COLORS[c[0]] || '#636e72'),
              borderWidth: 3,
              borderColor: bg2,
              hoverOffset: 6,
            }],
          },
          options: {
            responsive: true,
            maintainAspectRatio: false,
            cutout: '62%',
            layout: { padding: { top: 24, right: 80, bottom: 24, left: 80 } },
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
          plugins: [leaderLinesPlugin],
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
