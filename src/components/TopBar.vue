<script setup>
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import Icon from './Icon.vue'
import SettingsMenu from './SettingsMenu.vue'
import { api } from '../lib/api.js'
import {
  board,
  boards,
  groups,
  historyDepth,
  lastError,
  redo,
  renameBoard,
  saveState,
  setBackground,
  setOverlay,
  undo,
  viewport,
  setZoom,
  zoomToFit
} from '../stores/board.js'

const emit = defineEmits(['help', 'import', 'browse'])

const dbOpen = ref(false)
const settingsOpen = ref(false)
const renaming = ref(false)
const draftName = ref('')
const info = ref(null)

const zoomPercent = computed(() => Math.round(viewport.k * 100))

/** The group the open board sits in, shown as a breadcrumb before its name. */
const currentGroup = computed(() => {
  const entry = boards.value.find((b) => b.id === board.value?.id)
  if (!entry?.group_id) return null
  return groups.value.find((g) => g.id === entry.group_id) || null
})

const saveLabel = computed(() => {
  if (saveState.value === 'saving') return 'Saving…'
  if (saveState.value === 'error') return 'Not saved'
  return 'Saved'
})

function toggleSettings () {
  settingsOpen.value = !settingsOpen.value
  dbOpen.value = false
}

async function toggleDb () {
  dbOpen.value = !dbOpen.value
  settingsOpen.value = false
  if (dbOpen.value) {
    try {
      info.value = await api.info()
    } catch (err) {
      info.value = { error: err.message }
    }
  }
}

function startRename () {
  draftName.value = board.value?.name || ''
  renaming.value = true
}

async function commitRename () {
  renaming.value = false
  const next = draftName.value.trim()
  if (next && next !== board.value?.name) await renameBoard(next)
}

async function onExport () {
  if (!board.value) return
  const payload = await api.exportBoard(board.value.id)
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `${(board.value.name || 'board').replace(/[^\w-]+/g, '-').toLowerCase()}.json`
  a.click()
  URL.revokeObjectURL(url)
}

const humanBytes = (n) => {
  if (!n) return '0 B'
  const units = ['B', 'KB', 'MB', 'GB']
  const i = Math.min(units.length - 1, Math.floor(Math.log(n) / Math.log(1024)))
  return `${(n / 1024 ** i).toFixed(i ? 1 : 0)} ${units[i]}`
}

function onDocumentClick (event) {
  if (event.target.closest('.has-popover')) return
  dbOpen.value = false
  settingsOpen.value = false
}

// Tell the shell to keep the bar on screen while anything is open out of it,
// otherwise reaching for the popover is what makes it disappear.
watch(
  [settingsOpen, dbOpen, renaming],
  ([a, b, c]) => setOverlay('topbar', a || b || c, 'top'),
  { immediate: true }
)

onMounted(() => document.addEventListener('click', onDocumentClick))
onBeforeUnmount(() => {
  document.removeEventListener('click', onDocumentClick)
  setOverlay('topbar', false, 'top')
})

const BACKGROUNDS = [
  { id: 'dots', label: 'Dots' },
  { id: 'grid', label: 'Grid' },
  { id: 'lines', label: 'Lines' },
  { id: 'blank', label: 'Blank' }
]
</script>

