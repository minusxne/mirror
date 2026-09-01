<script setup>
import { computed } from 'vue'
import Icon from './Icon.vue'
import { FONT_SIZES, HIGHLIGHTER_COLORS, INK_COLORS, NOTE_COLORS, STROKE_WIDTHS } from '../lib/constants.js'
import {
  bringToFront,
  deleteSelected,
  duplicateSelected,
  selectedItems,
  selection,
  sendToBack,
  style,
  tool,
  updateItems
} from '../stores/board.js'

/**
 * One panel that edits either the current selection or, when nothing is
 * selected, the defaults the next thing you draw will use.
 */
const targets = computed(() => selectedItems.value)
const editingSelection = computed(() => targets.value.length > 0)

const has = (types) => targets.value.some((it) => types.includes(it.type))
const activeToolIs = (ids) => ids.includes(tool.value)

const showInk = computed(() =>
  editingSelection.value
    ? has(['path', 'line', 'arrow', 'rect', 'ellipse', 'diamond', 'text', 'math', 'sticky'])
    : activeToolIs(['pen', 'marker', 'text', 'math', 'rect', 'ellipse', 'diamond', 'line', 'arrow'])
)
const showNoteColor = computed(() =>
  editingSelection.value ? has(['sticky']) : activeToolIs(['sticky'])
)
const showShapeFill = computed(() =>
  editingSelection.value ? has(['rect', 'ellipse', 'diamond']) : activeToolIs(['rect', 'ellipse', 'diamond'])
)
const showStroke = computed(() =>
  editingSelection.value
    ? has(['path', 'line', 'arrow', 'rect', 'ellipse', 'diamond'])
    : activeToolIs(['pen', 'marker', 'rect', 'ellipse', 'diamond', 'line', 'arrow'])
)
const showFont = computed(() =>
  editingSelection.value ? has(['text', 'math', 'sticky']) : activeToolIs(['text', 'math', 'sticky'])
)
const showDash = computed(() =>
  editingSelection.value
    ? has(['line', 'arrow', 'rect', 'ellipse', 'diamond'])
    : activeToolIs(['line', 'arrow', 'rect', 'ellipse', 'diamond'])
)

const inkPalette = computed(() => (tool.value === 'marker' ? HIGHLIGHTER_COLORS : INK_COLORS))

const visible = computed(
  () =>
    editingSelection.value ||
    ['pen', 'marker', 'sticky', 'text', 'math', 'rect', 'ellipse', 'diamond', 'line', 'arrow'].includes(tool.value)
)

/** Read the value shown as "current" — the selection's, or the tool default. */
function currentOf (key, fallback) {
  if (editingSelection.value) {
    const first = targets.value.find((it) => it.data?.[key] !== undefined)
    if (first) return first.data[key]
  }
  return fallback
}

function apply (patchData, styleKey, value) {
  if (styleKey !== undefined) style[styleKey] = value
  if (!editingSelection.value) return
  updateItems([...selection.value], () => ({ data: patchData }))
}

const setColor = (value) => apply({ color: value }, 'color', value)
const setNoteFill = (value) => apply({ fill: value }, 'fill', value)
const setShapeFill = (value) => apply({ fill: value }, 'shapeFill', value)
const setStrokeWidth = (value) => apply({ strokeWidth: value }, 'strokeWidth', value)
const setFontSize = (value) => apply({ fontSize: value }, 'fontSize', value)
const setDash = (value) => apply({ dash: value }, 'dash', value)
</script>

