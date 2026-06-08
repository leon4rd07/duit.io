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
 * Algorithm (5 passes):
 *   1. Compute initial positions per top-N segment based on arc midAngle
 *   1.5. REBALANCE sides — if one side has many more labels, move the most
 *        angularly-ambiguous ones (closest to top/bottom) to the other side.
 *        Reflect x2 so the leader line bends cleanly toward the new side.
 *   2. Resolve Y collisions per side via strict ordering + clamp+shift
 *   2.5. Compute UNIFORM dotX per side based on widest label on that side.
 *        All dots align vertically on each side — labels look orderly.
 *   3. Draw lines, dots, and labels.
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
      const labelGap = showAmount ? 32 : 24
      const margin  = 4

      // ── Pass 1: initial positions
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
        const x2 = cx + Math.cos(midAngle) * (outerR + 16)
        const y2 = cy + Math.sin(midAngle) * (outerR + 16)
        const naturalRight = Math.cos(midAngle) >= 0

        placements.push({
          i, label, value, pct, midAngle,
          x1, y1, x2, y2, cx, cy, outerR,
          isRight: naturalRight,
          side: naturalRight ? 'right' : 'left',
          sideMul: naturalRight ? 1 : -1,
          color: ds.backgroundColor[i] || text2,
        })
      })

      // ── Pass 1.5: rebalance sides if heavily imbalanced
      const rightCount = placements.filter(p => p.side === 'right').length
      const leftCount  = placements.filter(p => p.side === 'left').length
      const diff = leftCount - rightCount // positive if more on left
      if (Math.abs(diff) > 1 && placements.length >= 3) {
        const fromSide = diff > 0 ? 'left' : 'right'
        const toSide   = diff > 0 ? 'right' : 'left'
        const newMul   = toSide === 'right' ? 1 : -1
        const moveCount = Math.floor(Math.abs(diff) / 2)

        // Pick the most angularly-ambiguous labels (smallest |cos|, i.e. near top/bottom)
        const fromList = placements.filter(p => p.side === fromSide)
          .sort((a, b) => Math.abs(Math.cos(a.midAngle)) - Math.abs(Math.cos(b.midAngle)))

        for (let k = 0; k < moveCount; k++) {
          const p = fromList[k]
          if (!p) break
          p.side = toSide
          p.isRight = (toSide === 'right')
          p.sideMul = newMul
          // Reflect x2 across vertical axis so bend point is on the new side
          p.x2 = p.cx + (toSide === 'right' ? 1 : -1) * Math.abs(Math.cos(p.midAngle)) * (p.outerR + 16)
        }
      }

      // ── Pass 2: resolve Y collisions per side (strict ordering)
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

      // ── Pass 2.5: uniform dotX per side (vertical alignment)
      ;['left', 'right'].forEach(side => {
        const sideList = placements.filter(p => p.side === side)
        if (!sideList.length) return
        let maxW = 0
        ctx.font = '600 11.5px system-ui, -apple-system, sans-serif'
        sideList.forEach(p => { maxW = Math.max(maxW, ctx.measureText(p.label).width) })
        if (showAmount) {
          ctx.font = '500 10px system-ui, -apple-system, sans-serif'
          sideList.forEach(p => { maxW = Math.max(maxW, ctx.measureText(formatter(p.value)).width) })
        }
        const commonDotX = side === 'right'
          ? canvasW - margin - 6 - maxW
          : margin + 6 + maxW
        sideList.forEach(p => { p.dotX = commonDotX; p.labelMaxW = maxW })
      })

      // ── Pass 3: draw all
      ctx.save()
      ctx.lineWidth = 1

      placements.forEach(p => {
        const { x1, y1, x2, y2, isRight, sideMul, label, value, color, dotX } = p

        // Leader line (3 segments: arc → bend → dot)
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
          ctx.fillText(label, labelX, y2 - 7)
          ctx.fillStyle = text2
          ctx.font = '500 10px system-ui, -apple-system, sans-serif'
          ctx.fillText(formatter(value), labelX, y2 + 7)
        } else {
          ctx.fillStyle = text
          ctx.font = '600 11.5px system-ui, -apple-system, sans-serif'
          ctx.fillText(label, labelX, y2)
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
