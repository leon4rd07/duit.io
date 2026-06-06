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
 * Draws lines + labels around the donut for top-5 segments.
 * Handles single-segment full circle and clamps to canvas bounds.
 */
export const leaderLinesPlugin = {
  id: 'leaderLines',
  afterDraw(chart) {
    try {
      const { ctx, canvas } = chart
      const meta = chart.getDatasetMeta(0)
      const ds = chart.data.datasets[0]
      const labels = chart.data.labels
      const dataArr = ds.data
      const total = dataArr.reduce((s, v) => s + Number(v), 0)
      if (!total || !meta.data.length) return

      const cs = getComputedStyle(document.documentElement)
      const text2 = cs.getPropertyValue('--text2').trim() || '#8b92a8'
      const text3 = cs.getPropertyValue('--text3').trim() || '#5a6075'

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

      const isSingleDominant = topItems.length === 1 || topItems[0].pct >= 0.97

      items.forEach(({ i, arc, label, pct }) => {
        if (!topIdxSet.has(i)) return
        if (pct < 0.02) return

        const outerR = arc.outerRadius
        const cx = arc.x
        const cy = arc.y

        let midAngle, x1, y1, x2, y2, isRight

        if (isSingleDominant && pct >= 0.97) {
          // Force position at upper-right for the single dominant segment
          midAngle = -Math.PI / 4
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

        y2 = Math.max(safeMargin, Math.min(canvasH - safeMargin, y2))
        const side = isRight ? 'right' : 'left'
        const sideMul = isRight ? 1 : -1

        for (const py of placedLabels[side]) {
          if (Math.abs(y2 - py) < labelHeight) {
            y2 = y2 < py ? py - labelHeight : py + labelHeight
          }
        }
        y2 = Math.max(safeMargin, Math.min(canvasH - safeMargin, y2))
        placedLabels[side].push(y2)

        let dotX = isRight
          ? Math.min(x2 + 14, canvasW - 6)
          : Math.max(x2 - 14, 6)

        ctx.strokeStyle = text3
        ctx.beginPath()
        ctx.moveTo(x1, y1)
        ctx.lineTo(x2, y2)
        ctx.lineTo(dotX, y2)
        ctx.stroke()

        ctx.fillStyle = ds.backgroundColor[i]
        ctx.beginPath()
        ctx.arc(dotX, y2, 3, 0, Math.PI * 2)
        ctx.fill()

        const cleanLabel = (label || '').replace(/^[^\w\s]+\s*/, '') || label || ''
        ctx.fillStyle = text2
        ctx.textAlign = isRight ? 'left' : 'right'
        ctx.textBaseline = 'middle'
        const maxTextW = isRight
          ? Math.max(20, canvasW - dotX - 8)
          : Math.max(20, dotX - 8)
        let displayLabel = cleanLabel
        while (ctx.measureText(displayLabel).width > maxTextW && displayLabel.length > 3) {
          displayLabel = displayLabel.slice(0, -2) + '…'
        }
        ctx.fillText(displayLabel, dotX + sideMul * 5, y2)
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
