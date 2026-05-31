// src/js/pages/accountDetail.js
import { state }        from '../lib/store.js'
import { showToast }    from '../lib/toast.js'
import { navigate }     from '../lib/router.js'
import { fmt, fmtShort, fmtDate, monthKey, monthLabel } from '../lib/utils.js'
import { BANK_ICONS, CURRENCIES } from '../lib/config.js'
import { getCatObj }    from '../lib/categories.js'

let _detailAccountId = null
let _detailMonth = new Date()
let _detailTab = 'details' // 'details' | 'charts'
let _chartType = 'trend'   // 'trend' | 'income_expense'

export function openAccountDetail(id) {
  _detailAccountId = id
  _detailMonth = new Date()
  _detailTab = 'details'
  _chartType = 'trend'
  navigate('accountDetail')
}

window.openAccountDetail = openAccountDetail

export function renderAccountDetail(area, actions) {
  const a = state.accounts.find(x => x.id === _detailAccountId)
  if (!a) {
    area.innerHTML = `<div class="empty-state"><p>Rekening tidak ditemukan</p></div>`
    actions.innerHTML = ''
    return
  }

  // Header actions: edit + close
  actions.innerHTML = `
    <button class="btn btn-ghost btn-sm" onclick="window.openEditAccount('${a.id}')" title="Edit rekening">✏️</button>
    <button class="btn btn-ghost btn-sm" onclick="navigate('accounts')" title="Kembali">✕</button>
  `

  // Month-filtered transactions for this account
  const mk = monthKey(_detailMonth)
  const monthTx = state.transactions.filter(t =>
    t.date?.startsWith(mk) && (t.account_id === a.id || t.to_account_id === a.id)
  )
  const income = monthTx
    .filter(t => t.type === 'income' || (t.type === 'transfer' && t.to_account_id === a.id))
    .reduce((s,t) => s + Number(t.amount), 0)
  const expense = monthTx
    .filter(t => t.type === 'expense' || (t.type === 'transfer' && t.account_id === a.id))
    .reduce((s,t) => s + Number(t.amount), 0)

  // % vs balance (avoid div by zero)
  const balance = Number(a.balance) || 0
  const incomePct = balance > 0 ? Math.round((income / balance) * 100) : 0
  const expensePct = balance > 0 ? Math.round((expense / balance) * 100) : 0

  const currency = localStorage.getItem('currency') || 'IDR'

  area.innerHTML = `
    <!-- Account Hero Card -->
    <div class="acct-detail-hero" style="border-top:4px solid ${a.color || 'var(--accent)'}">
      <div class="acct-detail-hero-top">
        <div class="acct-detail-type">${a.acct_type || 'Account'}</div>
      </div>
      <div class="acct-detail-hero-main">
        <div class="acct-detail-icon" style="background:${a.color || 'var(--accent)'}22">
          ${a.icon || BANK_ICONS[a.bank] || '🏦'}
        </div>
        <div style="flex:1">
          <div class="acct-detail-name">${a.name}</div>
          <div class="acct-detail-bank">${a.bank}</div>
        </div>
        <div style="text-align:right">
          <div class="acct-detail-balance" style="color:${a.color || 'var(--accent)'}">${fmt(a.balance)}</div>
          <div class="acct-detail-currency">${currency}</div>
        </div>
      </div>

      <!-- Month nav -->
      <div class="acct-detail-month-nav">
        <button class="btn btn-ghost btn-sm" onclick="detailChangeMonth(-1)">‹</button>
        <div class="acct-detail-month">${monthLabel(_detailMonth)}</div>
        <button class="btn btn-ghost btn-sm" onclick="detailChangeMonth(1)">›</button>
      </div>

      <!-- Income / Expense bars -->
      <div class="acct-detail-stats">
        <div class="acct-detail-stat-row">
          <div class="acct-detail-stat-label">Pemasukan</div>
          <div class="acct-detail-stat-bar-wrap">
            <div class="acct-detail-stat-bar" style="background:var(--green-dim);width:${Math.min(100,incomePct)}%"></div>
            <div class="acct-detail-stat-amount" style="color:var(--green)">${fmtShort(income)}</div>
            <div class="acct-detail-stat-pct">${incomePct}%</div>
          </div>
        </div>
        <div class="acct-detail-stat-row">
          <div class="acct-detail-stat-label">Pengeluaran</div>
          <div class="acct-detail-stat-bar-wrap">
            <div class="acct-detail-stat-bar" style="background:var(--red-dim);width:${Math.min(100,expensePct)}%"></div>
            <div class="acct-detail-stat-amount" style="color:var(--red)">${fmtShort(expense)}</div>
            <div class="acct-detail-stat-pct">${expensePct}%</div>
          </div>
        </div>
      </div>
    </div>

    <!-- Tabs: Details / Charts -->
    <div class="acct-detail-tabs">
      <button class="acct-detail-tab ${_detailTab==='details'?'active':''}" onclick="detailSetTab('details')">📋 Details</button>
      <button class="acct-detail-tab ${_detailTab==='charts'?'active':''}" onclick="detailSetTab('charts')">📊 Charts</button>
    </div>

    <!-- Tab content -->
    ${_detailTab === 'details' ? renderDetailsTab(a, monthTx) : renderChartsTab(a, monthTx)}
  `

  // Render chart if on charts tab
  if (_detailTab === 'charts') {
    setTimeout(() => renderDetailChart(a), 50)
  }
}

