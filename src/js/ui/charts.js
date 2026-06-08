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
 *
 * Each label sits CLOSE to its slice (short leader line, no big empty space).
 *   1. Compute initial position per top-N segment from arc midAngle
 *   2. Resolve Y collisions per side via strict ordering
 *   3. Position dotX just past the bend point — short, clear lines to each slice
 *   4. Draw lines, dots, labels
 *
 * Options (chart.options.plugins.leaderLines):
 *   - showAmount: boolean — second line with amount (default: false)
 *   - format: (v) => string — amount formatter
 *   - topN: number — how many top segments to label (default: 5)
 */
export const leaderLinesPlugin = {
  id: 'leaderLines',
  afterDraw(chart) {
    try {
      const { ctx, canvas } = chart
      const meta = chart.getDatasetMeta(0)
      if (!meta?.data?.length) return

      const ds      = chart.data.datasets[0]
      const dataArr = ds.data
      const labels  = chart.data.labels
      const total   = dataArr.reduce((s, v) => s + Number(v || 0), 0)
      if (!total) return

      const opts       = chart.options?.plugins?.leaderLines || {}
      const showAmount = !!opts.showAmount
      const topN       = opts.topN || 5
      const formatter  = opts.format || (v => 'Rp ' + Math.round(Number(v) || 0).toLocaleString('id-ID'))

      const cs    = getComputedStyle(document.documentElement)
      const text  = (cs.getPropertyValue('--text').trim()  || '#e1e6f0')
      const text2 = (cs.getPropertyValue('--text2').trim() || '#8b92a8')
      const text3 = (cs.getPropertyValue('--text3').trim() || '#5a6075')

      const dpr     = window.devicePixelRatio || 1
      const canvasW = canvas.width  / dpr
      const canvasH = canvas.height / dpr
      const safeY   = 12
      const labelGap = showAmount ? 32 : 22
      const margin  = 4
      const lineExtension = 24 // px past the bend point — keeps lines SHORT

      // Pass 1: initial positions
      const items = meta.data.map((arc, i) => ({
        i, arc, value: Number(dataArr[i] || 0), label: String(labels[i] || ''),
        pct: Number(dataArr[i] || 0) / total,
      }))
      const topItems  = items.slice().sort((a, b) => b.value - a.value).slice(0, topN)
      const topIdxSet = new Set(topItems.map(t => t.i))
      const isSingleDominant = topItems.length === 1 || (topItems[0]?.pct >= 0.97)

      const placements = []
      items.forEach(({ i, arc, label, value, pct }) => {
        if (!topIdxSet.has(i)) return
        const cx = arc.x, cy = arc.y, outerR = arc.outerRadius
        let midAngle
        if (isSingleDominant && pct >= 0.97) midAngle = -Math.PI / 4
        else midAngle = (arc.startAngle + arc.endAngle) / 2

        const x1 = cx + Math.cos(midAngle) * outerR
        const y1 = cy + Math.sin(midAngle) * outerR
        const x2 = cx + Math.cos(midAngle) * (outerR + 14)
        const y2 = cy + Math.sin(midAngle) * (outerR + 14)
        const isRight = Math.cos(midAngle) >= 0

        // Pre-measure label width for dotX clamping
        ctx.font = '600 11.5px system-ui, -apple-system, sans-serif'
        const labelW = ctx.measureText(label).width
        let amountW = 0
        if (showAmount) {
          ctx.font = '500 10px system-ui, -apple-system, sans-serif'
          amountW = ctx.measureText(formatter(value)).width
        }
        const myMaxW = Math.max(labelW, amountW)

        placements.push({
          i, label, value, pct, midAngle,
          x1, y1, x2, y2, cx, cy, outerR,
          isRight, side: isRight ? 'right' : 'left', sideMul: isRight ? 1 : -1,
          color: ds.backgroundColor[i] || text2,
          labelW: myMaxW,
        })
      })

      // Pass 2: resolve Y collisions per side (strict ordering)
      ;['left', 'right'].forEach(side => {
        const sideList = placements.filter(p => p.side === side).sort((a, b) => a.y2 - b.y2)
        const n = sideList.length
        if (n === 0) return
        for (let k = 1; k < n; k++) {
          const minY = sideList[k - 1].y2 + labelGap
          if (sideList[k].y2 < minY) sideList[k].y2 = minY
        }
        const last = sideList[n - 1].y2
        const maxY = canvasH - safeY
        if (last > maxY) {
          const shift = last - maxY
          sideList.forEach(p => { p.y2 -= shift })
        }
        const first = sideList[0].y2
        if (first < safeY) {
          const shift = safeY - first
          sideList.forEach(p => { p.y2 += shift })
        }
      })

      // Pass 3: compute dotX per label (close to bend point — short lines)
      placements.forEach(p => {
        const minDotXRight = p.cx + p.outerR + 16
        const minDotXLeft  = p.cx - p.outerR - 16
        if (p.isRight) {
          let dotX = p.x2 + lineExtension
          const maxDotX = canvasW - margin - 6 - p.labelW
          dotX = Math.min(dotX, maxDotX)  // never overflow right
          dotX = Math.max(dotX, minDotXRight) // never inside donut
          p.dotX = dotX
        } else {
          let dotX = p.x2 - lineExtension
          const minDotXClamp = margin + 6 + p.labelW
          dotX = Math.max(dotX, minDotXClamp)  // never overflow left
          dotX = Math.min(dotX, minDotXLeft)   // never inside donut (from left)
          p.dotX = dotX
        }
      })

      // Pass 4: draw all
      ctx.save()
      ctx.lineWidth = 1

      placements.forEach(p => {
        const { x1, y1, x2, y2, isRight, sideMul, label, value, color, dotX, labelW } = p

        // Re-clamp dotX one more time using ACTUAL truncated label
        // (in case label needs to be shorter for tight canvas)
        let drawLabel = label
        ctx.font = '600 11.5px system-ui, -apple-system, sans-serif'
        const availW = isRight ? (canvasW - dotX - 6 - margin) : (dotX - 6 - margin)
        while (ctx.measureText(drawLabel).width > availW && drawLabel.length > 3) {
          drawLabel = drawLabel.slice(0, -2) + '…'
        }

        // Leader line (3 segments)
        ctx.strokeStyle = text3
        ctx.beginPath()
        ctx.moveTo(x1, y1)
        ctx.lineTo(x2, y2)
        ctx.lineTo(dotX, y2)
        ctx.stroke()

        // Colored dot
        ctx.fillStyle = color
        ctx.beginPath()
        ctx.arc(dotX, y2, 3.5, 0, Math.PI * 2)
        ctx.fill()

        const labelX = dotX + sideMul * 6
        ctx.textAlign = isRight ? 'left' : 'right'
        ctx.textBaseline = 'middle'

        if (showAmount) {
          ctx.fillStyle = text
          ctx.font = '600 11.5px system-ui, -apple-system, sans-serif'
          ctx.fillText(drawLabel, labelX, y2 - 7)
          ctx.fillStyle = text2
          ctx.font = '500 10px system-ui, -apple-system, sans-serif'
          ctx.fillText(formatter(value), labelX, y2 + 7)
        } else {
          ctx.fillStyle = text
          ctx.font = '600 11.5px system-ui, -apple-system, sans-serif'
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