<template>
  <header class="topbar">
    <div class="left">
      <div class="brand" title="Mirror — local-first study board">
        <span class="mark" />
        <span class="wordmark">Mirror</span>
      </div>

      <button class="ghost boards-btn" title="Browse boards and groups  (Ctrl+B)" @click="emit('browse')">
        <Icon name="boards" :size="17" />
        <Icon name="chevron" :size="13" class="chev" />
      </button>

      <span v-if="currentGroup" class="crumb">
        <span class="crumb-dot" :style="{ background: currentGroup.color }" />
        {{ currentGroup.name }}
        <span class="crumb-sep">/</span>
      </span>

      <input
        v-if="renaming"
        v-model="draftName"
        class="name-input"
        autofocus
        @blur="commitRename"
        @keydown.enter.prevent="commitRename"
        @keydown.esc.prevent="renaming = false"
      />
      <button v-else class="board-title" title="Click to rename" @click="startRename">
        {{ board?.name || 'Loading…' }}
      </button>

      <span class="save" :class="saveState" :title="lastError || 'Autosaves to the local database'">
        <span class="dot" />{{ saveLabel }}
      </span>
    </div>

    <div class="right">
      <div class="group">
        <button class="ghost" :disabled="!historyDepth.undo" title="Undo  (Ctrl+Z)" @click="undo">
          <Icon name="undo" :size="17" />
        </button>
        <button class="ghost" :disabled="!historyDepth.redo" title="Redo  (Ctrl+Shift+Z)" @click="redo">
          <Icon name="redo" :size="17" />
        </button>
      </div>

      <div class="group zoom">
        <button class="ghost" title="Zoom out  (−)" @click="setZoom(viewport.k / 1.25)">
          <Icon name="minus" :size="16" />
        </button>
        <button class="zoom-value" title="Reset to 100%  (Ctrl+0)" @click="setZoom(1)">{{ zoomPercent }}%</button>
        <button class="ghost" title="Zoom in  (+)" @click="setZoom(viewport.k * 1.25)">
          <Icon name="plus" :size="16" />
        </button>
        <button class="ghost" title="Fit everything  (Ctrl+1)" @click="zoomToFit()">
          <Icon name="fit" :size="16" />
        </button>
      </div>

      <div class="group">
        <select
          class="bg-select"
          :value="board?.background || 'dots'"
          title="Canvas background"
          @change="setBackground($event.target.value)"
        >
          <option v-for="b in BACKGROUNDS" :key="b.id" :value="b.id">{{ b.label }}</option>
        </select>
      </div>

      <div class="group">
        <button class="ghost" title="Export this board as JSON" @click="onExport">
          <Icon name="download" :size="17" />
        </button>
        <button class="ghost" title="Import a board from JSON" @click="emit('import')">
          <Icon name="upload" :size="17" />
        </button>
      </div>

      <div class="group has-popover">
        <button class="ghost" title="Where your data lives" @click="toggleDb">
          <Icon name="database" :size="17" />
        </button>
        <div v-if="dbOpen" class="popover db-popover">
          <div class="popover-head"><span>Local database</span></div>
          <template v-if="info?.database">
            <dl class="facts">
              <dt>File</dt>
              <dd class="mono">{{ info.database.relativePath }}</dd>
              <dt>Size</dt>
              <dd>{{ humanBytes(info.database.sizeBytes) }}</dd>
              <dt>Holds</dt>
              <dd>{{ info.database.boards }} boards · {{ info.database.items }} items</dd>
            </dl>
            <p class="hint">
              Everything you draw lives in that one file. To carry it to another machine on your
              network:
            </p>
            <pre class="cmd">node tools/db-sync.mjs push laptop</pre>
            <pre class="cmd">node tools/db-sync.mjs pull laptop</pre>
            <p class="hint">
              Run <code>node tools/db-sync.mjs help</code> for setup and every option. It is
              gitignored, so cloning the repo never carries your boards with it.
            </p>
          </template>
          <p v-else-if="info?.error" class="hint error">{{ info.error }}</p>
          <p v-else class="hint">Loading…</p>
        </div>
      </div>

      <div class="group has-popover">
        <button
          class="ghost"
          :class="{ active: settingsOpen }"
          title="Settings"
          @click="toggleSettings"
        >
          <Icon name="settings" :size="17" />
        </button>
        <div v-if="settingsOpen" class="popover settings-popover">
          <SettingsMenu @close="settingsOpen = false" />
        </div>
      </div>

      <button class="ghost" title="Guide and keyboard shortcuts  (?)" @click="emit('help')">
        <Icon name="help" :size="17" />
      </button>
    </div>
  </header>
</template>

<style scoped>
.topbar {
  height: 48px;
  flex: none;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 0 10px 0 12px;
  background: var(--panel);
  /* An inset line rather than border-bottom: a 1px border would shrink the
     content box to 47px, so centring would land every child on a half pixel
     and icons and text would snap to different rows. */
  box-shadow: inset 0 -1px 0 var(--border);
  position: relative;
  z-index: 30;
}

.left,
.right {
  display: flex;
  align-items: center;
  gap: 6px;
  min-width: 0;
}