function renderDetailsTab(a, monthTx) {
  if (!monthTx.length) {
    return `<div class="empty-state" style="padding:32px 0">
      <div class="empty-icon">📭</div>
      <p>Tidak ada transaksi bulan ini</p>
    </div>`
  }

  // Group by date
  const byDate = {}
  monthTx.forEach(t => {
    if (!byDate[t.date]) byDate[t.date] = []
    byDate[t.date].push(t)
  })
  const dates = Object.keys(byDate).sort((a,b) => b.localeCompare(a))

  // Calculate running balance backwards from current
  let runningBalance = Number(a.balance)
  // Apply transactions from newest to oldest to get balance at each date
  const balanceAtDate = {}
  // First: calculate end-of-day balance for each date
  dates.forEach(d => {
    balanceAtDate[d] = runningBalance
    byDate[d].forEach(t => {
      if (t.type === 'income' || (t.type === 'transfer' && t.to_account_id === a.id)) {
        runningBalance -= Number(t.amount)
      } else if (t.type === 'expense' || (t.type === 'transfer' && t.account_id === a.id)) {
        runningBalance += Number(t.amount)
      }
    })
  })

  return `
    <div class="acct-detail-list">
      ${dates.map(d => {
        const dayTx = byDate[d]
        const dayIncome = dayTx.filter(t => t.type==='income' || (t.type==='transfer' && t.to_account_id===a.id)).reduce((s,t)=>s+Number(t.amount), 0)
        const dayExpense = dayTx.filter(t => t.type==='expense' || (t.type==='transfer' && t.account_id===a.id)).reduce((s,t)=>s+Number(t.amount), 0)
        return `
          <div class="acct-detail-day">
            <div class="acct-detail-day-header">
              <div class="acct-detail-day-date">${fmtDate(d)}</div>
              <div class="acct-detail-day-summary">
                ${dayExpense > 0 ? `<span style="color:var(--red)">-${fmtShort(dayExpense)}</span>` : ''}
                ${dayIncome > 0 ? `<span style="color:var(--green)">+${fmtShort(dayIncome)}</span>` : ''}
              </div>
            </div>
            ${dayTx.map(t => {
              const isIn = t.type==='income' || (t.type==='transfer' && t.to_account_id===a.id)
              const sign = isIn ? '+' : '-'
              const color = isIn ? 'var(--green)' : 'var(--red)'
              const cat = getCatObj(t.category || '')
              const icon = t.type==='transfer' ? '↔️' : (cat.icon || '💸')
              return `<div class="acct-detail-tx" onclick="window.openEditTx && window.openEditTx('${t.id}')">
                <div class="acct-detail-tx-icon" style="background:${cat.color || '#636e72'}22">${icon}</div>
                <div class="acct-detail-tx-info">
                  <div class="acct-detail-tx-cat">${t.category || 'Lainnya'}</div>
                  <div class="acct-detail-tx-note">${t.note || '—'}</div>
                </div>
                <div class="acct-detail-tx-right">
                  <div class="acct-detail-tx-amount" style="color:${color}">${sign}${fmtShort(t.amount)}</div>
                  <div class="acct-detail-tx-balance">Saldo: ${fmtShort(balanceAtDate[d])}</div>
                </div>
              </div>`
            }).join('')}
          </div>
        `
      }).join('')}
    </div>
  `
}

