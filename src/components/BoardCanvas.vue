<script setup>
import { computed, onBeforeUnmount, onMounted, ref, shallowRef } from 'vue'
import VectorItem from './VectorItem.vue'
import HtmlItem from './HtmlItem.vue'
import { createDefaults, markerData, AUTO_SIZED_TYPES } from '../lib/factory.js'
import { normalizeRect, pointsBounds, rectsIntersect, simplifyPath } from '../lib/geometry.js'
import { VECTOR_TYPES } from '../lib/constants.js'
import {
  addItem,
  board,
  clearSelection,
  commitSnapshot,
  editingId,
  items,
  patchItem,
  patchItemQuiet,
  persistItem,
  recordChanges,
  removeItemsQuiet,
  screenToWorld,
  select,
  selection,
  selectionBounds,
  selectionSet,
  setTool,
  snapshot,
  sortedItems,
  style,
  tool,
  viewport,
  viewportSize,
  worldToScreen,
  zoomAt
} from '../stores/board.js'

const emit = defineEmits(['context-menu'])

const surface = ref(null)
const spaceDown = ref(false)
const marquee = shallowRef(null) // screen-space rect while box-selecting
const hoverId = ref(null)

/** The in-flight gesture. Null when the pointer is up. */
let gesture = null
/** Mirrors `gesture.mode` so the template can react to it. */
const activeMode = ref(null)

function beginGesture (next) {
  gesture = next
  activeMode.value = next?.mode ?? null
}

function endGesture () {
  const finished = gesture
  gesture = null
  activeMode.value = null
  return finished
}

/* ------------------------------------------------------------ viewport -- */

let resizeObserver = null

onMounted(() => {
  resizeObserver = new ResizeObserver(([entry]) => {
    viewportSize.w = entry.contentRect.width
    viewportSize.h = entry.contentRect.height
  })
  resizeObserver.observe(surface.value)
  window.addEventListener('keydown', onSpaceKey)
  window.addEventListener('keyup', onSpaceKey)
})

onBeforeUnmount(() => {
  resizeObserver?.disconnect()
  window.removeEventListener('keydown', onSpaceKey)
  window.removeEventListener('keyup', onSpaceKey)
})

function onSpaceKey (event) {
  if (event.code !== 'Space') return
  const typing = /^(INPUT|TEXTAREA)$/.test(document.activeElement?.tagName || '')
  if (typing) return
  if (event.type === 'keydown') {
    spaceDown.value = true
    event.preventDefault()
  } else {
    spaceDown.value = false
  }
}

const layerStyle = computed(() => ({
  transform: `translate(${viewport.x}px, ${viewport.y}px) scale(${viewport.k})`
}))

const backgroundStyle = computed(() => {
  const kind = board.value?.background || 'dots'
  if (kind === 'blank') return { backgroundImage: 'none' }
  const size = 24 * viewport.k
  const ox = viewport.x % size
  const oy = viewport.y % size
  if (kind === 'grid') {
    return {
      backgroundImage:
        'linear-gradient(to right, var(--grid) 1px, transparent 1px), linear-gradient(to bottom, var(--grid) 1px, transparent 1px)',
      backgroundSize: `${size}px ${size}px`,
      backgroundPosition: `${ox}px ${oy}px`
    }
  }
  if (kind === 'lines') {
    return {
      backgroundImage: 'linear-gradient(to bottom, var(--grid) 1px, transparent 1px)',
      backgroundSize: `${size}px ${size}px`,
      backgroundPosition: `${ox}px ${oy}px`
    }
  }
  return {
    backgroundImage: `radial-gradient(circle, var(--grid) ${Math.max(1, viewport.k)}px, transparent ${Math.max(1, viewport.k)}px)`,
    backgroundSize: `${size}px ${size}px`,
    backgroundPosition: `${ox}px ${oy}px`
  }
})

const cursor = computed(() => {
  if (spaceDown.value || activeMode.value === 'pan') return 'grabbing'
  switch (tool.value) {
    case 'hand': return 'grab'
    case 'pen':
    case 'marker': return 'crosshair'
    case 'eraser': return 'cell'
    case 'select': return 'default'
    default: return 'crosshair'
  }
})