.brand {
  display: flex;
  align-items: center;
  gap: 7px;
  padding-right: 6px;
  height: 16px;
}
.mark {
  width: 16px;
  height: 16px;
  flex: none;
  border-radius: 5px;
  background: linear-gradient(135deg, var(--accent), #8e4ec6);
}
.wordmark {
  font-weight: 650;
  font-size: 14px;
  line-height: 16px;
  letter-spacing: -0.01em;
}

.crumb {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  font-size: 12px;
  line-height: 16px;
  color: var(--faint);
  white-space: nowrap;
  padding-left: 2px;
}
.crumb-dot {
  width: 7px;
  height: 7px;
  border-radius: 50%;
}
.crumb-sep {
  color: var(--border);
}

.board-title {
  display: flex;
  align-items: center;
  border: none;
  background: transparent;
  font: inherit;
  font-size: 13px;
  line-height: 1;
  color: var(--text);
  height: 28px;
  padding: 0 8px;
  border-radius: 6px;
  cursor: text;
  max-width: 260px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.board-title:hover {
  background: var(--chip);
}
.name-input {
  font: inherit;
  font-size: 13px;
  line-height: 1;
  height: 28px;
  padding: 0 8px;
  border: 1px solid var(--accent);
  border-radius: 6px;
  background: var(--bg);
  color: var(--text);
  width: 200px;
  outline: none;
}

.save {
  display: flex;
  align-items: center;
  gap: 5px;
  font-size: 11px;
  line-height: 16px;
  color: var(--faint);
  padding-left: 4px;
  white-space: nowrap;
}
.save .dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: #30a46c;
}
.save.saving .dot {
  background: var(--faint);
}
.save.error {
  color: #e5484d;
}
.save.error .dot {
  background: #e5484d;
}

.group {
  display: flex;
  align-items: center;
  gap: 1px;
  padding-left: 6px;
  margin-left: 2px;
  border-left: 1px solid var(--border);
}
.group:first-child {
  border-left: none;
}

.ghost {
  display: flex;
  align-items: center;
  justify-content: center;
  width: auto;
  min-width: 30px;
  height: 30px;
  border: none;
  background: transparent;
  color: var(--muted);
  border-radius: 7px;
  cursor: pointer;
  padding: 0 5px;
}
.ghost:hover:not(:disabled) {
  background: var(--chip);
  color: var(--text);
}
.ghost:disabled {
  opacity: 0.35;
  cursor: default;
}
.chev {
  margin-left: -2px;
  opacity: 0.7;
}

.zoom-value {
  display: flex;
  align-items: center;
  justify-content: center;
  border: none;
  background: transparent;
  color: var(--muted);
  font: inherit;
  font-size: 11px;
  /* 16px rather than 1: it puts the cap-height centre of the digits on the
     same row as the +/− icons either side. */
  line-height: 16px;
  font-variant-numeric: tabular-nums;
  min-width: 44px;
  height: 30px;
  border-radius: 7px;
  cursor: pointer;
}
.zoom-value:hover {
  background: var(--chip);
  color: var(--text);
}

.bg-select {
  height: 30px;
  border: 1px solid var(--border);
  border-radius: 7px;
  background: var(--panel);
  color: var(--muted);
  font: inherit;
  font-size: 11px;
  padding: 0 6px;
  cursor: pointer;
}

/* --------------------------------------------------------------- popover */
.has-popover {
  position: relative;
}
.popover {
  position: absolute;
  top: calc(100% + 8px);
  background: var(--panel);
  border: 1px solid var(--border);
  border-radius: 10px;
  box-shadow: var(--shadow-lg);
  padding: 8px;
  z-index: 40;
}
.db-popover {
  right: 0;
  width: 330px;
}
.settings-popover {
  right: 0;
  width: 340px;
}
.ghost.active {
  background: var(--accent-soft);
  color: var(--accent);
}
.popover-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  font-size: 10px;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  color: var(--faint);
  font-weight: 600;
  padding: 2px 4px 8px;
}
.mini {
  display: inline-flex;
  align-items: center;
  gap: 3px;
  border: 1px solid var(--border);
  background: var(--panel);
  color: var(--muted);
  border-radius: 6px;
  font-size: 11px;
  padding: 2px 6px;
  cursor: pointer;
  text-transform: none;
  letter-spacing: 0;
}
.mini:hover {
  color: var(--text);
  border-color: var(--muted);
}


.facts {
  display: grid;
  grid-template-columns: auto 1fr;
  gap: 3px 10px;
  margin: 0 0 8px;
  padding: 0 4px;
  font-size: 12px;
}
.facts dt {
  color: var(--faint);
}
.facts dd {
  margin: 0;
  color: var(--text);
  overflow-wrap: anywhere;
}
.mono {
  font-family: var(--mono);
  font-size: 11.5px;
}
.hint {
  font-size: 11.5px;
  color: var(--muted);
  line-height: 1.5;
  margin: 8px 4px 0;
}
.hint.error {
  color: #e5484d;
}
.hint code {
  font-family: var(--mono);
  background: var(--chip);
  border-radius: 3px;
  padding: 1px 4px;
}
.cmd {
  font-family: var(--mono);
  font-size: 11.5px;
  background: var(--chip);
  border: 1px solid var(--border);
  border-radius: 6px;
  padding: 6px 8px;
  margin: 6px 0 0;
  overflow-x: auto;
  color: var(--text);
}
</style>
