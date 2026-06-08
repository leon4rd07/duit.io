// src/js/ui/charts.js
// Chart.js wrappers with consistent styling + ShopeePay-style donut with leader lines
import { Chart } from 'chart.js/auto'

const GRID_COLOR  = 'rgba(255,255,255,0.04)'
const TICK_COLOR  = '#5a6075'
const LABEL_COLOR = '#8b92a8'

const defaultScales = {
  x: { grid: { display: false }, ticks: { color: TICK_COLOR, font: { size: 11 } } },
  y: { grid: { color: GRID_COLOR }, ticks: { color: TICK_COLOR, font: { size: 11 } } },
}

/**
 * Leader-lines plugin for doughnut charts.
 * Draws thin lines from each top-5 segment to a colored dot + single-line label
 * (emoji + name) outside the donut. Single-line keeps positioning reliable.
 *
 * Options (via chart.options.plugins.leaderLines):
 *   - showAmount: boolean — also draw amount under label (default: false)
 *   - format: (v) => string — amount formatter when showAmount=true
 */
export const leaderLinesPlugin = {
  id: 'leaderLines',
  afterDraw(chart) {
    try {
      const { ctx, canvas } = chart
      const meta = chart.getDatasetMeta(0)
      if (!meta || !meta.data || !meta.data.length) return

      const ds = chart.data.datasets[0]
      const dataArr = ds.data
      const labels = chart.data.labels
      const total = dataArr.reduce((s, v) => s + Number(v || 0), 0)
      if (!total) return

      const opts = chart.options?.plugins?.leaderLines || {}
      const showAmount = !!opts.showAmount
      const formatter  = opts.format || (v => 'Rp ' + Math.round(Number(v) || 0).toLocaleString('id-ID'))

      const cs = getComputedStyle(document.documentElement)
      const text   = (cs.getPropertyValue('--text').trim()  || '#e1e6f0')
      const text2  = (cs.getPropertyValue('--text2').trim() || '#8b92a8')
      const text3  = (cs.getPropertyValue('--text3').trim() || '#5a6075')

      // Top-5 segments by value
      const items = meta.data.map((arc, i) => ({
        i, arc, value: Number(dataArr[i] || 0), label: labels[i] || '',
        pct: Number(dataArr[i] || 0) / total,
      }))
      const topItems = items.slice().sort((a, b) => b.value - a.value).slice(0, 5)
      const topIdxSet = new Set(topItems.map(t => t.i))

      const dpr      = window.devicePixelRatio || 1
      const canvasW  = canvas.width  / dpr
      const canvasH  = canvas.height / dpr
      const labelGap = showAmount ? 28 : 18 // vertical spacing for collision avoidance
      const safeY    = 14

      const placed = { left: [], right: [] }
      const isSingleDominant = topItems.length === 1 || (topItems[0]?.pct >= 0.97)

      ctx.save()
      ctx.lineWidth = 1

      items.forEach(({ i, arc, label, value, pct }) => {
        if (!topIdxSet.has(i)) return
        if (pct < 0.02) return

        const cx = arc.x, cy = arc.y, outerR = arc.outerRadius

        let midAngle
        if (isSingleDominant && pct >= 0.97) midAngle = -Math.PI / 4
        else midAngle = (arc.startAngle + arc.endAngle) / 2

        const x1 = cx + Math.cos(midAngle) * outerR
        const y1 = cy + Math.sin(midAngle) * outerR
        const x2 = cx + Math.cos(midAngle) * (outerR + 14)
        let   y2 = cy + Math.sin(midAngle) * (outerR + 14)
        const isRight = Math.cos(midAngle) >= 0
        const side    = isRight ? 'right' : 'left'
        const sideMul = isRight ? 1 : -1

        // Clamp y2 within canvas, then collision-avoid
        y2 = Math.max(safeY, Math.min(canvasH - safeY, y2))
        for (const py of placed[side]) {
          if (Math.abs(y2 - py) < labelGap) {
            y2 = y2 < py ? py - labelGap : py + labelGap
          }
        }
        y2 = Math.max(safeY, Math.min(canvasH - safeY, y2))
        placed[side].push(y2)

        // Measure label widths
        const displayLabel = String(label)
        const amountText   = showAmount ? formatter(value) : ''

        ctx.font = '600 11.5px system-ui, -apple-system, sans-serif'
        const labelW = ctx.measureText(displayLabel).width
        let amountW = 0
        if (showAmount) {
          ctx.font = '500 10px system-ui, -apple-system, sans-serif'
          amountW = ctx.measureText(amountText).width
        }
        const maxLabelW = Math.max(labelW, amountW)

        // Position dotX so label fits inside canvas
        const margin = 4
        let dotX
        if (isRight) {
          const maxDotX = canvasW - margin - 5 - maxLabelW
          const minDotX = cx + outerR + 16
          dotX = Math.min(x2 + 14, maxDotX)
          dotX = Math.max(dotX, minDotX)
        } else {
          const minDotX = margin + 5 + maxLabelW
          const maxDotX = cx - outerR - 16
          dotX = Math.max(x2 - 14, minDotX)
          dotX = Math.min(dotX, maxDotX)
        }

        // Draw leader line (3 segments)
        ctx.strokeStyle = text3
        ctx.beginPath()
        ctx.moveTo(x1, y1)
        ctx.lineTo(x2, y2)
        ctx.lineTo(dotX, y2)
        ctx.stroke()

        // Colored dot at end of line
        ctx.fillStyle = ds.backgroundColor[i] || text2
        ctx.beginPath()
        ctx.arc(dotX, y2, 3.5, 0, Math.PI * 2)
        ctx.fill()

        // Truncate label if absolutely needed
        const availW = isRight ? (canvasW - dotX - 5 - margin) : (dotX - 5 - margin)
        ctx.font = '600 11.5px system-ui, -apple-system, sans-serif'
        let drawLabel = displayLabel
        while (ctx.measureText(drawLabel).width > availW && drawLabel.length > 3) {
          drawLabel = drawLabel.slice(0, -2) + '…'
        }

        const labelX = dotX + sideMul * 6
        ctx.textAlign = isRight ? 'left' : 'right'

        if (showAmount) {
          // 2-line: name on top, amount below
          ctx.textBaseline = 'middle'
          ctx.fillStyle = text
          ctx.fillText(drawLabel, labelX, y2 - 7)
          ctx.fillStyle = text2
          ctx.font = '500 10px system-ui, -apple-system, sans-serif'
          ctx.fillText(amountText, labelX, y2 + 7)
        } else {
          // 1-line: just name centered on dot y
          ctx.textBaseline = 'middle'
          ctx.fillStyle = text
          ctx.fillText(drawLabel, labelX, y2)
        }
      })

      ctx.restore()
    } catch (err) {
      console.warn('leaderLinesPlugin error:', err)
    }
  },
}

/** Destroy a Chart instance safely */
export function destroyChart(instance) {
  if (instance) { instance.destroy() }
}
