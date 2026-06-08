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
      const labelHeight = 28  // 2-line label needs more vertical space
      const safeMargin = 18
      const canvasW = canvas.width / (window.devicePixelRatio || 1)
      const canvasH = canvas.height / (window.devicePixelRatio || 1)

      const isSingleDominant = topItems.length === 1 || topItems[0].pct >= 0.97

      items.forEach(({ i, arc, label, value, pct }) => {
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

        // First measure label widths to know how much horizontal space we need
        const displayLabel = String(label || '')  // KEEP emoji prefix
        const formatter = chart.options?.plugins?.leaderLines?.format
                        || (v => 'Rp ' + Math.round(Number(v) || 0).toLocaleString('id-ID'))
        const amountText = formatter(Number(value) || 0)
        const text = cs.getPropertyValue('--text').trim() || '#e1e6f0'

        ctx.font = '600 11.5px system-ui, -apple-system, sans-serif'
        const labelW = ctx.measureText(displayLabel).width
        ctx.font = '500 10px system-ui, -apple-system, sans-serif'
        const amountW = ctx.measureText(amountText).width
        const maxLabelW = Math.max(labelW, amountW)

        // Compute dotX so the label STARTS to the side of the dot AND fits within canvas
        // Right side: labelX = dotX + 5, text extends right → need dotX + 5 + maxLabelW <= canvasW - margin
        // Left side:  labelX = dotX - 5, text extends left  → need dotX - 5 - maxLabelW >= margin
        const margin = 4
        let dotX
        if (isRight) {
          const maxDotX = canvasW - margin - 5 - maxLabelW
          const minDotX = cx + outerR + 18 // keep dot outside donut
          dotX = Math.min(x2 + 14, maxDotX)
          dotX = Math.max(dotX, minDotX)
        } else {
          const minDotX = margin + 5 + maxLabelW
          const maxDotX = cx - outerR - 18
          dotX = Math.max(x2 - 14, minDotX)
          dotX = Math.min(dotX, maxDotX)
        }

        // Draw leader line (3 segments: arc → bend → dot)
        ctx.strokeStyle = text3
        ctx.beginPath()
        ctx.moveTo(x1, y1)
        ctx.lineTo(x2, y2)
        ctx.lineTo(dotX, y2)
        ctx.stroke()

        // Draw colored dot at end of leader line
        ctx.fillStyle = ds.backgroundColor[i]
        ctx.beginPath()
        ctx.arc(dotX, y2, 3, 0, Math.PI * 2)
        ctx.fill()

        ctx.textAlign = isRight ? 'left' : 'right'
        ctx.textBaseline = 'middle'

        // Truncate label only if still doesn't fit (rare with our dotX clamping)
        const availableW = isRight ? (canvasW - dotX - 5 - margin)
                                   : (dotX - 5 - margin)
        ctx.font = '600 11.5px system-ui, -apple-system, sans-serif'
        let truncatedLabel = displayLabel
        while (ctx.measureText(truncatedLabel).width > availableW && truncatedLabel.length > 3) {
          truncatedLabel = truncatedLabel.slice(0, -2) + '…'
        }

        const labelX = dotX + sideMul * 5

        // Line 1: name with emoji
        ctx.fillStyle = text
        ctx.font = '600 11.5px system-ui, -apple-system, sans-serif'
        ctx.fillText(truncatedLabel, labelX, y2 - 7)

        // Line 2: amount (smaller, dimmer)
        ctx.fillStyle = text2
        ctx.font = '500 10px system-ui, -apple-system, sans-serif'
        ctx.fillText(amountText, labelX, y2 + 7)
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
