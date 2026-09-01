<script setup>
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import MathBlock from './MathBlock.vue'
import FunctionPlot from './FunctionPlot.vue'
import { calculateSheet } from '../lib/qalc/index.js'
import { editingId, patchItem, patchItemQuiet, updateItem } from '../stores/board.js'

const props = defineProps({
  item: { type: Object, required: true },
  selected: { type: Boolean, default: false },
  zoom: { type: Number, default: 1 }
})

const d = computed(() => props.item.data || {})
const editing = computed(() => editingId.value === props.item.id)

const root = ref(null)
const measure = ref(null)
const editor = ref(null)

/* --------------------------------------------------------------- layout -- */

const AUTO_SIZED = new Set(['text', 'math'])

const boxStyle = computed(() => {
  const s = {
    transform: `translate(${props.item.x}px, ${props.item.y}px)`,
    zIndex: props.item.z
  }
  if (!AUTO_SIZED.has(props.item.type)) {
    s.width = `${props.item.w}px`
    s.height = `${props.item.h}px`
  }
  return s
})

/**
 * Text and formula blocks size themselves to their content. Measuring after
 * paint and writing the result back keeps selection outlines and hit-testing
 * honest without forcing the user to resize anything by hand.
 */
let observer = null
function syncMeasuredSize () {
  if (!AUTO_SIZED.has(props.item.type) || !measure.value) return
  const rect = measure.value.getBoundingClientRect()
  const w = rect.width / props.zoom
  const h = rect.height / props.zoom
  if (!w || !h) return
  if (Math.abs(w - props.item.w) > 0.6 || Math.abs(h - props.item.h) > 0.6) {
    patchItemQuiet(props.item.id, { w, h })
  }
}

onMounted(() => {
  if (AUTO_SIZED.has(props.item.type)) {
    observer = new ResizeObserver(() => requestAnimationFrame(syncMeasuredSize))
    if (measure.value) observer.observe(measure.value)
    nextTick(syncMeasuredSize)
  }
})

onBeforeUnmount(() => observer?.disconnect())

/* -------------------------------------------------------------- editing -- */

watch(editing, async (on) => {
  if (!on) return
  await nextTick()
  const el = editor.value
  if (!el) return
  el.focus()
  if (d.value.justCreated) el.select?.()
})

function commitText (value) {
  const patch = { data: { text: value } }
  if (d.value.justCreated) patch.data.justCreated = false
  updateItem(props.item.id, patch)
}

function commitLatex (value) {
  updateItem(props.item.id, { data: { latex: value, justCreated: false } })
}

// Calculator/plot editing is continuous; write straight through and let the
// store's debounce coalesce it into one database round trip.
function liveData (patch) {
  patchItemQuiet(props.item.id, { data: patch })
}

function stopEditing () {
  editingId.value = null
}

/** Enter inserts a newline; Escape leaves the editor. */
function onEditorKeydown (event) {
  if (event.key === 'Escape') {
    event.preventDefault()
    event.stopPropagation()
    stopEditing()
  }
  // Let normal typing through without the canvas shortcuts seeing it.
  event.stopPropagation()
}

/* ------------------------------------------------------------ sticky -- */

const stickyFont = computed(() => {
  const explicit = d.value.fontSize
  if (explicit) return explicit
  // Scale down long notes so they keep fitting, like a real sticky.
  const len = (d.value.text || '').length
  if (len > 420) return 12
  if (len > 240) return 14
  if (len > 120) return 16
  return 18
})

// Grow a note downwards when the text no longer fits.
function growStickyIfNeeded () {
  const el = measure.value
  if (!el || props.item.type !== 'sticky') return
  const needed = el.scrollHeight / props.zoom
  if (needed > props.item.h - 4) {
    patchItemQuiet(props.item.id, { h: Math.ceil(needed + 16) })
  }
}
watch(() => d.value.text, () => nextTick(growStickyIfNeeded))

/* --------------------------------------------------------- calculator -- */

const calcRows = computed(() => {
  if (props.item.type !== 'calc') return []
  return calculateSheet(d.value.source ?? '', {
    angleUnit: d.value.degrees ? 'deg' : 'rad'
  })
})

const calcTotalLines = computed(() => calcRows.value.length)

function setCalcSource (value) {
  liveData({ source: value })
}

function toggleDegrees () {
  updateItem(props.item.id, { data: { degrees: !d.value.degrees } })
}

/* --------------------------------------------------------------- plot -- */

const plotExpressions = computed(() => d.value.expressions || ['x^2'])

function setPlotExpression (index, value) {
  const next = [...plotExpressions.value]
  next[index] = value
  liveData({ expressions: next })
}

function addPlotExpression () {
  updateItem(props.item.id, { data: { expressions: [...plotExpressions.value, ''] } })
}

