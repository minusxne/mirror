<script setup>
import { computed } from 'vue'
import { smoothPathD } from '../lib/geometry.js'

const props = defineProps({
  preview: { type: Object, default: null },
  width: { type: Number, default: 232 },
  height: { type: Number, default: 132 },
  loading: { type: Boolean, default: false }
})

const PAD = 10

/**
 * Fit the board's content into the tile. Zooming in past 1:1 on a nearly empty
 * board makes a single sticky note fill the thumbnail, which reads as "this
 * board is full" — so the scale is capped.
 */
const view = computed(() => {
  const b = props.preview?.bounds
  if (!b || !(b.w > 0 || b.h > 0)) return null
  const scale = Math.min(
    (props.width - PAD * 2) / Math.max(b.w, 1),
    (props.height - PAD * 2) / Math.max(b.h, 1),
    1.4
  )
  return {
    scale,
    tx: props.width / 2 - (b.x + b.w / 2) * scale,
    ty: props.height / 2 - (b.y + b.h / 2) * scale
  }
})

const isEmpty = computed(() => !props.loading && (!props.preview || props.preview.count === 0))

/** Strokes are already decimated server-side; smooth what is left. */
const pathD = (item) => {
  const pts = item.points || []
  if (pts.length < 2) return ''
  return item.type === 'path'
    ? smoothPathD(pts)
    : `M ${pts[0][0]} ${pts[0][1]} L ${pts[1][0]} ${pts[1][1]}`
}

const strokeFor = (item) => {
  // Hairlines vanish at thumbnail scale; keep a visible minimum.
  const k = view.value?.scale || 1
  return Math.max(0.6 / k, item.strokeWidth || 2)
}

const isStroke = (t) => t === 'path' || t === 'line' || t === 'arrow'
const isShape = (t) => t === 'rect' || t === 'ellipse' || t === 'diamond'
const isCard = (t) => t === 'math' || t === 'calc' || t === 'plot' || t === 'image'

const diamond = (item) => `${item.w / 2},0 ${item.w},${item.h / 2} ${item.w / 2},${item.h} 0,${item.h / 2}`

/** A couple of lines of a note's text, enough to recognise the board by. */
const noteLines = (item) => {
  const size = Math.max(item.h / 9, 8)
  return String(item.label || '')
    .split('\n')
    .slice(0, 4)
    .map((line, i) => ({ text: line.slice(0, 26), y: size * 1.6 + i * size * 1.25, size }))
}
</script>

<template>
  <div class="preview" :style="{ width: `${width}px`, height: `${height}px` }">
    <svg v-if="view" :width="width" :height="height" :viewBox="`0 0 ${width} ${height}`">
      <g :transform="`translate(${view.tx} ${view.ty}) scale(${view.scale})`">
        <g v-for="(item, i) in preview.items" :key="i" :transform="`translate(${item.x} ${item.y})`">
          <path
            v-if="isStroke(item.type)"
            :d="pathD(item)"
            fill="none"
            :stroke="item.color || 'currentColor'"
            :stroke-width="strokeFor(item)"
            :opacity="item.opacity ?? 1"
            stroke-linecap="round"
            stroke-linejoin="round"
          />

          <rect
            v-else-if="item.type === 'rect'"
            :width="Math.max(item.w, 1)"
            :height="Math.max(item.h, 1)"
            rx="3"
            :fill="item.fill || 'transparent'"
            :stroke="item.color || 'currentColor'"
            :stroke-width="strokeFor(item)"
          />
          <ellipse
            v-else-if="item.type === 'ellipse'"
            :cx="item.w / 2"
            :cy="item.h / 2"
            :rx="Math.max(item.w / 2, 1)"
            :ry="Math.max(item.h / 2, 1)"
            :fill="item.fill || 'transparent'"
            :stroke="item.color || 'currentColor'"
            :stroke-width="strokeFor(item)"
          />
          <polygon
            v-else-if="item.type === 'diamond'"
            :points="diamond(item)"
            :fill="item.fill || 'transparent'"
            :stroke="item.color || 'currentColor'"
            :stroke-width="strokeFor(item)"
          />

          <template v-else-if="item.type === 'sticky'">
            <rect
              :width="Math.max(item.w, 1)"
              :height="Math.max(item.h, 1)"
              rx="2"
              :fill="item.fill || '#fff3a3'"
            />
            <text
              v-for="(line, li) in noteLines(item)"
              :key="li"
              x="6"
              :y="line.y"
              :font-size="line.size"
              fill="#1f2933"
              opacity="0.75"
            >{{ line.text }}</text>
          </template>

          <text
            v-else-if="item.type === 'text'"
            :y="Math.max(item.h * 0.75, 8)"
            :font-size="Math.max(item.h * 0.82, 7)"
            :fill="item.color || 'currentColor'"
          >{{ (item.label || '').split('\n')[0].slice(0, 32) }}</text>

          <!-- Formulas, calculators, graphs and images: a labelled block is
               more legible at this size than a shrunken render would be. -->
          <template v-else-if="isCard(item.type)">
            <rect
              :width="Math.max(item.w, 1)"
              :height="Math.max(item.h, 1)"
              rx="3"
              class="card"
            />
            <text
              :x="Math.max(item.w, 1) / 2"
              :y="Math.max(item.h, 1) / 2"
              text-anchor="middle"
              dominant-baseline="central"
              :font-size="Math.min(item.h * 0.4, item.w * 0.22, 22)"
              class="card-glyph"
            >{{ { math: '∑', calc: '=', plot: '⌐', image: '▣' }[item.type] }}</text>
          </template>
        </g>
      </g>
    </svg>

    <div v-else-if="loading" class="state">
      <span class="spinner" />
    </div>
    <div v-else-if="isEmpty" class="state empty">Empty board</div>

    <span v-if="preview && preview.shown < preview.count" class="truncated">
      showing {{ preview.shown }} of {{ preview.count }}
    </span>
  </div>
</template>

<style scoped>
.preview {
  position: relative;
  background: var(--canvas);
  border-radius: 7px;
  overflow: hidden;
  color: var(--muted);
}
svg {
  display: block;
}
.card {
  fill: var(--chip);
  stroke: var(--border);
  stroke-width: 1;
}
.card-glyph {
  fill: var(--faint);
  font-family: var(--mono);
}
.state {
  position: absolute;
  inset: 0;
  display: grid;
  place-items: center;
  font-size: 11px;
  color: var(--faint);
}
.spinner {
  width: 14px;
  height: 14px;
  border: 2px solid var(--border);
  border-top-color: var(--muted);
  border-radius: 50%;
  animation: spin 0.7s linear infinite;
}
@keyframes spin {
  to { transform: rotate(360deg); }
}
.truncated {
  position: absolute;
  right: 5px;
  bottom: 4px;
  font-size: 9px;
  color: var(--faint);
  background: color-mix(in srgb, var(--panel) 82%, transparent);
  border-radius: 3px;
  padding: 1px 4px;
}
</style>