function renderChartsTab(a, monthTx) {
  // Build daily data for the month
  const daysInMonth = new Date(_detailMonth.getFullYear(), _detailMonth.getMonth()+1, 0).getDate()
  const data = []
  let bal = Number(a.balance)

  // Get all transactions for this account (any date) to calculate balance over time
  const allAccTx = state.transactions
    .filter(t => t.account_id === a.id || t.to_account_id === a.id)
    .sort((a,b) => b.date?.localeCompare(a.date))

  // For each day in current month, compute end-of-day balance
  // (simple approach: walk back from today)
  return `
    <div class="acct-detail-chart-tabs">
      <button class="acct-detail-chart-tab ${_chartType==='trend'?'active':''}" onclick="detailSetChart('trend')">Trend</button>
      <button class="acct-detail-chart-tab ${_chartType==='income_expense'?'active':''}" onclick="detailSetChart('income_expense')">Income/Expense</button>
    </div>
    <div class="acct-detail-chart-wrap">
      <canvas id="acct-detail-chart"></canvas>
    </div>

    <!-- Daily breakdown list -->
    ${monthTx.length ? `
      <div class="acct-detail-daily-list">
        <div class="acct-detail-daily-header">
          <div>Tanggal</div>
          <div>Income/Expense</div>
          <div>Saldo</div>
        </div>
        ${renderDailyRows(a, monthTx)}
      </div>
    ` : '<div class="empty-state" style="padding:24px 0"><p>Tidak ada data bulan ini</p></div>'}
  `
}

function renderDailyRows(a, monthTx) {
  const byDate = {}
  monthTx.forEach(t => {
    if (!byDate[t.date]) byDate[t.date] = []
    byDate[t.date].push(t)
  })
  const dates = Object.keys(byDate).sort((a,b) => b.localeCompare(a))

  let runningBalance = Number(a.balance)
  const rows = []
  dates.forEach(d => {
    const dayTx = byDate[d]
    let net = 0
    dayTx.forEach(t => {
      if (t.type === 'income' || (t.type === 'transfer' && t.to_account_id === a.id)) {
        net += Number(t.amount)
      } else if (t.type === 'expense' || (t.type === 'transfer' && t.account_id === a.id)) {
        net -= Number(t.amount)
      }
    })
    const balAfterDay = runningBalance
    runningBalance -= net
    rows.push({ date: d, net, balance: balAfterDay })
  })

  return rows.map(r => `
    <div class="acct-detail-daily-row">
      <div>${r.date.slice(5).replace('-','/')}</div>
      <div style="color:${r.net >= 0 ? 'var(--green)' : 'var(--red)'};font-weight:600">
        ${r.net >= 0 ? '+' : ''}${fmtShort(r.net)}
      </div>
      <div style="font-weight:600">${fmtShort(r.balance)}</div>
    </div>
  `).join('')
}