/* ------------------------------------------------------------ geometry -- */

function pointerToWorld (event) {
  const rect = surface.value.getBoundingClientRect()
  return screenToWorld(event.clientX - rect.left, event.clientY - rect.top)
}

function pointerToScreen (event) {
  const rect = surface.value.getBoundingClientRect()
  return { x: event.clientX - rect.left, y: event.clientY - rect.top }
}

function itemIdAt (event) {
  const el = event.target?.closest?.('[data-item-id]')
  return el ? el.getAttribute('data-item-id') : null
}

/** Everything under the cursor — used by the eraser, which sweeps. */
function itemIdsUnder (clientX, clientY) {
  const ids = new Set()
  for (const el of document.elementsFromPoint(clientX, clientY)) {
    const host = el.closest?.('[data-item-id]')
    if (host) ids.add(host.getAttribute('data-item-id'))
  }
  return [...ids]
}

/* -------------------------------------------------------- selection box -- */

const selectionRect = computed(() => {
  const b = selectionBounds.value
  if (!b) return null
  const p = worldToScreen(b.x, b.y)
  return { x: p.x, y: p.y, w: b.w * viewport.k, h: b.h * viewport.k }
})

const showHandles = computed(
  () => selectionRect.value && !editingId.value && tool.value === 'select' && !activeMode.value
)

/** Per-item outlines, skipping anything deleted mid-gesture. */
const selectedOutlines = computed(() =>
  selection.value
    .map((id) => items[id])
    .filter(Boolean)
    .map((it) => {
      const p = worldToScreen(it.x, it.y)
      return { id: it.id, x: p.x, y: p.y, w: it.w * viewport.k, h: it.h * viewport.k }
    })
)

const HANDLES = [
  { id: 'nw', fx: 0, fy: 0, cursor: 'nwse-resize' },
  { id: 'n', fx: 0.5, fy: 0, cursor: 'ns-resize' },
  { id: 'ne', fx: 1, fy: 0, cursor: 'nesw-resize' },
  { id: 'e', fx: 1, fy: 0.5, cursor: 'ew-resize' },
  { id: 'se', fx: 1, fy: 1, cursor: 'nwse-resize' },
  { id: 's', fx: 0.5, fy: 1, cursor: 'ns-resize' },
  { id: 'sw', fx: 0, fy: 1, cursor: 'nesw-resize' },
  { id: 'w', fx: 0, fy: 0.5, cursor: 'ew-resize' }
]

const handlePositions = computed(() => {
  const r = selectionRect.value
  if (!r) return []
  return HANDLES.map((h) => ({ ...h, x: r.x + r.w * h.fx, y: r.y + r.h * h.fy }))
})

/* ------------------------------------------------------------- pointer -- */

function onPointerDown (event) {
  if (event.button === 2) return // right-click opens the context menu instead
  const target = event.currentTarget
  target.setPointerCapture?.(event.pointerId)

  const world = pointerToWorld(event)
  const screen = pointerToScreen(event)

  // Middle mouse, space bar, or the hand tool: pan regardless of the active tool.
  if (event.button === 1 || spaceDown.value || tool.value === 'hand') {
    beginGesture({ mode: 'pan', startX: event.clientX, startY: event.clientY, vx: viewport.x, vy: viewport.y })
    return
  }

  if (tool.value === 'eraser') {
    beginGesture({ mode: 'erase', changes: [] })
    eraseAt(event)
    return
  }

  if (tool.value === 'pen' || tool.value === 'marker') {
    startStroke(world)
    return
  }

  if (['rect', 'ellipse', 'diamond', 'line', 'arrow'].includes(tool.value)) {
    startShape(world)
    return
  }

  if (['sticky', 'text', 'math', 'calc', 'plot'].includes(tool.value)) {
    const item = addItem(createDefaults(tool.value, world, style))
    setTool('select')
    if (['sticky', 'text', 'math', 'calc'].includes(item.type)) editingId.value = item.id
    endGesture()
    return
  }

  // --- select tool -------------------------------------------------------
  const hitId = itemIdAt(event)

  if (hitId) {
    if (event.shiftKey) {
      select(hitId, true)
    } else if (!selectionSet.value.has(hitId)) {
      select(hitId)
    }
    if (editingId.value && editingId.value !== hitId) editingId.value = null

    const ids = selectionSet.value.has(hitId) ? [...selection.value] : [hitId]
    beginGesture({
      mode: 'move',
      ids,
      startWorld: world,
      origins: ids.map((id) => ({ id, x: items[id].x, y: items[id].y })),
      before: snapshot(ids),
      moved: false
    })
    return
  }

  editingId.value = null
  if (!event.shiftKey) clearSelection()
  beginGesture({ mode: 'marquee', origin: screen, additive: event.shiftKey, base: [...selection.value] })
  marquee.value = { x: screen.x, y: screen.y, w: 0, h: 0 }
}

