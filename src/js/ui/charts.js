// src/js/ui/charts.js
// Chart.js wrappers with consistent styling
import { Chart } from 'chart.js/auto'

const GRID_COLOR  = 'rgba(255,255,255,0.04)'
const TICK_COLOR  = '#5a6075'
const LABEL_COLOR = '#8b92a8'

const defaultScales = {
  x: { grid: { display: false }, ticks: { color: TICK_COLOR, font: { size: 11 } } },
  y: { grid: { color: GRID_COLOR }, ticks: { color: TICK_COLOR, font: { size: 11 } } },
}

/**
 * Create a doughnut chart
 */
export function createDoughnut(canvasId, labels, data, colors) {
  const ctx = document.getElementById(canvasId)?.getContext('2d')
  if (!ctx) return null
  return new Chart(ctx, {
    type: 'doughnut',
    data: {
      labels,
      datasets: [{ data, backgroundColor: colors, borderWidth: 0, hoverOffset: 4 }],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      cutout: '65%',
      plugins: {
        legend: { display: false },
        tooltip: { callbacks: { label: d => ' Rp ' + Math.abs(d.raw).toLocaleString('id-ID') } },
      },
    },
  })
}

/**
 * Create a bar chart (income vs expense)
 */
export function createBar(canvasId, labels, datasets) {
  if (!ctx) return null
  return new Chart(ctx, {
    type: 'bar',
    data: { labels, datasets },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: { legend: { display: false } },
      scales: defaultScales,
      barPercentage: 0.7,
    },
  })
}

/**
 * Create a line chart
 */
export function createLine(canvasId, labels, dataset) {
  if (!ctx) return null
  return new Chart(ctx, {
    type: 'line',
    data: { labels, datasets: [dataset] },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { labels: { color: LABEL_COLOR, font: { size: 11 } } },
        tooltip: { callbacks: { label: d => ' Rp ' + Math.abs(d.raw).toLocaleString('id-ID') } },
      },
      scales: defaultScales,
    },
  })
}

/** Destroy a Chart instance safely */
export function destroyChart(instance) {
  if (instance) { instance.destroy() }
}
