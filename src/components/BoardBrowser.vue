<script setup>
import { computed, onMounted, reactive, ref, watch } from 'vue'
import Icon from './Icon.vue'
import BoardPreview from './BoardPreview.vue'
import { api } from '../lib/api.js'
import {
  board,
  boards,
  createBoard,
  createGroup,
  deleteBoard,
  deleteGroup,
  groups,
  loadBoards,
  moveBoardToGroup,
  openBoard,
  renameBoardById,
  updateGroup
} from '../stores/board.js'

const emit = defineEmits(['close'])

const query = ref('')
const renamingBoard = ref(null)
const renamingGroup = ref(null)
const draft = ref('')
const dragging = ref(null)
const dropTarget = ref(null)
const busy = ref(false)

/* -------------------------------------------------------------- previews -- */

/**
 * Thumbnails are fetched on demand and cached against the board's updated_at,
 * so reopening the browser is instant but an edited board redraws itself.
 */
const previews = reactive({})
const inFlight = new Set()

async function ensurePreview (b) {
  const key = `${b.id}:${b.updated_at}`
  if (previews[b.id]?.key === key || inFlight.has(key)) return
  inFlight.add(key)
  try {
    const { preview } = await api.boardPreview(b.id)
    previews[b.id] = { key, preview }
  } catch {
    previews[b.id] = { key, preview: null }
  } finally {
    inFlight.delete(key)
  }
}

function refreshPreviews () {
  for (const b of boards.value) ensurePreview(b)
}

onMounted(async () => {
  await loadBoards()
  refreshPreviews()
})
watch(boards, refreshPreviews)

/* ------------------------------------------------------------- grouping -- */

const filtered = computed(() => {
  const q = query.value.trim().toLowerCase()
  if (!q) return boards.value
  return boards.value.filter((b) => b.name.toLowerCase().includes(q))
})

/** Groups in creation order, then everything ungrouped, then empties hidden
 *  while searching so the results are not buried in headings. */
const sections = computed(() => {
  const searching = !!query.value.trim()
  const out = groups.value.map((g) => ({
    id: g.id,
    name: g.name,
    color: g.color,
    collapsed: !!g.collapsed,
    group: g,
    boards: filtered.value.filter((b) => b.group_id === g.id)
  }))
  out.push({
    id: null,
    name: 'Ungrouped',
    color: null,
    collapsed: false,
    group: null,
    boards: filtered.value.filter((b) => !b.group_id || !groups.value.some((g) => g.id === b.group_id))
  })
  return searching ? out.filter((s) => s.boards.length) : out.filter((s) => s.id || s.boards.length)
})

const totalShown = computed(() => sections.value.reduce((n, s) => n + s.boards.length, 0))

/* -------------------------------------------------------------- actions -- */

async function withBusy (fn) {
  busy.value = true
  try {
    await fn()
  } finally {
    busy.value = false
  }
}

async function open (b) {
  if (b.id === board.value?.id) return emit('close')
  await withBusy(() => openBoard(b.id))
  emit('close')
}

async function onNewBoard (groupId) {
  await withBusy(() => createBoard('Untitled board', groupId))
  emit('close')
}

async function onNewGroup () {
  const group = await createGroup('New group', pickColour())
  renamingGroup.value = group.id
  draft.value = group.name
}

const GROUP_COLOURS = ['#3b6bf5', '#30a46c', '#f76b15', '#8e4ec6', '#e93d82', '#12a594', '#8b8d98']
const pickColour = () => GROUP_COLOURS[groups.value.length % GROUP_COLOURS.length]

async function cycleGroupColour (g) {
  const next = GROUP_COLOURS[(GROUP_COLOURS.indexOf(g.color) + 1) % GROUP_COLOURS.length]
  await updateGroup(g.id, { color: next })
}

async function toggleCollapse (section) {
  if (!section.group) return
  await updateGroup(section.group.id, { collapsed: !section.collapsed })
}

function startRenameBoard (b) {
  renamingBoard.value = b.id
  draft.value = b.name
}

async function commitRenameBoard (b) {
  const next = draft.value.trim()
  renamingBoard.value = null
  if (next && next !== b.name) await renameBoardById(b.id, next)
}

function startRenameGroup (g) {
  renamingGroup.value = g.id
  draft.value = g.name
}

async function commitRenameGroup (g) {
  const next = draft.value.trim()
  renamingGroup.value = null
  if (next && next !== g.name) await updateGroup(g.id, { name: next })
}

async function onDeleteBoard (b) {
  if (boards.value.length <= 1) return
  if (!confirm(`Delete "${b.name}"? Everything on it goes with it.`)) return
  await withBusy(() => deleteBoard(b.id))
}