<template>
  <div v-if="visible" class="style-panel">
    <template v-if="showInk">
      <div class="row">
        <span class="label">{{ tool === 'marker' && !editingSelection ? 'Highlight' : 'Colour' }}</span>
        <div class="swatches">
          <button
            v-for="c in inkPalette"
            :key="c.value"
            class="swatch"
            :class="{ on: currentOf('color', style.color) === c.value }"
            :style="{ background: c.value }"
            :title="c.name"
            @click="setColor(c.value)"
          />
        </div>
      </div>
    </template>

    <template v-if="showNoteColor">
      <div class="row">
        <span class="label">Note</span>
        <div class="swatches">
          <button
            v-for="c in NOTE_COLORS"
            :key="c.value"
            class="swatch"
            :class="{ on: currentOf('fill', style.fill) === c.value }"
            :style="{ background: c.value }"
            :title="c.name"
            @click="setNoteFill(c.value)"
          />
        </div>
      </div>
    </template>

    <template v-if="showShapeFill">
      <div class="row">
        <span class="label">Fill</span>
        <div class="swatches">
          <button
            class="swatch none"
            :class="{ on: (currentOf('fill', style.shapeFill) || 'transparent') === 'transparent' }"
            title="No fill"
            @click="setShapeFill('transparent')"
          />
          <button
            v-for="c in NOTE_COLORS"
            :key="c.value"
            class="swatch"
            :class="{ on: currentOf('fill', style.shapeFill) === c.value }"
            :style="{ background: c.value }"
            :title="c.name"
            @click="setShapeFill(c.value)"
          />
        </div>
      </div>
    </template>

    <template v-if="showStroke">
      <div class="row">
        <span class="label">Stroke</span>
        <div class="chips">
          <button
            v-for="w in STROKE_WIDTHS"
            :key="w"
            class="chip stroke-chip"
            :class="{ on: currentOf('strokeWidth', style.strokeWidth) === w }"
            :title="`${w}px`"
            @click="setStrokeWidth(w)"
          >
            <span :style="{ height: `${Math.min(w, 10)}px` }" />
          </button>
        </div>
      </div>
    </template>

    <template v-if="showDash">
      <div class="row">
        <span class="label">Line</span>
        <div class="chips">
          <button
            v-for="d in ['solid', 'dashed', 'dotted']"
            :key="d"
            class="chip text-chip"
            :class="{ on: (currentOf('dash', style.dash) || 'solid') === d }"
            @click="setDash(d)"
          >{{ d }}</button>
        </div>
      </div>
    </template>

    <template v-if="showFont">
      <div class="row">
        <span class="label">Size</span>
        <div class="chips">
          <button
            v-for="s in FONT_SIZES"
            :key="s"
            class="chip text-chip"
            :class="{ on: currentOf('fontSize', style.fontSize) === s }"
            @click="setFontSize(s)"
          >{{ s }}</button>
        </div>
      </div>
    </template>

    <div v-if="editingSelection" class="row actions">
      <span class="label">{{ selection.length }} selected</span>
      <div class="chips">
        <button class="chip icon-chip" title="Duplicate  (Ctrl+D)" @click="duplicateSelected()">
          <Icon name="copy" :size="15" />
        </button>
        <button class="chip icon-chip" title="Bring to front  (])" @click="bringToFront()">
          <Icon name="front" :size="15" />
        </button>
        <button class="chip icon-chip" title="Send to back  ([)" @click="sendToBack()">
          <Icon name="back" :size="15" />
        </button>
        <button class="chip icon-chip danger" title="Delete  (Del)" @click="deleteSelected()">
          <Icon name="trash" :size="15" />
        </button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.style-panel {
  position: absolute;
  left: 66px;
  top: 50%;
  transform: translateY(-50%);
  width: 218px;
  padding: 10px;
  display: flex;
  flex-direction: column;
  gap: 10px;
  background: var(--panel);
  border: 1px solid var(--border);
  border-radius: 12px;
  box-shadow: var(--shadow-lg);
  z-index: 19;
  max-height: calc(100vh - 140px);
  overflow-y: auto;
}

.row {
  display: flex;
  flex-direction: column;
  gap: 5px;
}
.label {
  font-size: 10px;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  color: var(--faint);
  font-weight: 600;
}

.swatches {
  display: grid;
  grid-template-columns: repeat(6, 1fr);
  gap: 5px;
}
.swatch {
  width: 100%;
  aspect-ratio: 1;
  border-radius: 5px;
  border: 1px solid rgba(15, 23, 42, 0.16);
  cursor: pointer;
  padding: 0;
}
.swatch.on {
  outline: 2px solid var(--accent);
  outline-offset: 1px;
}
.swatch.none {
  background: repeating-linear-gradient(45deg, transparent, transparent 3px, var(--border) 3px, var(--border) 4px);
}

.chips {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
}
.chip {
  border: 1px solid var(--border);
  background: var(--panel);
  color: var(--muted);
  border-radius: 6px;
  cursor: pointer;
  padding: 3px 7px;
  font-size: 11px;
  line-height: 1.4;
  display: grid;
  place-items: center;
}
.chip:hover {
  color: var(--text);
  border-color: var(--muted);
}
.chip.on {
  color: var(--accent);
  border-color: var(--accent);
  background: var(--accent-soft);
}
.stroke-chip {
  width: 30px;
  height: 24px;
}
.stroke-chip span {
  display: block;
  width: 16px;
  background: currentColor;
  border-radius: 6px;
}
.text-chip {
  min-width: 28px;
}
.icon-chip {
  width: 28px;
  height: 26px;
}
.icon-chip.danger:hover {
  color: #e5484d;
  border-color: #e5484d;
}
.actions .label {
  color: var(--muted);
}
</style>