function removePlotExpression (index) {
  const next = plotExpressions.value.filter((_, i) => i !== index)
  updateItem(props.item.id, { data: { expressions: next.length ? next : [''] } })
}

function nudgeRange (factor) {
  const cx = ((d.value.xmin ?? -10) + (d.value.xmax ?? 10)) / 2
  const cy = ((d.value.ymin ?? -6) + (d.value.ymax ?? 6)) / 2
  const hx = (((d.value.xmax ?? 10) - (d.value.xmin ?? -10)) / 2) * factor
  const hy = (((d.value.ymax ?? 6) - (d.value.ymin ?? -6)) / 2) * factor
  updateItem(props.item.id, {
    data: {
      xmin: Number((cx - hx).toPrecision(6)),
      xmax: Number((cx + hx).toPrecision(6)),
      ymin: Number((cy - hy).toPrecision(6)),
      ymax: Number((cy + hy).toPrecision(6))
    }
  })
}

const plotSize = computed(() => ({
  width: Math.max(80, props.item.w - 2),
  height: Math.max(60, props.item.h - (editing.value ? 34 + plotExpressions.value.length * 26 : 26))
}))
</script>

<template>
  <div
    ref="root"
    class="html-item"
    :class="[`type-${item.type}`, { selected, editing }]"
    :style="boxStyle"
    :data-item-id="item.id"
  >
    <!-- ------------------------------------------------------- sticky -- -->
    <template v-if="item.type === 'sticky'">
      <div
        class="sticky"
        :style="{
          background: d.fill || '#fff3a3',
          color: d.color || '#1f2933',
          fontSize: `${stickyFont}px`,
          textAlign: d.align || 'left'
        }"
      >
        <textarea
          v-if="editing"
          ref="editor"
          class="editor sticky-editor"
          :value="d.text || ''"
          spellcheck="false"
          @input="liveData({ text: $event.target.value })"
          @change="commitText($event.target.value)"
          @blur="commitText($event.target.value); stopEditing()"
          @keydown="onEditorKeydown"
          @pointerdown.stop
        />
        <div v-else ref="measure" class="sticky-text">{{ d.text || '' }}</div>
      </div>
    </template>

    <!-- --------------------------------------------------------- text -- -->
    <template v-else-if="item.type === 'text'">
      <div
        class="text-wrap"
        :style="{
          color: d.color || '#1f2933',
          fontSize: `${d.fontSize || 20}px`,
          fontWeight: d.bold ? 700 : 400,
          fontStyle: d.italic ? 'italic' : 'normal',
          textAlign: d.align || 'left'
        }"
      >
        <textarea
          v-if="editing"
          ref="editor"
          class="editor text-editor"
          :value="d.text || ''"
          spellcheck="false"
          :style="{ width: `${Math.max(item.w, 60)}px`, height: `${Math.max(item.h, 24)}px` }"
          @input="liveData({ text: $event.target.value })"
          @blur="commitText($event.target.value); stopEditing()"
          @keydown="onEditorKeydown"
          @pointerdown.stop
        />
        <div v-else ref="measure" class="text-body">{{ d.text || 'Text' }}</div>
      </div>
    </template>

    <!-- ------------------------------------------------------ formula -- -->
    <template v-else-if="item.type === 'math'">
      <div class="math-wrap" :style="{ fontSize: `${d.fontSize || 20}px`, color: d.color || '#1f2933' }">
        <div ref="measure" class="math-measure">
          <MathBlock :latex="d.latex || ''" :display="d.display !== false" />
        </div>
        <div v-if="editing" class="latex-editor" @pointerdown.stop>
          <textarea
            ref="editor"
            class="editor"
            :value="d.latex || ''"
            spellcheck="false"
            placeholder="\int_0^1 x^2 \,\mathrm{d}x = \frac{1}{3}"
            @input="liveData({ latex: $event.target.value })"
            @blur="commitLatex($event.target.value); stopEditing()"
            @keydown="onEditorKeydown"
          />
          <div class="latex-hint">
            LaTeX · <code>\frac{}{}</code> <code>\sqrt{}</code> <code>\int</code> <code>\sum</code>
            <code>x^2</code> <code>\alpha</code> · Esc to finish
          </div>
        </div>
      </div>
    </template>

    <!-- --------------------------------------------------- calculator -- -->
    <template v-else-if="item.type === 'calc'">
      <div class="calc" :class="{ interactive: editing }">
        <header class="calc-head">
          <span class="calc-title">Working</span>
          <button
            class="calc-mode"
            :class="{ on: d.degrees }"
            title="Toggle degrees / radians for trig"
            @pointerdown.stop
            @click.stop="toggleDegrees"
          >{{ d.degrees ? 'DEG' : 'RAD' }}</button>
        </header>
        <div class="calc-body">
          <textarea
            v-if="editing"
            ref="editor"
            class="editor calc-input"
            :value="d.source || ''"
            spellcheck="false"
            placeholder="r = 4&#10;area = pi r^2&#10;area / 2"
            @input="setCalcSource($event.target.value)"
            @blur="stopEditing"
            @keydown="onEditorKeydown"
            @pointerdown.stop
          />
          <div v-else class="calc-source">
            <div v-for="(row, i) in calcRows" :key="i" class="calc-line">{{ row.text || ' ' }}</div>
            <div v-if="!calcTotalLines" class="calc-empty">Double-click to start working</div>
          </div>
          <div class="calc-results">
            <div v-for="(row, i) in calcRows" :key="i" class="calc-line" :class="row.kind">
              <span v-if="row.kind === 'value'">{{ formatNumber(row.value) }}</span>
              <span v-else-if="row.kind === 'assign'" class="assign">= {{ formatNumber(row.value) }}</span>
              <span v-else-if="row.kind === 'error'" class="err" :title="row.error">!</span>
              <span v-else>&nbsp;</span>
            </div>
          </div>
        </div>
      </div>
    </template>

    <!-- --------------------------------------------------------- plot -- -->
    <template v-else-if="item.type === 'plot'">
      <div class="plot-card">
        <FunctionPlot
          :expressions="plotExpressions"
          :xmin="d.xmin ?? -10"
          :xmax="d.xmax ?? 10"
          :ymin="d.ymin ?? -6"
          :ymax="d.ymax ?? 6"
          :degrees="!!d.degrees"
          :width="plotSize.width"
          :height="plotSize.height"
        />
        <div v-if="editing" class="plot-controls" @pointerdown.stop>
          <div v-for="(expr, i) in plotExpressions" :key="i" class="plot-row">
            <span class="plot-y">y =</span>
            <input
              :ref="i === 0 ? (el) => (editor = el) : undefined"
              class="editor plot-input"
              :value="expr"
              spellcheck="false"
              placeholder="sin(x)/x"
              @input="setPlotExpression(i, $event.target.value)"
              @keydown="onEditorKeydown"
            />
            <button
              v-if="plotExpressions.length > 1"
              class="plot-btn"
              title="Remove"
              @click.stop="removePlotExpression(i)"
            >−</button>
          </div>
          <div class="plot-row plot-actions">
            <button class="plot-btn" title="Add another curve" @click.stop="addPlotExpression">+ curve</button>
            <button class="plot-btn" title="Zoom out" @click.stop="nudgeRange(1.6)">−</button>
            <button class="plot-btn" title="Zoom in" @click.stop="nudgeRange(1 / 1.6)">+</button>
            <button class="plot-btn" :class="{ on: d.degrees }" @click.stop="toggleDegrees">
              {{ d.degrees ? 'DEG' : 'RAD' }}
            </button>
            <button class="plot-btn" @click.stop="stopEditing">done</button>
          </div>
        </div>
        <div v-else class="plot-caption">{{ plotExpressions.filter(Boolean).map(e => `y = ${e}`).join('   ') }}</div>
      </div>
    </template>

    <!-- -------------------------------------------------------- image -- -->
    <template v-else-if="item.type === 'image'">
      <img
        class="image"
        :src="d.src"
        :alt="d.alt || 'pasted image'"
        draggable="false"
        :style="{ borderRadius: `${d.radius ?? 4}px` }"
      />
    </template>
  </div>