async function onDeleteGroup (g) {
  const count = boards.value.filter((b) => b.group_id === g.id).length
  const message = count
    ? `Delete the group "${g.name}"? Its ${count} board${count === 1 ? '' : 's'} move to Ungrouped — nothing is lost.`
    : `Delete the group "${g.name}"?`
  if (!confirm(message)) return
  await deleteGroup(g.id)
}

async function onDuplicateBoard (b) {
  await withBusy(async () => {
    const payload = await api.exportBoard(b.id)
    const { board: created } = await api.importBoard(payload)
    if (b.group_id) await moveBoardToGroup(created.id, b.group_id)
    await loadBoards()
  })
}

/* ----------------------------------------------------------- drag & drop -- */

function onDragStart (event, b) {
  dragging.value = b.id
  event.dataTransfer.effectAllowed = 'move'
  event.dataTransfer.setData('text/plain', b.id)
}

function onDragEnd () {
  dragging.value = null
  dropTarget.value = null
}

function onDragOver (event, sectionId) {
  if (!dragging.value) return
  event.preventDefault()
  event.dataTransfer.dropEffect = 'move'
  dropTarget.value = sectionId
}

async function onDrop (event, sectionId) {
  event.preventDefault()
  const id = dragging.value || event.dataTransfer.getData('text/plain')
  dragging.value = null
  dropTarget.value = null
  if (!id) return
  const b = boards.value.find((x) => x.id === id)
  if (!b || (b.group_id || null) === (sectionId || null)) return
  await moveBoardToGroup(id, sectionId)
}

