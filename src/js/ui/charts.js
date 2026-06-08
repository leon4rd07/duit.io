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
 * Two-pass algorithm:
 *   Pass 1: compute initial y position for each top-5 segment based on its arc midpoint
 *   Pass 2: sort labels per side (left/right) by y, then enforce minimum vertical gap
 *           between consecutive labels. If overflow, shift the whole stack to fit.
 *
 * Result: labels never overlap, even when adjacent slices have very similar angles.
 *
 * Options (via chart.options.plugins.leaderLines):
 *   - showAmount: boolean — draw amount on a second line below label (default: false)
 *   - format: (v) => string — amount formatter when showAmount=true
 *   - topN: number — how many top segments to label (default: 5)
 */
export const leaderLinesPlugin = {
  id: 'leaderLines',
  afterDraw(chart) {
    try {
      const { ctx, canvas } = chart
      const meta = chart.getDatasetMeta(0)
      if (!meta || !meta.data || !meta.data.length) return

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
      const labelGap = showAmount ? 32 : 24 // strict vertical gap to prevent overlap

      // ───── PASS 1: compute initial positions for each top-N segment ─────
      const items = meta.data.map((arc, i) => ({
        i, arc, value: Number(dataArr[i] || 0), label: String(labels[i] || ''),
        pct: Number(dataArr[i] || 0) / total,
      }))
      const topItems  = items.slice().sort((a, b) => b.value - a.value).slice(0, topN)
      const topIdxSet = new Set(topItems.map(t => t.i))
      const isSingleDominant = topItems.length === 1 || (topItems[0]?.pct >= 0.97)

      const placements = []
      items.forEach(({ i, arc, label, value, pct }) => {
        if (!topIdxSet.has(i)) return // top-N only, but NO size threshold — show all top-N

        const cx = arc.x, cy = arc.y, outerR = arc.outerRadius
        let midAngle
        if (isSingleDominant && pct >= 0.97) midAngle = -Math.PI / 4
        else midAngle = (arc.startAngle + arc.endAngle) / 2

        const x1 = cx + Math.cos(midAngle) * outerR
        const y1 = cy + Math.sin(midAngle) * outerR
        const x2 = cx + Math.cos(midAngle) * (outerR + 16)
        const y2 = cy + Math.sin(midAngle) * (outerR + 16)
        const isRight = Math.cos(midAngle) >= 0

        placements.push({
          i, label, value, pct, x1, y1, x2, y2, cx, cy, outerR,
          isRight, side: isRight ? 'right' : 'left', sideMul: isRight ? 1 : -1,
          color: ds.backgroundColor[i] || text2,
        })
      })

      // ───── PASS 2: resolve collisions per side using strict ordering ─────
      ;['left', 'right'].forEach(side => {
        const sideList = placements.filter(p => p.side === side).sort((a, b) => a.y2 - b.y2)
        const n = sideList.length
        if (n === 0) return

        // Walk top-to-bottom and enforce y[k] >= y[k-1] + labelGap
        for (let k = 1; k < n; k++) {
          const minY = sideList[k - 1].y2 + labelGap
          if (sideList[k].y2 < minY) sideList[k].y2 = minY
        }

        // If bottom-most exceeds canvas, shift stack up
        const last = sideList[n - 1].y2
        const maxY = canvasH - safeY
        if (last > maxY) {
          const shift = last - maxY
          sideList.forEach(p => { p.y2 -= shift })
        }
        // If top-most below safeY, shift stack down (rare but possible)
        const first = sideList[0].y2
        if (first < safeY) {
          const shift = safeY - first
          sideList.forEach(p => { p.y2 += shift })
        }
      })

      // ───── PASS 3: draw all labels ─────
      ctx.save()
      ctx.lineWidth = 1

      placements.forEach(p => {
        const { x1, y1, x2, y2, isRight, sideMul, label, value, color, cx, outerR } = p

        const displayLabel = label
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

        // Draw leader line (arc-edge → bend → dot)
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

        // Truncate label if it still won't fit (rare)
        const availW = isRight ? (canvasW - dotX - 5 - margin) : (dotX - 5 - margin)
        ctx.font = '600 11.5px system-ui, -apple-system, sans-serif'
        let drawLabel = displayLabel
        while (ctx.measureText(drawLabel).width > availW && drawLabel.length > 3) {
          drawLabel = drawLabel.slice(0, -2) + '…'
        }

        const labelX = dotX + sideMul * 6
        ctx.textAlign = isRight ? 'left' : 'right'

        if (showAmount) {
          ctx.textBaseline = 'middle'
          ctx.fillStyle = text
          ctx.fillText(drawLabel, labelX, y2 - 7)
          ctx.fillStyle = text2
          ctx.font = '500 10px system-ui, -apple-system, sans-serif'
          ctx.fillText(amountText, labelX, y2 + 7)
        } else {
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