</template>

<style scoped>
.html-item {
  position: absolute;
  top: 0;
  left: 0;
  transform-origin: 0 0;
  box-sizing: border-box;
}

.type-text,
.type-math {
  width: max-content;
  height: max-content;
}

/* ------------------------------------------------------------- sticky -- */
.sticky {
  width: 100%;
  height: 100%;
  border-radius: 4px;
  padding: 12px 14px;
  box-shadow: 0 1px 2px rgba(15, 23, 42, 0.16), 0 8px 16px -10px rgba(15, 23, 42, 0.35);
  overflow: hidden;
  line-height: 1.35;
  box-sizing: border-box;
  cursor: inherit;
}
.sticky-text {
  white-space: pre-wrap;
  word-break: break-word;
  width: 100%;
  height: 100%;
  overflow: hidden;
}
.sticky-editor {
  line-height: 1.35;
  color: inherit;
  text-align: inherit;
}

/* --------------------------------------------------------------- text -- */
.text-wrap {
  line-height: 1.3;
  min-width: 24px;
}
.text-body {
  white-space: pre-wrap;
  word-break: break-word;
  max-width: 720px;
  min-width: 24px;
  padding: 2px 3px;
}
.text-editor {
  padding: 2px 3px;
  line-height: 1.3;
  color: inherit;
  min-width: 60px;
  resize: none;
}

