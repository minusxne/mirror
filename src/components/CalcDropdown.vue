<script setup>
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import Icon from './Icon.vue'
import { calculate } from '../lib/qalc/index.js'
import { addItem, viewport, viewportSize } from '../stores/board.js'

const emit = defineEmits(['close'])

const input = ref('')
const field = ref(null)
const angleUnit = ref(localStorage.getItem('mirror:calcAngle') === 'deg' ? 'deg' : 'rad')
const history = ref(load())
const historyIndex = ref(-1)

function load () {
  try {
    const raw = JSON.parse(localStorage.getItem('mirror:calcHistory') || '[]')
    return Array.isArray(raw) ? raw.slice(0, 40) : []
  } catch {
    return []
  }
}

const save = () => localStorage.setItem('mirror:calcHistory', JSON.stringify(history.value.slice(0, 40)))

/** Recomputed on every keystroke — this is the "answers while you type" part. */
const result = computed(() => calculate(input.value, {}, { angleUnit: angleUnit.value }))

const hasAnswer = computed(() => result.value.ok && input.value.trim().length > 0)

/**
 * Errors wait for you to stop typing.
 *
 * There is no way to tell "half a word" from "a finished mistake" by parsing
 * alone — `sin 30d` is a real dimensional error and also two keystrokes short
 * of `sin 30deg`. So the answer updates instantly and only the complaint is
 * held back until the input settles.
 */
const settled = ref(false)
let settleTimer = null
watch(input, () => {
  settled.value = false
  clearTimeout(settleTimer)
  settleTimer = setTimeout(() => { settled.value = true }, 450)
})
onBeforeUnmount(() => clearTimeout(settleTimer))

/** The last answer that worked, kept on screen while the next one is typed. */
const lastGood = ref(null)
watch(result, (r) => {
  if (r.ok && input.value.trim()) lastGood.value = { forms: r.forms, approximate: r.approximate }
  else if (!input.value.trim()) lastGood.value = null
}, { immediate: true })

const shown = computed(() => (hasAnswer.value ? result.value : lastGood.value))

/**
 * Only complain once the expression looks finished.
 *
 * Half-typed input is quiet: `sin` on the way to `sin 30deg`, or `1 Ti` on the
 * way to `1 TiB`, would otherwise flash an error at every keystroke. Errors
 * that are about the expression being *wrong* rather than unfinished — adding
 * metres to seconds, say — always show.
 */