function onPointerMove (event) {
  if (!gesture) {
    if (tool.value === 'select') hoverId.value = itemIdAt(event)
    return
  }

  switch (gesture.mode) {
    case 'pan': {
      viewport.x = gesture.vx + (event.clientX - gesture.startX)
      viewport.y = gesture.vy + (event.clientY - gesture.startY)
      break
    }

    case 'erase':
      eraseAt(event)
      break

    case 'draw': {
      const world = pointerToWorld(event)
      const last = gesture.points[gesture.points.length - 1]
      // Skip sub-pixel jitter; it bloats the stroke without changing its shape.
      const minStep = 1.2 / viewport.k
      if (Math.hypot(world.x - last[0], world.y - last[1]) < minStep) break
      gesture.points.push([world.x, world.y])
      applyStroke(gesture)
      break
    }

    case 'shape': {
      const world = pointerToWorld(event)
      applyShape(gesture, world, event.shiftKey)
      break
    }

    case 'move': {
      const world = pointerToWorld(event)
      let dx = world.x - gesture.startWorld.x
      let dy = world.y - gesture.startWorld.y
      if (event.shiftKey) {
        // Lock to the dominant axis, the way every design tool does.
        if (Math.abs(dx) > Math.abs(dy)) dy = 0
        else dx = 0
      }
      if (Math.abs(dx) > 0.01 || Math.abs(dy) > 0.01) gesture.moved = true
      for (const origin of gesture.origins) {
        patchItem(origin.id, { x: origin.x + dx, y: origin.y + dy })
      }
      break
    }

    case 'resize': {
      applyResize(gesture, pointerToWorld(event), event.shiftKey, event.altKey)
      break
    }

    case 'marquee': {
      const screen = pointerToScreen(event)
      const rect = normalizeRect(gesture.origin.x, gesture.origin.y, screen.x, screen.y)
      marquee.value = rect
      const tl = screenToWorld(rect.x, rect.y)
      const br = screenToWorld(rect.x + rect.w, rect.y + rect.h)
      const worldRect = { x: tl.x, y: tl.y, w: br.x - tl.x, h: br.y - tl.y }
      const hits = sortedItems.value
        .filter((it) => rectsIntersect(worldRect, it))
        .map((it) => it.id)
      selection.value = gesture.additive ? [...new Set([...gesture.base, ...hits])] : hits
      break
    }
  }
}

function onPointerUp (event) {
  event.currentTarget.releasePointerCapture?.(event.pointerId)
  const g = endGesture()
  marquee.value = null
  if (!g) return

  switch (g.mode) {
    case 'draw':
      finishStroke(g)
      break

    case 'shape':
      finishShape(g)
      break

    case 'move':
      if (g.moved) commitSnapshot(g.before)
      break

    case 'resize':
      commitSnapshot(g.before)
      break

    case 'erase':
      if (g.changes.length) recordChanges(g.changes)
      break
  }
}

function onPointerLeave (event) {
  if (gesture) onPointerUp(event)
  hoverId.value = null
}

/* --------------------------------------------------------------- tools -- */