/* ------------------------------------------------------------ formula -- */
.math-wrap {
  position: relative;
  padding: 6px 8px;
}
.math-measure {
  display: inline-block;
}
.latex-editor {
  position: absolute;
  top: calc(100% + 8px);
  left: 0;
  width: 380px;
  background: var(--panel);
  border: 1px solid var(--border);
  border-radius: 10px;
  box-shadow: var(--shadow-lg);
  padding: 8px;
  z-index: 50;
}
.latex-editor .editor {
  width: 100%;
  height: 76px;
  font-family: var(--mono);
  font-size: 13px;
  color: var(--text);
  resize: vertical;
}
.latex-hint {
  margin-top: 6px;
  font-size: 11px;
  color: var(--muted);
}
.latex-hint code {
  font-family: var(--mono);
  background: var(--chip);
  border-radius: 3px;
  padding: 0 3px;
  margin-right: 2px;
}

/* --------------------------------------------------------- calculator -- */
.calc {
  width: 100%;
  height: 100%;
  display: flex;
  flex-direction: column;
  background: var(--panel);
  border: 1px solid var(--border);
  border-radius: 10px;
  box-shadow: var(--shadow-md);
  overflow: hidden;
  font-family: var(--mono);
  font-size: 13px;
}
.calc-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 5px 8px;
  border-bottom: 1px solid var(--border);
  background: var(--chip);
  flex: none;
}
.calc-title {
  font-size: 11px;
  letter-spacing: 0.04em;
  text-transform: uppercase;
  color: var(--muted);
  font-family: var(--sans);
}
.calc-mode {
  font-size: 10px;
  font-family: var(--mono);
  border: 1px solid var(--border);
  background: var(--panel);
  color: var(--muted);
  border-radius: 4px;
  padding: 1px 5px;
  cursor: pointer;
}
.calc-mode.on {
  color: var(--accent);
  border-color: var(--accent);
}
.calc-body {
  flex: 1;
  display: grid;
  grid-template-columns: 1fr auto;
  overflow: auto;
  min-height: 0;
}
.calc-source,
.calc-input {
  padding: 8px 10px;
  line-height: 1.55;
  color: var(--text);
}
.calc-input {
  font-family: var(--mono);
  font-size: 13px;
  resize: none;
  height: 100%;
  width: 100%;
}
.calc-line {
  line-height: 1.55;
  white-space: pre;
  min-height: 1.55em;
}
.calc-results {
  padding: 8px 10px 8px 14px;
  text-align: right;
  border-left: 1px dashed var(--border);
  color: var(--accent);
  min-width: 64px;
}
.calc-results .assign {
  color: var(--muted);
}
.calc-results .err {
  color: #e5484d;
  cursor: help;
}
.calc-empty {
  color: var(--muted);
  font-style: italic;
  font-family: var(--sans);
}

/* --------------------------------------------------------------- plot -- */
.plot-card {
  width: 100%;
  height: 100%;
  background: var(--panel);
  border: 1px solid var(--border);
  border-radius: 10px;
  box-shadow: var(--shadow-md);
  overflow: hidden;
  display: flex;
  flex-direction: column;
}
.plot-caption {
  font-family: var(--mono);
  font-size: 11px;
  color: var(--muted);
  padding: 3px 8px 6px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.plot-controls {
  padding: 4px 6px 6px;
  display: flex;
  flex-direction: column;
  gap: 4px;
}
.plot-row {
  display: flex;
  align-items: center;
  gap: 4px;
}
.plot-y {
  font-family: var(--mono);
  font-size: 12px;
  color: var(--muted);
}
.plot-input {
  flex: 1;
  font-family: var(--mono);
  font-size: 12px;
  border: 1px solid var(--border);
  border-radius: 5px;
  padding: 2px 6px;
  background: var(--bg);
  color: var(--text);
  min-width: 0;
}
.plot-btn {
  font-size: 11px;
  border: 1px solid var(--border);
  background: var(--panel);
  color: var(--muted);
  border-radius: 5px;
  padding: 2px 7px;
  cursor: pointer;
  white-space: nowrap;
}
.plot-btn:hover {
  color: var(--text);
  border-color: var(--muted);
}
.plot-btn.on {
  color: var(--accent);
  border-color: var(--accent);
}
.plot-actions {
  justify-content: flex-end;
}

/* -------------------------------------------------------------- image -- */
.image {
  width: 100%;
  height: 100%;
  object-fit: contain;
  user-select: none;
  -webkit-user-drag: none;
}

/* ------------------------------------------------------------ editors -- */
.editor {
  display: block;
  border: none;
  outline: none;
  background: transparent;
  font-family: inherit;
  font-size: inherit;
  width: 100%;
  height: 100%;
  padding: 0;
  margin: 0;
  overflow: auto;
}
.type-sticky .editor {
  padding: 0;
}
</style>