const relativeTime = (ms) => {
  const mins = Math.round((Date.now() - ms) / 60000)
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins}m ago`
  if (mins < 1440) return `${Math.round(mins / 60)}h ago`
  if (mins < 1440 * 7) return `${Math.round(mins / 1440)}d ago`
  return new Date(ms).toLocaleDateString()
}
</script>

<template>
  <div class="scrim" @click.self="emit('close')">
    <div class="browser" role="dialog" aria-label="Boards">
      <header>
        <div class="title">
          <Icon name="boards" :size="17" />
          <h2>Boards</h2>
          <span class="count">{{ totalShown }}</span>
        </div>
        <div class="head-actions">
          <input
            v-model="query"
            class="search"
            type="search"
            placeholder="Search boards…"
            spellcheck="false"
          />
          <button class="mini" title="Create a group" @click="onNewGroup">
            <Icon name="plus" :size="13" /> Group
          </button>
          <button class="mini primary" title="Create a board" @click="onNewBoard(null)">
            <Icon name="plus" :size="13" /> Board
          </button>
          <button class="icon-btn" aria-label="Close" @click="emit('close')">
            <Icon name="close" :size="18" />
          </button>
        </div>
      </header>

      <div class="body" :class="{ busy }">
        <section
          v-for="section in sections"
          :key="section.id || 'ungrouped'"
          class="group"
          :class="{ 'drop-target': dropTarget === section.id && dragging }"
          @dragover="onDragOver($event, section.id)"
          @dragleave="dropTarget = null"
          @drop="onDrop($event, section.id)"
        >
          <div class="group-head">
            <button
              class="collapse"
              :class="{ open: !section.collapsed }"
              :disabled="!section.group"
              @click="toggleCollapse(section)"
            >
              <Icon name="chevron" :size="13" />
            </button>

            <button
              v-if="section.color"
              class="dot"
              :style="{ background: section.color }"
              title="Change colour"
              @click="cycleGroupColour(section.group)"
            />

            <!-- `section.group` guards the null id of the Ungrouped section,
                 which would otherwise match a null `renamingGroup`. -->
            <input
              v-if="section.group && renamingGroup === section.id"
              v-model="draft"
              class="rename-input group-rename"
              autofocus
              @blur="commitRenameGroup(section.group)"
              @keydown.enter.prevent="commitRenameGroup(section.group)"
              @keydown.esc.prevent="renamingGroup = null"
            />
            <button
              v-else
              class="group-name"
              :disabled="!section.group"
              :title="section.group ? 'Click to rename' : 'Boards not in any group'"
              @click="section.group && startRenameGroup(section.group)"
            >{{ section.name }}</button>

            <span class="group-count">{{ section.boards.length }}</span>
            <span class="spacer" />

            <button class="mini ghost" title="New board in this group" @click="onNewBoard(section.id)">
              <Icon name="plus" :size="12" />
            </button>
            <button
              v-if="section.group"
              class="mini ghost danger"
              title="Delete this group (boards are kept)"
              @click="onDeleteGroup(section.group)"
            >
              <Icon name="trash" :size="12" />
            </button>
          </div>

          <div v-if="!section.collapsed" class="tiles">
            <article
              v-for="b in section.boards"
              :key="b.id"
              class="tile"
              :class="{ current: b.id === board?.id, dragging: dragging === b.id }"
              draggable="true"
              @dragstart="onDragStart($event, b)"
              @dragend="onDragEnd"
              @dblclick="open(b)"
            >
              <button class="thumb" :title="`Open ${b.name}`" @click="open(b)">
                <BoardPreview
                  :preview="previews[b.id]?.preview"
                  :loading="!previews[b.id]"
                  :width="232"
                  :height="132"
                />
              </button>

              <footer>
                <input
                  v-if="renamingBoard === b.id"
                  v-model="draft"
                  class="rename-input"
                  autofocus
                  @blur="commitRenameBoard(b)"
                  @keydown.enter.prevent="commitRenameBoard(b)"
                  @keydown.esc.prevent="renamingBoard = null"
                />
                <button v-else class="tile-name" title="Click to rename" @click="startRenameBoard(b)">
                  {{ b.name }}
                </button>
                <div class="tile-meta">
                  <span>{{ b.item_count }} item{{ b.item_count === 1 ? '' : 's' }}</span>
                  <span class="sep">·</span>
                  <span>{{ relativeTime(b.updated_at) }}</span>
                </div>
              </footer>

              <div class="tile-actions">
                <button class="mini ghost" title="Duplicate" @click.stop="onDuplicateBoard(b)">
                  <Icon name="copy" :size="12" />
                </button>
                <button
                  class="mini ghost danger"
                  title="Delete board"
                  :disabled="boards.length <= 1"
                  @click.stop="onDeleteBoard(b)"
                >
                  <Icon name="trash" :size="12" />
                </button>
              </div>
            </article>

            <button
              v-if="!section.boards.length"
              class="tile empty-tile"
              @click="onNewBoard(section.id)"
            >
              <Icon name="plus" :size="18" />
              <span>{{ dragging ? 'Drop a board here' : 'New board' }}</span>
            </button>
          </div>
        </section>

        <p v-if="query && !totalShown" class="no-results">
          Nothing matches “{{ query }}”.
        </p>
      </div>

      <footer class="hint-bar">
        Drag a board onto a group to move it · double-click a tile to open · click a name to rename
      </footer>
    </div>
  </div>
</template>

<style scoped>
.scrim {
  position: fixed;
  inset: 0;
  background: rgba(15, 23, 42, 0.42);
  backdrop-filter: blur(2px);
  display: grid;
  place-items: center;
  z-index: 100;
  padding: 24px;
}
.browser {
  width: min(1080px, 100%);
  max-height: min(88vh, 940px);
  display: flex;
  flex-direction: column;
  background: var(--panel);
  border: 1px solid var(--border);
  border-radius: 14px;
  box-shadow: var(--shadow-lg);
  overflow: hidden;
}

header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  padding: 12px 14px;
  border-bottom: 1px solid var(--border);
  flex: none;
}
.title {
  display: flex;
  align-items: center;
  gap: 8px;
  color: var(--muted);
}
h2 {
  margin: 0;
  font-size: 15px;
  font-weight: 650;
  color: var(--text);
}
.count {
  font-size: 11px;
  color: var(--faint);
  background: var(--chip);
  border-radius: 10px;
  padding: 1px 7px;
}
.head-actions {
  display: flex;
  align-items: center;
  gap: 6px;
}
.search {
  height: 30px;
  width: 200px;
  border: 1px solid var(--border);
  border-radius: 8px;
  background: var(--bg);
  color: var(--text);
  font: inherit;
  font-size: 12.5px;
  padding: 0 10px;
  outline: none;
}
.search:focus {
  border-color: var(--accent);
}

.body {
  overflow-y: auto;
  padding: 6px 14px 14px;
  display: flex;
  flex-direction: column;
  gap: 4px;
}
.body.busy {
  opacity: 0.6;
  pointer-events: none;
}

/* --------------------------------------------------------------- groups -- */
.group {
  border-radius: 10px;
  padding: 6px;
  border: 1px dashed transparent;
  transition: background 0.12s, border-color 0.12s;
}
.group.drop-target {
  border-color: var(--accent);
  background: var(--accent-soft);
}
.group-head {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 4px 2px 8px;
}
.collapse {
  border: none;
  background: transparent;
  color: var(--faint);
  cursor: pointer;
  padding: 0;
  width: 16px;
  height: 16px;
  display: grid;
  place-items: center;
  transform: rotate(-90deg);
  transition: transform 0.14s;
}
.collapse.open {
  transform: rotate(0deg);
}
.collapse:disabled {
  opacity: 0;
  cursor: default;
}
.dot {
  width: 9px;
  height: 9px;
  border-radius: 50%;
  border: none;
  cursor: pointer;
  padding: 0;
  flex: none;
}
.group-name {
  border: none;
  background: transparent;
  color: var(--text);
  font: inherit;
  font-size: 12px;
  font-weight: 650;
  letter-spacing: 0.01em;
  cursor: text;
  padding: 2px 5px;
  border-radius: 5px;
}
.group-name:hover:not(:disabled) {
  background: var(--chip);
}
.group-name:disabled {
  color: var(--faint);
  cursor: default;
}
.group-count {
  font-size: 10.5px;
  color: var(--faint);
}
.spacer {
  flex: 1;
}

/* ---------------------------------------------------------------- tiles -- */
.tiles {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(232px, 1fr));
  gap: 12px;
}
.tile {
  position: relative;
  border: 1px solid var(--border);
  border-radius: 10px;
  background: var(--panel);
  overflow: hidden;
  transition: border-color 0.12s, box-shadow 0.12s, opacity 0.12s;
}
.tile:hover {
  border-color: var(--muted);
  box-shadow: var(--shadow-md);
}
.tile.current {
  border-color: var(--accent);
  box-shadow: 0 0 0 1px var(--accent);
}
.tile.dragging {
  opacity: 0.4;
}
.thumb {
  display: block;
  width: 100%;
  border: none;
  padding: 0;
  background: transparent;
  cursor: pointer;
  border-bottom: 1px solid var(--border);
}
.tile footer {
  padding: 7px 9px 8px;
  display: flex;
  flex-direction: column;
  gap: 2px;
}
.tile-name {
  border: none;
  background: transparent;
  color: var(--text);
  font: inherit;
  font-size: 12.5px;
  font-weight: 550;
  text-align: left;
  padding: 1px 3px;
  margin-left: -3px;
  border-radius: 4px;
  cursor: text;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.tile-name:hover {
  background: var(--chip);
}
.tile.current .tile-name {
  color: var(--accent);
}
.tile-meta {
  display: flex;
  gap: 5px;
  font-size: 10.5px;
  color: var(--faint);
}
.tile-actions {
  position: absolute;
  top: 6px;
  right: 6px;
  display: flex;
  gap: 3px;
  opacity: 0;
  transition: opacity 0.12s;
}
.tile:hover .tile-actions {
  opacity: 1;
}
.tile-actions .mini {
  background: color-mix(in srgb, var(--panel) 88%, transparent);
  backdrop-filter: blur(3px);
}

.empty-tile {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 6px;
  min-height: 174px;
  border-style: dashed;
  color: var(--faint);
  font-size: 12px;
  cursor: pointer;
  background: transparent;
  font-family: inherit;
}
.empty-tile:hover {
  color: var(--accent);
  border-color: var(--accent);
}

/* -------------------------------------------------------------- buttons -- */
.mini {
  display: inline-flex;
  align-items: center;
  gap: 3px;
  border: 1px solid var(--border);
  background: var(--panel);
  color: var(--muted);
  border-radius: 7px;
  font: inherit;
  font-size: 11.5px;
  padding: 4px 8px;
  cursor: pointer;
  white-space: nowrap;
}
.mini:hover:not(:disabled) {
  color: var(--text);
  border-color: var(--muted);
}
.mini:disabled {
  opacity: 0.35;
  cursor: default;
}
.mini.primary {
  color: var(--accent);
  border-color: var(--accent);
  background: var(--accent-soft);
}
.mini.ghost {
  padding: 3px 5px;
}
.mini.danger:hover:not(:disabled) {
  color: #e5484d;
  border-color: #e5484d;
}
.icon-btn {
  border: none;
  background: transparent;
  color: var(--muted);
  cursor: pointer;
  border-radius: 6px;
  width: 28px;
  height: 28px;
  display: grid;
  place-items: center;
}
.icon-btn:hover {
  background: var(--chip);
  color: var(--text);
}

.rename-input {
  font: inherit;
  font-size: 12.5px;
  padding: 2px 6px;
  border: 1px solid var(--accent);
  border-radius: 5px;
  background: var(--bg);
  color: var(--text);
  outline: none;
  width: 100%;
}
.group-rename {
  width: 180px;
  font-weight: 650;
  font-size: 12px;
}

.no-results {
  text-align: center;
  color: var(--faint);
  font-size: 12.5px;
  padding: 30px 0;
  margin: 0;
}

.hint-bar {
  flex: none;
  border-top: 1px solid var(--border);
  padding: 8px 14px;
  font-size: 11px;
  color: var(--faint);
}
</style>