function startStroke (world) {
  const isMarker = tool.value === 'marker'
  const item = addItem(
    {
      type: 'path',
      x: world.x,
      y: world.y,
      w: 0,
      h: 0,
      data: isMarker ? markerData(style) : createDefaults('path', world, style).data
    },
    { select: false, record: false }
  )
  beginGesture({ mode: 'draw', id: item.id, points: [[world.x, world.y]] })
  applyStroke(gesture)
}

/** Re-origin the stroke on every sample so its box always hugs the ink. */
function applyStroke (g) {
  const b = pointsBounds(g.points)
  patchItem(g.id, {
    x: b.x,
    y: b.y,
    w: b.w,
    h: b.h,
    data: { points: g.points.map(([x, y]) => [round(x - b.x), round(y - b.y)]) }
  })
}

function finishStroke (g) {
  const item = items[g.id]
  if (!item) return
  // A tap with no movement is a dot, not a stroke worth keeping as a path.
  if (g.points.length < 2 && item.w < 1 && item.h < 1) {
    removeItemsQuiet([g.id])
    return
  }
  const simplified = simplifyPath(item.data.points, 0.8 / viewport.k)
  const b = pointsBounds(simplified)
  patchItemQuiet(g.id, {
    x: item.x + b.x,
    y: item.y + b.y,
    w: b.w,
    h: b.h,
    data: { points: simplified.map(([x, y]) => [round(x - b.x), round(y - b.y)]) }
  })
  recordChanges([{ id: g.id, before: null, after: JSON.parse(JSON.stringify(items[g.id])) }])
}

function startShape (world) {
  const defaults = createDefaults(tool.value, world, style)
  const item = addItem({ ...defaults, w: 0, h: 0 }, { select: false, record: false })
  beginGesture({ mode: 'shape', id: item.id, type: tool.value, start: world })
}

function applyShape (g, world, constrain) {
  if (g.type === 'line' || g.type === 'arrow') {
    let end = { ...world }
    if (constrain) {
      // Snap to 15° increments.
      const angle = Math.atan2(end.y - g.start.y, end.x - g.start.x)
      const step = Math.PI / 12
      const snapped = Math.round(angle / step) * step
      const len = Math.hypot(end.x - g.start.x, end.y - g.start.y)
      end = { x: g.start.x + Math.cos(snapped) * len, y: g.start.y + Math.sin(snapped) * len }
    }
    const b = pointsBounds([[g.start.x, g.start.y], [end.x, end.y]])
    patchItem(g.id, {
      x: b.x,
      y: b.y,
      w: b.w,
      h: b.h,
      data: {
        points: [
          [round(g.start.x - b.x), round(g.start.y - b.y)],
          [round(end.x - b.x), round(end.y - b.y)]
        ]
      }
    })
    return
  }

  let rect = normalizeRect(g.start.x, g.start.y, world.x, world.y)
  if (constrain) {
    const size = Math.max(rect.w, rect.h)
    rect = {
      x: world.x < g.start.x ? g.start.x - size : g.start.x,
      y: world.y < g.start.y ? g.start.y - size : g.start.y,
      w: size,
      h: size
    }
  }
  patchItem(g.id, { x: rect.x, y: rect.y, w: round(rect.w), h: round(rect.h) })
}

function finishShape (g) {
  const item = items[g.id]
  if (!item) return
  // A click without a drag: give the shape a usable default size.
  if (item.w < 4 && item.h < 4) {
    if (g.type === 'line' || g.type === 'arrow') {
      patchItem(g.id, { w: 160, h: 0, data: { points: [[0, 0], [160, 0]] } })
    } else {
      patchItem(g.id, { x: item.x - 60, y: item.y - 45, w: 120, h: 90 })
    }
  }
  // The drag itself only touched memory; this is what writes it down.
  const final = persistItem(g.id)
  recordChanges([{ id: g.id, before: null, after: JSON.parse(JSON.stringify(final)) }])
  select(g.id)
  setTool('select')
}

function eraseAt (event) {
  const ids = itemIdsUnder(event.clientX, event.clientY)
  if (!ids.length) return
  const changes = removeItemsQuiet(ids)
  gesture.changes.push(...changes)
}

/* -------------------------------------------------------------- resize -- */