const showError = computed(() => {
  const r = result.value
  if (r.ok || r.empty || !settled.value) return false
  const t = input.value.trim()
  if (!t) return false
  if (/[+\-*/^(,]$/.test(t)) return false
  if (r.partial && /[A-Za-z0-9_]$/.test(t)) return false
  const opens = (t.match(/\(/g) || []).length
  const closes = (t.match(/\)/g) || []).length
  return opens <= closes
})

onMounted(async () => {
  await nextTick()
  field.value?.focus()
})

watch(angleUnit, (v) => localStorage.setItem('mirror:calcAngle', v))

function commit () {
  const expression = input.value.trim()
  if (!expression || !result.value.ok) return
  history.value = [{ expression, answer: result.value.text }, ...history.value.filter((h) => h.expression !== expression)].slice(0, 40)
  save()
  historyIndex.value = -1
  input.value = ''
}

function recall (direction) {
  if (!history.value.length) return
  const next = Math.min(history.value.length - 1, Math.max(-1, historyIndex.value + direction))
  historyIndex.value = next
  input.value = next < 0 ? '' : history.value[next].expression
  nextTick(() => field.value?.setSelectionRange(input.value.length, input.value.length))
}

function reuse (entry) {
  input.value = entry.expression
  field.value?.focus()
}

async function copyAnswer () {
  if (!hasAnswer.value) return
  const text = result.value.forms[result.value.forms.length - 1]
  try {
    await navigator.clipboard.writeText(text)
    copied.value = true
    setTimeout(() => { copied.value = false }, 1200)
  } catch { /* clipboard blocked; the number is on screen anyway */ }
}
const copied = ref(false)

/** Drop the working onto the board as a calculator note. */
function sendToBoard () {
  const expression = input.value.trim()
  if (!expression || !result.value.ok) return
  const at = {
    x: (viewportSize.w / 2 - viewport.x) / viewport.k,
    y: (viewportSize.h / 2 - viewport.y) / viewport.k
  }
  addItem({
    type: 'calc',
    x: at.x - 150,
    y: at.y - 60,
    w: 320,
    h: 140,
    data: { source: expression, degrees: angleUnit.value === 'deg' }
  })
  commit()
  emit('close')
}

function clearHistory () {
  history.value = []
  save()
}

const EXAMPLES = [
  'sin 30deg',
  '100 km/h to mph',
  '1/3',
  '5 kWh to MJ',
  '2 m + 30 cm',
  '15% of 240',
  '1 TiB to GB',
  '98.6 degF to degC'
]

function onKeydown (event) {
  event.stopPropagation()
  if (event.key === 'Enter') { event.preventDefault(); event.shiftKey ? sendToBoard() : commit() }
  else if (event.key === 'ArrowUp') { event.preventDefault(); recall(1) }
  else if (event.key === 'ArrowDown') { event.preventDefault(); recall(-1) }
  else if (event.key === 'Escape') { event.preventDefault(); emit('close') }
}
</script>

<template>
  <div class="calc" @pointerdown.stop>
    <div class="field">
      <Icon name="calc" :size="15" class="field-icon" />
      <input
        ref="field"
        v-model="input"
        class="entry"
        type="text"
        spellcheck="false"
        autocomplete="off"
        placeholder="sin 30deg,  100 km/h to mph,  1/3…"
        @keydown="onKeydown"
      />
      <button
        class="angle"
        :class="{ on: angleUnit === 'deg' }"
        title="Default angle unit for bare numbers. Writing 30deg always means degrees."
        @click="angleUnit = angleUnit === 'deg' ? 'rad' : 'deg'"
      >{{ angleUnit === 'deg' ? 'DEG' : 'RAD' }}</button>
    </div>

    <div
      class="answer"
      :class="{ empty: !shown && !showError, error: showError, stale: shown && !hasAnswer }"
    >
      <template v-if="shown && !showError">
        <span class="eq">=</span>
        <span class="forms">
          <template v-for="(form, i) in shown.forms" :key="i">
            <span v-if="i > 0" class="join">{{ shown.approximate ? '≈' : '=' }}</span>
            <span class="form" :class="{ primary: i === shown.forms.length - 1 }">{{ form }}</span>
          </template>
        </span>
        <span class="answer-actions">
          <button class="tiny" :title="copied ? 'Copied' : 'Copy the answer'" @click="copyAnswer">
            <Icon :name="copied ? 'check' : 'copy'" :size="13" />
          </button>
          <button class="tiny" title="Put this on the board  (Shift+Enter)" @click="sendToBoard">
            <Icon name="boards" :size="13" />
          </button>
        </span>
      </template>
      <span v-else-if="showError" class="message">{{ result.error }}</span>
      <span v-else class="message">Answers appear as you type.</span>
    </div>

    <div v-if="history.length" class="history">
      <div class="history-head">
        <span>Recent</span>
        <button class="tiny text" @click="clearHistory">Clear</button>
      </div>
      <button v-for="(h, i) in history.slice(0, 6)" :key="i" class="history-row" @click="reuse(h)">
        <span class="hist-expr">{{ h.expression }}</span>
        <span class="hist-answer">{{ h.answer }}</span>
      </button>
    </div>

    <div v-else class="examples">
      <div class="history-head"><span>Try</span></div>
      <button v-for="e in EXAMPLES" :key="e" class="example" @click="reuse({ expression: e })">{{ e }}</button>
    </div>

    <p class="foot">
      Units, conversions with <code>to</code>, exact fractions, and
      <kbd>Enter</kbd> to keep · <kbd>Shift</kbd>+<kbd>Enter</kbd> to put on the board
    </p>
  </div>
</template>

<style scoped>
.calc {
  width: 380px;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

/* ----------------------------------------------------------------- field -- */
.field {
  display: flex;
  align-items: center;
  gap: 7px;
  border: 1px solid var(--border);
  border-radius: 9px;
  background: var(--bg);
  padding: 0 8px;
  height: 38px;
}
.field:focus-within {
  border-color: var(--accent);
}
.field-icon {
  color: var(--faint);
  flex: none;
}
.entry {
  flex: 1;
  min-width: 0;
  border: none;
  background: transparent;
  outline: none;
  font-family: var(--mono);
  font-size: 14px;
  line-height: 20px;
  color: var(--text);
}
.entry::placeholder {
  color: var(--faint);
  font-family: var(--sans);
  font-size: 12.5px;
}
.angle {
  flex: none;
  font-family: var(--mono);
  font-size: 10px;
  line-height: 14px;
  border: 1px solid var(--border);
  background: var(--panel);
  color: var(--muted);
  border-radius: 5px;
  padding: 2px 5px;
  cursor: pointer;
}
.angle.on {
  color: var(--accent);
  border-color: var(--accent);
}

/* ---------------------------------------------------------------- answer -- */
.answer {
  display: flex;
  align-items: baseline;
  gap: 8px;
  min-height: 34px;
  padding: 5px 10px;
  border-radius: 9px;
  background: var(--chip);
}
.answer.empty,
.answer.error {
  align-items: center;
}
/* Kept from the last thing that parsed, while the next one is being typed. */
.answer.stale .form {
  opacity: 0.45;
}
.answer.stale .answer-actions {
  opacity: 0.45;
}
.eq {
  color: var(--faint);
  font-family: var(--mono);
  font-size: 15px;
  flex: none;
}
.forms {
  flex: 1;
  min-width: 0;
  display: flex;
  align-items: baseline;
  flex-wrap: wrap;
  gap: 6px;
  font-family: var(--mono);
}
.form {
  font-size: 14px;
  color: var(--muted);
}
.form.primary {
  font-size: 17px;
  color: var(--text);
  font-weight: 550;
}
.join {
  color: var(--faint);
  font-size: 13px;
}
.message {
  font-size: 12px;
  color: var(--faint);
}
.answer.error .message {
  color: #e5484d;
}
.answer-actions {
  display: flex;
  gap: 2px;
  flex: none;
  align-self: center;
}

/* --------------------------------------------------------------- history -- */
.history,
.examples {
  display: flex;
  flex-direction: column;
  gap: 1px;
}
.history-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  font-size: 10px;
  line-height: 14px;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  color: var(--faint);
  font-weight: 600;
  padding: 2px 4px 4px;
}
.history-row {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 12px;
  border: none;
  background: transparent;
  border-radius: 6px;
  padding: 5px 8px;
  cursor: pointer;
  font-family: var(--mono);
  text-align: left;
}
.history-row:hover {
  background: var(--chip);
}
.hist-expr {
  font-size: 12px;
  color: var(--muted);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.hist-answer {
  font-size: 12px;
  color: var(--accent);
  flex: none;
}

.examples {
  flex-direction: row;
  flex-wrap: wrap;
  gap: 4px;
}
.examples .history-head {
  width: 100%;
}
.example {
  border: 1px solid var(--border);
  background: var(--panel);
  color: var(--muted);
  border-radius: 6px;
  font-family: var(--mono);
  font-size: 11px;
  line-height: 16px;
  padding: 3px 7px;
  cursor: pointer;
}
.example:hover {
  color: var(--accent);
  border-color: var(--accent);
}

.tiny {
  border: none;
  background: transparent;
  color: var(--faint);
  border-radius: 5px;
  width: 22px;
  height: 22px;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
}
.tiny:hover {
  background: var(--panel);
  color: var(--text);
}
.tiny.text {
  width: auto;
  padding: 0 5px;
  font: inherit;
  font-size: 10px;
  text-transform: none;
  letter-spacing: 0;
}

.foot {
  margin: 0;
  padding: 0 4px;
  font-size: 10.5px;
  line-height: 1.5;
  color: var(--faint);
}
.foot code {
  font-family: var(--mono);
  background: var(--chip);
  border-radius: 3px;
  padding: 0 3px;
}
.foot kbd {
  font-family: var(--mono);
  font-size: 9.5px;
  background: var(--chip);
  border: 1px solid var(--border);
  border-radius: 3px;
  padding: 0 3px;
}
</style>
