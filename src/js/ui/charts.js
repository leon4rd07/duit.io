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
 * Category badge plugin for doughnut charts (no leader lines).
 *
 * Renders a circular badge (emoji on a white disc with a colored ring) anchored
 * just outside each slice's midpoint, and draws the percentage inside the slice
 * when the slice is large enough. Clean, modern, no crossing lines.
 *
 * The `data.labels` should be the raw category names (with optional emoji prefix).
 * The plugin extracts the leading emoji for the badge and shows "name pct%" only
 * in the tooltip — the chart face stays uncluttered.
 *
 * Options (chart.options.plugins.leaderLines):
 *   - icons: string[] — emoji per data index (overrides emoji parsed from label)
 *   - topN: number — badge only the top N slices (default: all)
 *   - minPctForInside: number — min fraction to draw % inside slice (default 0.05)
 */
export const leaderLinesPlugin = {
  id: 'leaderLines',
  afterDraw(chart) {
    try {
      const { ctx } = chart
      const meta = chart.getDatasetMeta(0)
      if (!meta?.data?.length) return

      const ds      = chart.data.datasets[0]
      const dataArr = ds.data
      const labels  = chart.data.labels
      const total   = dataArr.reduce((s, v) => s + Number(v || 0), 0)
      if (!total) return

      const opts    = chart.options?.plugins?.leaderLines || {}
      const icons   = opts.icons || null
      const topN    = opts.topN || dataArr.length
      const minPctInside = opts.minPctForInside ?? 0.05

      // Which slices get a badge: top N by value
      const ranked = dataArr.map((v, i) => ({ i, v: Number(v || 0) }))
        .sort((a, b) => b.v - a.v).slice(0, topN)
      const badgeSet = new Set(ranked.map(r => r.i))

      const badgeR = 15      // badge circle radius
      const ringW  = 2.5     // colored ring thickness

      ctx.save()

      meta.data.forEach((arc, i) => {
        const value = Number(dataArr[i] || 0)
        if (value <= 0) return
        const pct = value / total
        const color = ds.backgroundColor[i] || '#888'
        const cx = arc.x, cy = arc.y
        const midAngle = (arc.startAngle + arc.endAngle) / 2
        const midR = (arc.innerRadius + arc.outerRadius) / 2

        // ── Percentage text inside the slice (only if slice is big enough) ──
        if (pct >= minPctInside) {
          const px = cx + Math.cos(midAngle) * midR
          const py = cy + Math.sin(midAngle) * midR
          ctx.font = '700 11px system-ui, -apple-system, sans-serif'
          ctx.textAlign = 'center'
          ctx.textBaseline = 'middle'
          // White text reads well on saturated slice colors
          ctx.fillStyle = '#ffffff'
          ctx.fillText(Math.round(pct * 100) + '%', px, py)
        }

        // ── Circular emoji badge just outside the slice edge ──
        if (!badgeSet.has(i)) return
        // Skip badge for ultra-thin slices to avoid clutter (< 1.5%)
        if (pct < 0.015) return

        const bx = cx + Math.cos(midAngle) * (arc.outerRadius + badgeR + 3)
        const by = cy + Math.sin(midAngle) * (arc.outerRadius + badgeR + 3)

        // White disc
        ctx.beginPath()
        ctx.arc(bx, by, badgeR, 0, Math.PI * 2)
        ctx.fillStyle = '#ffffff'
        ctx.fill()
        // Colored ring
        ctx.lineWidth = ringW
        ctx.strokeStyle = color
        ctx.stroke()

        // Emoji (parse from icons option or from the label prefix)
        let emoji = ''
        if (icons && icons[i]) {
          emoji = icons[i]
        } else {
          const lbl = String(labels[i] || '')
          const mm = lbl.match(/^(\p{Extended_Pictographic}(?:\u200d\p{Extended_Pictographic})*)/u)
          emoji = mm ? mm[1] : (lbl.trim()[0] || '•')
        }
        ctx.font = '15px system-ui, "Apple Color Emoji", "Segoe UI Emoji", sans-serif'
        ctx.textAlign = 'center'
        ctx.textBaseline = 'middle'
        // Slight vertical nudge so emoji sits visually centered in the disc
        ctx.fillText(emoji, bx, by + 0.5)
      })

      ctx.restore()
    } catch (err) {
      console.warn('category badge plugin error:', err)
    }
  },
}

/** Destroy a Chart instance safely */
export function destroyChart(instance) {
  if (instance) { instance.destroy() }
}