function onHandleDown (event, handle) {
  event.stopPropagation()
  event.preventDefault()
  const b = selectionBounds.value
  if (!b) return
  surface.value.setPointerCapture?.(event.pointerId)
  const ids = [...selection.value]
  beginGesture({
    mode: 'resize',
    handle: handle.id,
    ids,
    origin: b,
    originals: ids.map((id) => ({ ...items[id], data: JSON.parse(JSON.stringify(items[id].data)) })),
    before: snapshot(ids)
  })
}

function applyResize (g, world, uniform, fromCenter) {
  const o = g.origin
  let { x, y, w, h } = o
  const right = o.x + o.w
  const bottom = o.y + o.h

  if (g.handle.includes('e')) w = world.x - o.x
  if (g.handle.includes('s')) h = world.y - o.y
  if (g.handle.includes('w')) { x = world.x; w = right - world.x }
  if (g.handle.includes('n')) { y = world.y; h = bottom - world.y }

  const MIN = 4
  // Flipping through zero is more confusing than useful here.
  w = Math.max(MIN, w)
  h = Math.max(MIN, h)

  const corner = g.handle.length === 2
  const lockAspect = uniform || (corner && g.ids.length === 1 && items[g.ids[0]]?.type === 'image')
  if (lockAspect && corner && o.w > 0 && o.h > 0) {
    const ratio = Math.max(w / o.w, h / o.h)
    w = o.w * ratio
    h = o.h * ratio
    if (g.handle.includes('w')) x = right - w
    if (g.handle.includes('n')) y = bottom - h
  }

  if (fromCenter) {
    const cx = o.x + o.w / 2
    const cy = o.y + o.h / 2
    x = cx - w / 2
    y = cy - h / 2
  }

  const sx = o.w > 0 ? w / o.w : 1
  const sy = o.h > 0 ? h / o.h : 1

  for (const original of g.originals) {
    const nx = x + (original.x - o.x) * sx
    const ny = y + (original.y - o.y) * sy

    if (AUTO_SIZED_TYPES.has(original.type)) {
      // Text and formulas have no box of their own; scale their type size.
      const scale = Math.sqrt(Math.abs(sx * sy)) || 1
      patchItem(original.id, {
        x: nx,
        y: ny,
        data: { fontSize: Math.max(6, Math.round((original.data.fontSize || 20) * scale)) }
      })
      continue
    }

    const patch = { x: nx, y: ny, w: Math.max(1, original.w * sx), h: Math.max(1, original.h * sy) }
    if (original.data.points) {
      patch.data = {
        points: original.data.points.map(([px, py]) => [round(px * sx), round(py * sy)])
      }
    }
    patchItem(original.id, patch)
  }
}

/* --------------------------------------------------------------- wheel -- */

function onWheel (event) {
  event.preventDefault()
  const screen = pointerToScreen(event)
  const scale = event.deltaMode === 1 ? 16 : 1

  if (event.ctrlKey || event.metaKey) {
    // A trackpad pinch arrives as many small deltas, a mouse wheel as one big
    // one. Clamping per event keeps a single notch to a sane step instead of
    // jumping three-fold, without slowing the pinch down.
    const delta = Math.max(-60, Math.min(60, event.deltaY * scale))
    zoomAt(screen.x, screen.y, Math.exp(-delta * 0.005))
    return
  }

  if (event.shiftKey) {
    viewport.x -= (event.deltaY || event.deltaX) * scale
  } else {
    viewport.x -= event.deltaX * scale
    viewport.y -= event.deltaY * scale
  }
}

/* -------------------------------------------------------- double click -- */

function onDoubleClick (event) {
  const hitId = itemIdAt(event)
  if (hitId) {
    const item = items[hitId]
    if (!item) return
    if (['sticky', 'text', 'math', 'calc', 'plot'].includes(item.type)) {
      select(hitId)
      editingId.value = hitId
    }
    return
  }
  if (tool.value !== 'select') return
  const world = pointerToWorld(event)
  const item = addItem(createDefaults('text', world, style))
  editingId.value = item.id
}

