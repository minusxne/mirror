<script setup>
import { computed } from 'vue'
import { smoothPathD } from '../lib/geometry.js'

const props = defineProps({
  item: { type: Object, required: true },
  selected: { type: Boolean, default: false },
  zoom: { type: Number, default: 1 }
})

const d = computed(() => props.item.data || {})
const strokeWidth = computed(() => d.value.strokeWidth || 2)

// A fat invisible stroke under thin lines, so they are actually clickable —
// and more generous when zoomed out, where a 2px line is a hair.
const hitWidth = computed(() =>
  Math.min(64, Math.max(strokeWidth.value + 8, 14 / props.zoom))
)

/**
 * Each vector item is its own absolutely-positioned <svg>, so it participates
 * in the same z-index stack as sticky notes and text. That is what lets you pen
 * over a note, or send a highlight behind one.
 *
 * The svg is inflated by `pad` on every side so strokes, arrowheads and the
 * invisible hit area stay inside its viewport instead of being clipped.
 */
const pad = computed(() => Math.ceil(hitWidth.value / 2 + strokeWidth.value * 1.5 + 8))

const hostStyle = computed(() => ({
  transform: `translate(${props.item.x - pad.value}px, ${props.item.y - pad.value}px)`,
  zIndex: props.item.z,
  ...(d.value.blend ? { mixBlendMode: d.value.blend } : null)
}))

const hostWidth = computed(() => Math.max(1, props.item.w) + pad.value * 2)
const hostHeight = computed(() => Math.max(1, props.item.h) + pad.value * 2)

const dashArray = computed(() => {
  const w = strokeWidth.value
  if (d.value.dash === 'dashed') return `${w * 3} ${w * 2.5}`
  if (d.value.dash === 'dotted') return `${w * 0.01} ${w * 2}`
  return null
})

/** Stroke geometry, in the item's own coordinate space. */
const strokeD = computed(() => {
  const pts = d.value.points || []
  if (!pts.length) return ''
  if (props.item.type === 'path') return smoothPathD(pts)
  if (pts.length < 2) return ''
  return `M ${pts[0][0]} ${pts[0][1]} L ${pts[1][0]} ${pts[1][1]}`
})

const diamondPoints = computed(() => {
  const { w, h } = props.item
  return `${w / 2},0 ${w},${h / 2} ${w / 2},${h} 0,${h / 2}`
})

// Arrowheads scale with the stroke so a thick arrow does not get a tiny tip.
const arrowHead = computed(() => {
  const pts = d.value.points || [[0, 0], [0, 0]]
  const [[x1, y1], [x2, y2]] = pts
  const angle = Math.atan2(y2 - y1, x2 - x1)
  const size = Math.max(10, strokeWidth.value * 3.4)
  const spread = 0.42
  return [
    [x2 - size * Math.cos(angle - spread), y2 - size * Math.sin(angle - spread)],
    [x2, y2],
    [x2 - size * Math.cos(angle + spread), y2 - size * Math.sin(angle + spread)]
  ]
    .map((p) => p.map((n) => Math.round(n * 100) / 100).join(','))
    .join(' ')
})

const isStroke = computed(() => ['path', 'line', 'arrow'].includes(props.item.type))
const color = computed(() => d.value.color || '#1f2933')

// `transparent` rather than `none`: it paints nothing but still counts as a
// painted region, so clicking inside an outline-only shape selects it.
const fill = computed(() => d.value.fill || 'transparent')
</script>

<template>
  <svg
    class="vector-item"
    :class="{ selected }"
    :style="hostStyle"
    :width="hostWidth"
    :height="hostHeight"
    :viewBox="`0 0 ${hostWidth} ${hostHeight}`"
    :data-item-id="item.id"
  >
    <g :transform="`translate(${pad} ${pad})`" :opacity="d.opacity ?? 1">
      <!-- Freehand strokes, straight lines and arrows -->
      <template v-if="isStroke">
        <path
          :d="strokeD"
          fill="none"
          stroke="transparent"
          :stroke-width="hitWidth"
          stroke-linecap="round"
          stroke-linejoin="round"
          :data-item-id="item.id"
        />
        <path
          :d="strokeD"
          fill="none"
          :stroke="color"
          :stroke-width="strokeWidth"
          :stroke-dasharray="dashArray"
          stroke-linecap="round"
          stroke-linejoin="round"
          pointer-events="none"
        />
        <polygon
          v-if="item.type === 'arrow'"
          :points="arrowHead"
          :fill="color"
          :stroke="color"
          :stroke-width="strokeWidth * 0.6"
          stroke-linejoin="round"
          pointer-events="none"
        />
      </template>

      <rect
        v-else-if="item.type === 'rect'"
        :width="Math.max(item.w, 1)"
        :height="Math.max(item.h, 1)"
        :rx="Math.max(0, Math.min(d.radius ?? 6, item.w / 2, item.h / 2))"
        :fill="fill"
        :stroke="color"
        :stroke-width="strokeWidth"
        :stroke-dasharray="dashArray"
        :data-item-id="item.id"
      />

      <ellipse
        v-else-if="item.type === 'ellipse'"
        :cx="item.w / 2"
        :cy="item.h / 2"
        :rx="Math.max(item.w / 2, 1)"
        :ry="Math.max(item.h / 2, 1)"
        :fill="fill"
        :stroke="color"
        :stroke-width="strokeWidth"
        :stroke-dasharray="dashArray"
        :data-item-id="item.id"
      />

      <polygon
        v-else-if="item.type === 'diamond'"
        :points="diamondPoints"
        :fill="fill"
        :stroke="color"
        :stroke-width="strokeWidth"
        :stroke-dasharray="dashArray"
        stroke-linejoin="round"
        :data-item-id="item.id"
      />

      <!-- Optional label centred inside a shape -->
      <text
        v-if="d.label && !isStroke"
        :x="item.w / 2"
        :y="item.h / 2"
        text-anchor="middle"
        dominant-baseline="central"
        :font-size="d.fontSize || 16"
        :fill="d.labelColor || color"
        pointer-events="none"
        class="shape-label"
      >{{ d.label }}</text>
    </g>
  </svg>
</template>

<style scoped>
.vector-item {
  position: absolute;
  top: 0;
  left: 0;
  transform-origin: 0 0;
  overflow: visible;
  /* Only the drawn geometry is clickable, never the padded box around it. */
  pointer-events: none;
}
.vector-item :deep(path),
.vector-item :deep(rect),
.vector-item :deep(ellipse),
.vector-item :deep(polygon) {
  pointer-events: auto;
}
.vector-item :deep([pointer-events='none']) {
  pointer-events: none;
}
.shape-label {
  font-family: var(--sans);
  user-select: none;
}
</style>
