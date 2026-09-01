<script setup>
import { computed } from 'vue'
import { compileFunction } from '../lib/qalc/index.js'

const props = defineProps({
  expressions: { type: Array, default: () => ['x^2'] },
  xmin: { type: Number, default: -10 },
  xmax: { type: Number, default: 10 },
  ymin: { type: Number, default: -6 },
  ymax: { type: Number, default: 6 },
  width: { type: Number, default: 360 },
  height: { type: Number, default: 260 },
  degrees: { type: Boolean, default: false }
})

const SERIES_COLORS = ['#0091ff', '#e5484d', '#30a46c', '#8e4ec6', '#f76b15']

const pad = { l: 4, r: 4, t: 4, b: 4 }
const plotW = computed(() => Math.max(20, props.width - pad.l - pad.r))
const plotH = computed(() => Math.max(20, props.height - pad.t - pad.b))

const sx = (x) => pad.l + ((x - props.xmin) / (props.xmax - props.xmin)) * plotW.value
const sy = (y) => pad.t + plotH.value - ((y - props.ymin) / (props.ymax - props.ymin)) * plotH.value

/** A "nice" tick step: 1, 2 or 5 times a power of ten. */
function tickStep (range, target = 8) {
  const raw = range / target
  const mag = Math.pow(10, Math.floor(Math.log10(raw)))
  const norm = raw / mag
  const step = norm >= 5 ? 5 : norm >= 2 ? 2 : 1
  return step * mag
}

function ticks (min, max) {
  const step = tickStep(max - min)
  const out = []
  const start = Math.ceil(min / step) * step
  for (let v = start; v <= max + step * 1e-6 && out.length < 60; v += step) {
    out.push(Math.abs(v) < step * 1e-6 ? 0 : Number(v.toPrecision(12)))
  }
  return out
}

const xTicks = computed(() => ticks(props.xmin, props.xmax))
const yTicks = computed(() => ticks(props.ymin, props.ymax))

const axisX = computed(() => sy(0))
const axisY = computed(() => sx(0))

/**
 * Sample each expression across the visible range. Segments break wherever the
 * function is undefined or jumps a screen-height in one step, so asymptotes
 * (tan x, 1/x) do not get joined up by a vertical line that isn't there.
 */
const series = computed(() => {
  const samples = Math.max(80, Math.min(1200, Math.round(plotW.value * 2)))
  const dx = (props.xmax - props.xmin) / samples
  const jumpLimit = (props.ymax - props.ymin) * 0.6

  return props.expressions.map((expr, index) => {
    const color = SERIES_COLORS[index % SERIES_COLORS.length]
    if (!expr || !expr.trim()) return { expr, color, segments: [], error: null }

    let fn
    try {
      fn = compileFunction(expr, 'x', { angleUnit: props.degrees ? 'deg' : 'rad' })
    } catch (err) {
      return { expr, color, segments: [], error: err.message }
    }

    // Everything outside the frame is clipped by the svg anyway, so points far
    // beyond it are pinned to a nearby margin. That keeps steep curves (x^2 at
    // the edges, 1/x near zero) from emitting five-digit coordinates.
    const margin = plotH.value * 2
    const clampY = (v) => Math.min(pad.t + plotH.value + margin, Math.max(pad.t - margin, v))

    const segments = []
    let current = []
    let prevY = null
    for (let i = 0; i <= samples; i++) {
      const x = props.xmin + i * dx
      const y = fn(x)
      const ok = Number.isFinite(y)
      if (!ok || (prevY !== null && Math.abs(y - prevY) > jumpLimit)) {
        if (current.length > 1) segments.push(current)
        current = []
        prevY = ok ? y : null
        if (!ok) continue
      }
      current.push(`${sx(x).toFixed(2)},${clampY(sy(y)).toFixed(2)}`)
      prevY = y
    }
    if (current.length > 1) segments.push(current)
    return { expr, color, segments, error: null }
  })
})
</script>

<template>
  <svg :width="width" :height="height" :viewBox="`0 0 ${width} ${height}`" class="plot">
    <rect :width="width" :height="height" fill="var(--plot-bg)" rx="6" />

    <g class="grid">
      <line v-for="t in xTicks" :key="`gx${t}`" :x1="sx(t)" :y1="pad.t" :x2="sx(t)" :y2="pad.t + plotH" />
      <line v-for="t in yTicks" :key="`gy${t}`" :x1="pad.l" :y1="sy(t)" :x2="pad.l + plotW" :y2="sy(t)" />
    </g>

    <g class="axes">
      <line v-if="ymin <= 0 && ymax >= 0" :x1="pad.l" :y1="axisX" :x2="pad.l + plotW" :y2="axisX" />
      <line v-if="xmin <= 0 && xmax >= 0" :x1="axisY" :y1="pad.t" :x2="axisY" :y2="pad.t + plotH" />
    </g>

    <g class="tick-labels">
      <text
        v-for="t in xTicks"
        :key="`lx${t}`"
        v-show="t !== 0"
        :x="sx(t)"
        :y="Math.min(Math.max(axisX + 12, pad.t + 10), pad.t + plotH - 2)"
        text-anchor="middle"
      >{{ t }}</text>
      <text
        v-for="t in yTicks"
        :key="`ly${t}`"
        v-show="t !== 0"
        :x="Math.min(Math.max(axisY - 5, pad.l + 2), pad.l + plotW - 4)"
        :y="sy(t) + 3"
        text-anchor="end"
      >{{ t }}</text>
    </g>

    <g v-for="(s, i) in series" :key="i">
      <polyline
        v-for="(seg, j) in s.segments"
        :key="j"
        :points="seg.join(' ')"
        fill="none"
        :stroke="s.color"
        stroke-width="2"
        stroke-linecap="round"
        stroke-linejoin="round"
      />
    </g>

    <g class="legend">
      <template v-for="(s, i) in series" :key="`leg${i}`">
        <text v-if="s.error" :x="8" :y="16 + i * 14" fill="#e5484d">{{ s.expr }}: {{ s.error }}</text>
        <text v-else-if="s.expr" :x="8" :y="16 + i * 14" :fill="s.color">y = {{ s.expr }}</text>
      </template>
    </g>
  </svg>
</template>

<style scoped>
.plot {
  display: block;
  border-radius: 6px;
}
.grid line {
  stroke: var(--plot-grid);
  stroke-width: 1;
}
.axes line {
  stroke: var(--plot-axis);
  stroke-width: 1.5;
}
.tick-labels text {
  font-size: 9px;
  fill: var(--plot-tick);
  font-family: var(--mono);
}
.legend text {
  font-size: 11px;
  font-family: var(--mono);
}
</style>