function onContextMenu (event) {
  event.preventDefault()
  const hitId = itemIdAt(event)
  if (hitId && !selectionSet.value.has(hitId)) select(hitId)
  emit('context-menu', {
    x: event.clientX,
    y: event.clientY,
    itemId: hitId,
    world: pointerToWorld(event)
  })
}

const round = (n) => Math.round(n * 100) / 100

defineExpose({ pointerToWorld, surface })
</script>

<template>
  <div
    ref="surface"
    class="canvas"
    :style="[backgroundStyle, { cursor }]"
    @pointerdown="onPointerDown"
    @pointermove="onPointerMove"
    @pointerup="onPointerUp"
    @pointercancel="onPointerUp"
    @pointerleave="onPointerLeave"
    @wheel="onWheel"
    @dblclick="onDoubleClick"
    @contextmenu="onContextMenu"
  >
    <!-- Everything the board contains, in one z-ordered stack -->
    <div class="layer" :style="layerStyle">
      <template v-for="item in sortedItems" :key="item.id">
        <VectorItem
          v-if="VECTOR_TYPES.has(item.type)"
          :item="item"
          :selected="selectionSet.has(item.id)"
          :zoom="viewport.k"
        />
        <HtmlItem
          v-else
          :item="item"
          :selected="selectionSet.has(item.id)"
          :zoom="viewport.k"
        />
      </template>
    </div>

    <!-- Screen-space overlay: outlines and handles keep a constant size -->
    <svg class="overlay" :width="viewportSize.w" :height="viewportSize.h">
      <g v-if="selectionRect && tool === 'select'">
        <rect
          v-for="o in selectedOutlines"
          :key="o.id"
          class="item-outline"
          :x="o.x"
          :y="o.y"
          :width="o.w"
          :height="o.h"
        />
        <rect
          v-if="selection.length > 1"
          class="selection-box"
          :x="selectionRect.x"
          :y="selectionRect.y"
          :width="selectionRect.w"
          :height="selectionRect.h"
        />
      </g>

      <rect
        v-if="hoverId && !selectionSet.has(hoverId) && tool === 'select' && items[hoverId]"
        class="hover-outline"
        :x="worldToScreen(items[hoverId].x, items[hoverId].y).x"
        :y="worldToScreen(items[hoverId].x, items[hoverId].y).y"
        :width="items[hoverId].w * viewport.k"
        :height="items[hoverId].h * viewport.k"
      />

      <rect
        v-if="marquee"
        class="marquee"
        :x="marquee.x"
        :y="marquee.y"
        :width="marquee.w"
        :height="marquee.h"
      />

      <g v-if="showHandles">
        <rect
          v-for="h in handlePositions"
          :key="h.id"
          class="handle"
          :x="h.x - 5"
          :y="h.y - 5"
          width="10"
          height="10"
          rx="2"
          :style="{ cursor: h.cursor }"
          @pointerdown="onHandleDown($event, h)"
        />
      </g>
    </svg>
  </div>
</template>

<style scoped>
.canvas {
  position: absolute;
  inset: 0;
  overflow: hidden;
  background-color: var(--canvas);
  touch-action: none;
  user-select: none;
  contain: layout paint;
}

.layer {
  position: absolute;
  top: 0;
  left: 0;
  transform-origin: 0 0;
  will-change: transform;
}

.overlay {
  position: absolute;
  top: 0;
  left: 0;
  pointer-events: none;
}

.item-outline {
  fill: none;
  stroke: var(--accent);
  stroke-width: 1.5;
}

.selection-box {
  fill: none;
  stroke: var(--accent);
  stroke-width: 1;
  stroke-dasharray: 4 3;
  opacity: 0.7;
}

.hover-outline {
  fill: none;
  stroke: var(--accent);
  stroke-width: 1.5;
  opacity: 0.35;
}

.marquee {
  fill: color-mix(in srgb, var(--accent) 12%, transparent);
  stroke: var(--accent);
  stroke-width: 1;
}

.handle {
  fill: var(--panel);
  stroke: var(--accent);
  stroke-width: 1.5;
  pointer-events: auto;
}
</style>
