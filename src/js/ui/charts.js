// src/js/ui/charts.js
// Chart.js wrappers with consistent styling + circular badge donut
import { Chart } from 'chart.js/auto'

const GRID_COLOR  = 'rgba(255,255,255,0.04)'
const TICK_COLOR  = '#5a6075'
const LABEL_COLOR = '#8b92a8'

const defaultScales = {
  x: { grid: { display: false }, ticks: { color: TICK_COLOR, font: { size: 11 } } },
  y: { grid: { color: GRID_COLOR }, ticks: { color: TICK_COLOR, font: { size: 11 } } },
}

/**
 * Build display values for a doughnut so that tiny slices stay visible.
 *
 * Each slice is guaranteed at least `minPct` of the circle for *drawing*,
 * while the real values are kept for percentage labels/tooltips. This stops
 * 0.4% slices from rendering as an unreadable sliver.
 *
 * @param {number[]} rawValues  actual amounts
 * @param {number}   minPct     minimum visual fraction per slice (default 0.04 = 4%)
 * @returns {{ displayValues: number[], rawValues: number[], rawTotal: number }}
 */
export function buildDonutDisplay(rawValues, minPct = 0.04) {
  const rawTotal = rawValues.reduce((s, v) => s + Number(v || 0), 0)
  if (!rawTotal) return { displayValues: rawValues.slice(), rawValues, rawTotal: 0 }

  const n = rawValues.length
  // Cap total minimum so big slices don't get squashed to nothing
  const maxMinShare = 0.6 / Math.max(1, n) // each min slice ≤ this share of circle
  const effMin = Math.min(minPct, maxMinShare)

  // Slices below the floor get bumped up; the rest are scaled down proportionally
  const floorVal = effMin * rawTotal
  const smallIdx = []
  let smallSum = 0, bigSum = 0
  rawValues.forEach((v, i) => {
    const val = Number(v || 0)
    if (val > 0 && val < floorVal) { smallIdx.push(i); smallSum += val }
    else bigSum += val
  })

  if (!smallIdx.length) return { displayValues: rawValues.slice(), rawValues, rawTotal }

  // Space reserved for bumped-up small slices
  const reserved = smallIdx.length * floorVal
  // Remaining space for big slices (scaled down to fit)
  const remaining = Math.max(0, rawTotal - reserved)
  const bigScale = bigSum > 0 ? remaining / bigSum : 1

  const displayValues = rawValues.map((v, i) => {
    const val = Number(v || 0)
    if (val <= 0) return 0
    if (smallIdx.includes(i)) return floorVal
    return val * bigScale
  })

  return { displayValues, rawValues, rawTotal }
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
      const dataArr = ds.data  // display values (with min-size floor)
      const labels  = chart.data.labels
      const dispTotal = dataArr.reduce((s, v) => s + Number(v || 0), 0)
      if (!dispTotal) return

      const opts    = chart.options?.plugins?.leaderLines || {}
      const icons   = opts.icons || null
      // Real values for percentage display (falls back to display values)
      const rawArr  = opts.rawValues || dataArr
      const rawTotal = rawArr.reduce((s, v) => s + Number(v || 0), 0) || dispTotal
      const topN    = opts.topN || dataArr.length
      const minPctInside = opts.minPctForInside ?? 0.05

      // Which slices get a badge: top N by raw value
      const ranked = rawArr.map((v, i) => ({ i, v: Number(v || 0) }))
        .sort((a, b) => b.v - a.v).slice(0, topN)
      const badgeSet = new Set(ranked.map(r => r.i))

      const badgeR = 14      // badge circle radius
      const ringW  = 2.5     // colored ring thickness

      ctx.save()

      meta.data.forEach((arc, i) => {
        const rawValue = Number(rawArr[i] || 0)
        if (rawValue <= 0) return
        const pct = rawValue / rawTotal             // true percentage
        const dispPct = Number(dataArr[i] || 0) / dispTotal // visual size
        const color = ds.backgroundColor[i] || '#888'
        const cx = arc.x, cy = arc.y
        const midAngle = (arc.startAngle + arc.endAngle) / 2
        const midR = (arc.innerRadius + arc.outerRadius) / 2

        // ── Percentage text inside the slice (only if slice is visually big) ──
        if (dispPct >= minPctInside) {
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
        // Every top-N slice gets a badge — min-size flooring guarantees even
        // tiny (0.4%) slices are visible enough to anchor one.
        if (!badgeSet.has(i)) return

        const bx = cx + Math.cos(midAngle) * (arc.outerRadius + badgeR + 4)
        const by = cy + Math.sin(midAngle) * (arc.outerRadius + badgeR + 4)

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