async function renderDetailChart(a) {
  const ctx = document.getElementById('acct-detail-chart')
  if (!ctx) return

  const { Chart } = await import('chart.js/auto')

  // Destroy previous chart on same canvas
  if (window._acctDetailChart) {
    try { window._acctDetailChart.destroy() } catch(e) {}
  }

  const mk = monthKey(_detailMonth)
  const daysInMonth = new Date(_detailMonth.getFullYear(), _detailMonth.getMonth()+1, 0).getDate()

  // For each day, compute end-of-day balance
  const labels = []
  const trendData = []
  const incomeData = []
  const expenseData = []

  let runningBal = Number(a.balance)
  // Walk forward through the month
  const monthTx = state.transactions
    .filter(t => t.date?.startsWith(mk) && (t.account_id === a.id || t.to_account_id === a.id))

  // Start from current balance — subtract future txs (if any) to find start-of-month balance
  // Simpler: just compute net change per day and plot balance backwards
  const today = new Date()
  for (let day = 1; day <= daysInMonth; day++) {
    const ds = `${mk}-${String(day).padStart(2,'0')}`
    const dayTx = monthTx.filter(t => t.date === ds)
    const dayIncome = dayTx.filter(t => t.type==='income' || (t.type==='transfer' && t.to_account_id===a.id)).reduce((s,t)=>s+Number(t.amount), 0)
    const dayExpense = dayTx.filter(t => t.type==='expense' || (t.type==='transfer' && t.account_id===a.id)).reduce((s,t)=>s+Number(t.amount), 0)
    labels.push(`${_detailMonth.getMonth()+1}/${day}`)
    incomeData.push(dayIncome)
    expenseData.push(dayExpense)
  }

  // For trend: compute end-of-day balance going backwards from current
  // Today's balance = a.balance, then for each previous day, undo that day's net
  let curBal = Number(a.balance)
  const balByDay = new Array(daysInMonth).fill(0)
  const todayDay = today.getMonth() === _detailMonth.getMonth() && today.getFullYear() === _detailMonth.getFullYear()
    ? today.getDate() : daysInMonth

  for (let day = todayDay; day >= 1; day--) {
    balByDay[day-1] = curBal
    const ds = `${mk}-${String(day).padStart(2,'0')}`
    const dayTx = monthTx.filter(t => t.date === ds)
    const net = dayTx.reduce((s,t) => {
      if (t.type === 'income' || (t.type === 'transfer' && t.to_account_id === a.id)) return s + Number(t.amount)
      if (t.type === 'expense' || (t.type === 'transfer' && t.account_id === a.id)) return s - Number(t.amount)
      return s
    }, 0)
    curBal -= net
  }
  // Fill future days with current balance
  for (let day = todayDay + 1; day <= daysInMonth; day++) {
    balByDay[day-1] = balByDay[todayDay-1] || Number(a.balance)
  }

  const accentColor = a.color || '#4ecdc4'

  const config = _chartType === 'trend' ? {
    type: 'line',
    data: {
      labels,
      datasets: [{
        label: 'Saldo',
        data: balByDay,
        borderColor: accentColor,
        backgroundColor: accentColor + '33',
        fill: true,
        tension: 0.3,
        pointRadius: 2,
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: { legend: { display: false } },
      scales: {
        y: {
          ticks: { color: '#94a3b8', callback: v => fmtShort(v) },
          grid: { color: 'rgba(255,255,255,0.05)' }
        },
        x: {
          ticks: { color: '#94a3b8', maxTicksLimit: 8 },
          grid: { display: false }
        }
      }
    }
  } : {
    type: 'bar',
    data: {
      labels,
      datasets: [
        { label: 'Pemasukan', data: incomeData, backgroundColor: '#4ade80' },
        { label: 'Pengeluaran', data: expenseData, backgroundColor: '#ff5f6d' }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: { legend: { display: true, labels: { color: '#94a3b8' } } },
      scales: {
        y: {
          ticks: { color: '#94a3b8', callback: v => fmtShort(v) },
          grid: { color: 'rgba(255,255,255,0.05)' }
        },
        x: {
          ticks: { color: '#94a3b8', maxTicksLimit: 8 },
          grid: { display: false },
          stacked: false
        }
      }
    }
  }

  window._acctDetailChart = new Chart(ctx, config)
}

function detailChangeMonth(delta) {
  _detailMonth = new Date(_detailMonth.getFullYear(), _detailMonth.getMonth() + delta, 1)
  navigate('accountDetail')
}

function detailSetTab(t) {
  _detailTab = t
  navigate('accountDetail')
}

function detailSetChart(t) {
  _chartType = t
  navigate('accountDetail')
}

window.detailChangeMonth = detailChangeMonth
window.detailSetTab      = detailSetTab
window.detailSetChart    = detailSetChart
