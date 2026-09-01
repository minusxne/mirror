/**
 * The single source of truth for the open board.
 *
 * Edits apply to local state immediately and are queued for the database in the
 * background, so drawing never waits on a round trip. Undo/redo works on
 * before/after snapshots of the items an action touched, which keeps every
 * operation — including multi-item drags and deletes — reversible with one
 * mechanism.
 */
import { computed, reactive, ref, shallowReactive } from 'vue'
import { api } from '../lib/api.js'
import { boundsOf, clamp } from '../lib/geometry.js'
import { MIN_ZOOM, MAX_ZOOM } from '../lib/constants.js'

const clone = (v) => (v == null ? null : JSON.parse(JSON.stringify(v)))
const uid = () =>
  (crypto.randomUUID ? crypto.randomUUID() : `id-${Date.now()}-${Math.random().toString(16).slice(2)}`)

/* ----------------------------------------------------------------- state -- */

export const boards = ref([])
export const groups = ref([])
export const board = ref(null)
export const items = shallowReactive({})
export const selection = ref([])
export const editingId = ref(null)
export const loading = ref(true)
export const saveState = ref('saved') // 'saved' | 'saving' | 'error'
export const lastError = ref(null)

export const tool = ref('select')
export const previousTool = ref('select')

export const style = reactive({
  color: '#1f2933',
  fill: '#fff3a3',
  shapeFill: 'transparent',
  strokeWidth: 3,
  fontSize: 20,
  dash: 'solid'
})

/** Eraser behaviour. `object` removes whole things; `brush` rubs out ink. */
export const eraser = reactive({
  mode: localStorage.getItem('mirror:eraserMode') === 'brush' ? 'brush' : 'object',
  size: Number(localStorage.getItem('mirror:eraserSize')) || 28
})

export function setEraser (patch) {
  Object.assign(eraser, patch)
  localStorage.setItem('mirror:eraserMode', eraser.mode)
  localStorage.setItem('mirror:eraserSize', String(eraser.size))
}

/* ---------------------------------------------------------- preferences -- */

const SETTINGS_KEY = 'mirror:settings'

const DEFAULT_SETTINGS = {
  /** Pen stabiliser: off | light | medium | strong. */
  smoothing: 'light',
  /** Slide the top bar and tool bar away until the pointer approaches. */
  autoHideTopBar: false,
  autoHideToolBar: false,
  /** Drag with the right button to pan; a right click without dragging still
   *  opens the context menu. */
  rightClickPan: false
}

function loadSettings () {
  try {
    const raw = JSON.parse(localStorage.getItem(SETTINGS_KEY) || '{}')
    const out = { ...DEFAULT_SETTINGS }
    for (const key of Object.keys(DEFAULT_SETTINGS)) {
      if (raw[key] !== undefined && typeof raw[key] === typeof DEFAULT_SETTINGS[key]) {
        out[key] = raw[key]
      }
    }
    return out
  } catch {
    return { ...DEFAULT_SETTINGS }
  }
}

export const settings = reactive(loadSettings())

export function setSetting (key, value) {
  if (!(key in DEFAULT_SETTINGS)) return
  settings[key] = value
  localStorage.setItem(SETTINGS_KEY, JSON.stringify({ ...settings }))
}

export function resetSettings () {
  Object.assign(settings, DEFAULT_SETTINGS)
  localStorage.setItem(SETTINGS_KEY, JSON.stringify({ ...settings }))
}

export const viewport = reactive({ x: 0, y: 0, k: 1 })
export const viewportSize = reactive({ w: 1200, h: 800 })

const undoStack = []
const redoStack = []
export const historyDepth = reactive({ undo: 0, redo: 0 })

export const clipboard = ref([])

/* ------------------------------------------------------------- selectors -- */

export const sortedItems = computed(() =>
  Object.values(items).sort((a, b) => a.z - b.z || a.createdAt - b.createdAt)
)

export const selectionSet = computed(() => new Set(selection.value))
export const selectedItems = computed(() => selection.value.map((id) => items[id]).filter(Boolean))
export const selectionBounds = computed(() => boundsOf(selectedItems.value))

export const isSelected = (id) => selectionSet.value.has(id)

/* --------------------------------------------------------- persistence -- */

const pending = new Map() // id -> item snapshot, or null for "delete"
let flushTimer = null
let inFlight = false

function queue (id, item) {
  pending.set(id, item ? clone(item) : null)
  saveState.value = 'saving'
  if (flushTimer) clearTimeout(flushTimer)
  flushTimer = setTimeout(flush, 350)
}

export async function flush () {
  if (flushTimer) { clearTimeout(flushTimer); flushTimer = null }
  if (inFlight || !pending.size || !board.value) return
  const batch = [...pending.entries()]
  pending.clear()
  inFlight = true
  try {
    await api.commit(
      board.value.id,
      batch.map(([id, item]) => (item ? { kind: 'upsert', item } : { kind: 'delete', id }))
    )
    saveState.value = pending.size ? 'saving' : 'saved'
    lastError.value = null
  } catch (err) {
    // Put the work back so the next flush retries it rather than losing it.
    for (const [id, item] of batch) if (!pending.has(id)) pending.set(id, item)
    saveState.value = 'error'
    lastError.value = err.message
  } finally {
    inFlight = false
    if (pending.size) flushTimer = setTimeout(flush, 1500)
  }
}

/* ----------------------------------------------------------- history -- */

function pushHistory (changes) {
  if (!changes.length) return
  undoStack.push(changes)
  if (undoStack.length > 200) undoStack.shift()
  redoStack.length = 0
  syncHistoryDepth()
}

function syncHistoryDepth () {
  historyDepth.undo = undoStack.length
  historyDepth.redo = redoStack.length
}

/** Capture the current state of some items so a change can be undone later. */
export function snapshot (ids) {
  const map = new Map()
  for (const id of ids) map.set(id, clone(items[id]))
  return map
}

// updatedAt changes on every touch, so it must not count as "something changed"
// — otherwise a click that moves nothing would still land on the undo stack.
const identity = (item) => {
  if (!item) return 'null'
  const { updatedAt, ...rest } = item
  return JSON.stringify(rest)
}

/** Diff against a snapshot, record one undo entry, and queue the writes. */
export function commitSnapshot (before) {
  const changes = []
  for (const [id, prev] of before) {
    const now = items[id] ? clone(items[id]) : null
    if (identity(prev) === identity(now)) continue
    changes.push({ id, before: prev, after: now })
    queue(id, now)
  }
  pushHistory(changes)
  return changes.length
}

/** Run `fn`, then record whatever it did to `ids` as a single undoable step. */
export function transact (ids, fn) {
  const before = snapshot(ids)
  const result = fn()
  commitSnapshot(before)
  return result
}

function applyChanges (changes, direction) {
  for (const change of changes) {
    const target = direction === 'undo' ? change.before : change.after
    if (target) {
      items[change.id] = clone(target)
      queue(change.id, target)
    } else {
      delete items[change.id]
      queue(change.id, null)
    }
  }
  selection.value = selection.value.filter((id) => items[id])
}

export function undo () {
  const changes = undoStack.pop()
  if (!changes) return
  applyChanges(changes, 'undo')
  redoStack.push(changes)
  syncHistoryDepth()
}

export function redo () {
  const changes = redoStack.pop()
  if (!changes) return
  applyChanges(changes, 'redo')
  undoStack.push(changes)
  syncHistoryDepth()
}

/* ------------------------------------------------------------- boards -- */

export async function loadBoards () {
  const { boards: list, groups: groupList } = await api.listBoards()
  boards.value = list
  if (groupList) groups.value = groupList
  return list
}

export async function openBoard (id) {
  loading.value = true
  try {
    await flush()
    const { board: b, items: list } = await api.getBoard(id)
    board.value = b
    for (const key of Object.keys(items)) delete items[key]
    for (const it of list) items[it.id] = it
    selection.value = []
    editingId.value = null
    undoStack.length = 0
    redoStack.length = 0
    syncHistoryDepth()
    localStorage.setItem('mirror:lastBoard', id)
    restoreView(id)
  } finally {
    loading.value = false
  }
}

export async function createBoard (name = 'Untitled board', groupId = null) {
  const { board: b } = await api.createBoard(name, groupId)
  await loadBoards()
  await openBoard(b.id)
  return b
}

export async function moveBoardToGroup (boardId, groupId) {
  await api.updateBoard(boardId, { groupId: groupId || null })
  if (board.value?.id === boardId) board.value = { ...board.value, group_id: groupId || null }
  await loadBoards()
}

export async function renameBoardById (boardId, name) {
  const { board: b } = await api.updateBoard(boardId, { name })
  if (board.value?.id === boardId) board.value = b
  await loadBoards()
}

/* ------------------------------------------------------------- groups -- */

export async function createGroup (name = 'New group', color) {
  const { group } = await api.createGroup(name, color)
  await loadBoards()
  return group
}

export async function updateGroup (id, patch) {
  await api.updateGroup(id, patch)
  await loadBoards()
}

export async function deleteGroup (id) {
  await api.deleteGroup(id)
  await loadBoards()
}

export async function renameBoard (name) {
  if (!board.value) return
  const { board: b } = await api.updateBoard(board.value.id, { name })
  board.value = b
  await loadBoards()
}

export async function setBackground (background) {
  if (!board.value) return
  const { board: b } = await api.updateBoard(board.value.id, { background })
  board.value = b
}

export async function deleteBoard (id) {
  await api.deleteBoard(id)
  const list = await loadBoards()
  if (board.value?.id === id && list.length) await openBoard(list[0].id)
}

/* ------------------------------------------------------------ viewport -- */

export const screenToWorld = (sx, sy) => ({
  x: (sx - viewport.x) / viewport.k,
  y: (sy - viewport.y) / viewport.k
})

export const worldToScreen = (wx, wy) => ({
  x: wx * viewport.k + viewport.x,
  y: wy * viewport.k + viewport.y
})

export function zoomAt (sx, sy, factor) {
  const k = clamp(viewport.k * factor, MIN_ZOOM, MAX_ZOOM)
  const ratio = k / viewport.k
  viewport.x = sx - (sx - viewport.x) * ratio
  viewport.y = sy - (sy - viewport.y) * ratio
  viewport.k = k
  saveView()
}

export function setZoom (k) {
  zoomAt(viewportSize.w / 2, viewportSize.h / 2, clamp(k, MIN_ZOOM, MAX_ZOOM) / viewport.k)
}

export function panBy (dx, dy) {
  viewport.x += dx
  viewport.y += dy
  saveView()
}

export function resetView () {
  viewport.x = 0
  viewport.y = 0
  viewport.k = 1
  saveView()
}

export function zoomToFit (targets) {
  const list = targets && targets.length ? targets : Object.values(items)
  const b = boundsOf(list)
  if (!b || !b.w || !b.h) return resetView()
  const pad = 80
  const k = clamp(
    Math.min((viewportSize.w - pad * 2) / b.w, (viewportSize.h - pad * 2) / b.h),
    MIN_ZOOM,
    2
  )
  viewport.k = k
  viewport.x = viewportSize.w / 2 - (b.x + b.w / 2) * k
  viewport.y = viewportSize.h / 2 - (b.y + b.h / 2) * k
  saveView()
}

let viewSaveTimer = null
function saveView () {
  if (!board.value) return
  clearTimeout(viewSaveTimer)
  viewSaveTimer = setTimeout(() => {
    localStorage.setItem(
      `mirror:view:${board.value.id}`,
      JSON.stringify({ x: viewport.x, y: viewport.y, k: viewport.k })
    )
  }, 400)
}

function restoreView (boardId) {
  try {
    const raw = localStorage.getItem(`mirror:view:${boardId}`)
    if (!raw) return resetView()
    const v = JSON.parse(raw)
    viewport.x = Number(v.x) || 0
    viewport.y = Number(v.y) || 0
    viewport.k = clamp(Number(v.k) || 1, MIN_ZOOM, MAX_ZOOM)
  } catch {
    resetView()
  }
}

/* -------------------------------------------------------------- items -- */

export function nextZ () {
  let max = 0
  for (const it of Object.values(items)) max = Math.max(max, it.z)
  return max + 1
}

export function addItem (partial, { select = true, record = true } = {}) {
  const now = Date.now()
  const item = {
    id: partial.id || uid(),
    type: partial.type,
    x: partial.x ?? 0,
    y: partial.y ?? 0,
    w: partial.w ?? 0,
    h: partial.h ?? 0,
    z: partial.z ?? nextZ(),
    data: partial.data ?? {},
    createdAt: now,
    updatedAt: now
  }
  items[item.id] = item
  if (record) pushHistory([{ id: item.id, before: null, after: clone(item) }])
  queue(item.id, item)
  if (select) selection.value = [item.id]
  return item
}

/** Live update with no history entry — for drags, where the caller brackets
 *  the whole gesture with snapshot()/commitSnapshot(). */
export function patchItem (id, patch) {
  const item = items[id]
  if (!item) return
  const next = { ...item, ...patch, updatedAt: Date.now() }
  if (patch.data) next.data = { ...item.data, ...patch.data }
  items[id] = next
  return next
}

/** Persist without an undo entry — for measured sizes and other bookkeeping
 *  the user did not consciously perform. */
export function patchItemQuiet (id, patch) {
  const next = patchItem(id, patch)
  if (next) queue(id, next)
  return next
}

/**
 * Queue an item's current state for the database.
 *
 * Gestures build up their result with `patchItem`, which is deliberately silent
 * so a drag does not fire a write per frame. Whoever ends the gesture has to
 * call this, or the final geometry only ever exists in memory.
 */
export function persistItem (id) {
  const item = items[id]
  if (item) queue(id, item)
  return item
}

/** Update + record + persist in one go, for discrete edits. */
export function updateItem (id, patch) {
  return transact([id], () => patchItem(id, patch))
}

export function updateItems (ids, patchFor) {
  return transact(ids, () => {
    for (const id of ids) {
      const patch = typeof patchFor === 'function' ? patchFor(items[id]) : patchFor
      if (patch) patchItem(id, patch)
    }
  })
}

/** Delete with immediate feedback but no undo entry — the caller is mid-gesture
 *  and will record the whole sweep as one step when the pointer comes up. */
export function removeItemsQuiet (ids) {
  const changes = []
  for (const id of ids) {
    const item = items[id]
    if (!item) continue
    changes.push({ id, before: clone(item), after: null })
    delete items[id]
    queue(id, null)
  }
  if (changes.length) selection.value = selection.value.filter((id) => items[id])
  return changes
}

/** Add an already-computed set of before/after changes to the undo stack. */
export function recordChanges (changes) {
  pushHistory(changes)
}

export function removeItems (ids) {
  const changes = []
  for (const id of ids) {
    const item = items[id]
    if (!item) continue
    changes.push({ id, before: clone(item), after: null })
    delete items[id]
    queue(id, null)
  }
  pushHistory(changes)
  selection.value = selection.value.filter((id) => items[id])
  if (editingId.value && !items[editingId.value]) editingId.value = null
}

/* ---------------------------------------------------------- selection -- */

export function select (ids, additive = false) {
  const list = Array.isArray(ids) ? ids : [ids]
  if (!additive) {
    selection.value = list
    return
  }
  const set = new Set(selection.value)
  for (const id of list) set.has(id) ? set.delete(id) : set.add(id)
  selection.value = [...set]
}

export const clearSelection = () => { selection.value = [] }
export const selectAll = () => { selection.value = Object.keys(items) }

/* ------------------------------------------------- selection commands -- */

export function deleteSelected () {
  if (selection.value.length) removeItems([...selection.value])
}

export function duplicateSelected (offset = 24) {
  const sources = selectedItems.value
  if (!sources.length) return
  const created = []
  const changes = []
  let z = nextZ()
  for (const src of sources) {
    const copy = {
      ...clone(src),
      id: uid(),
      x: src.x + offset,
      y: src.y + offset,
      z: z++,
      createdAt: Date.now(),
      updatedAt: Date.now()
    }
    items[copy.id] = copy
    queue(copy.id, copy)
    changes.push({ id: copy.id, before: null, after: clone(copy) })
    created.push(copy.id)
  }
  pushHistory(changes)
  selection.value = created
}

export function copySelected () {
  clipboard.value = selectedItems.value.map((it) => clone(it))
}

export function cutSelected () {
  copySelected()
  deleteSelected()
}

export function pasteClipboard (at) {
  if (!clipboard.value.length) return
  const b = boundsOf(clipboard.value)
  const dx = at ? at.x - b.x : 24
  const dy = at ? at.y - b.y : 24
  const changes = []
  const created = []
  let z = nextZ()
  for (const src of clipboard.value) {
    const copy = {
      ...clone(src),
      id: uid(),
      x: src.x + dx,
      y: src.y + dy,
      z: z++,
      createdAt: Date.now(),
      updatedAt: Date.now()
    }
    items[copy.id] = copy
    queue(copy.id, copy)
    changes.push({ id: copy.id, before: null, after: clone(copy) })
    created.push(copy.id)
  }
  pushHistory(changes)
  selection.value = created
}

export function bringToFront (ids = selection.value) {
  let z = nextZ()
  updateItems([...ids], () => ({ z: z++ }))
}

export function sendToBack (ids = selection.value) {
  let min = 0
  for (const it of Object.values(items)) min = Math.min(min, it.z)
  let z = min - ids.length
  updateItems([...ids], () => ({ z: z++ }))
}

export function nudgeSelected (dx, dy) {
  if (!selection.value.length) return
  updateItems([...selection.value], (it) => ({ x: it.x + dx, y: it.y + dy }))
}

export function setTool (next) {
  if (next === tool.value) return
  previousTool.value = tool.value
  tool.value = next
  if (next !== 'select') editingId.value = null
}

/* ------------------------------------------------------------ startup -- */

export async function bootstrap () {
  const list = await loadBoards()
  const preferred = localStorage.getItem('mirror:lastBoard')
  const target = list.find((b) => b.id === preferred) || list[0]
  if (target) await openBoard(target.id)
  else await createBoard('My Study Board')
}

// Never lose the last few hundred milliseconds of drawing to a closed tab.
if (typeof window !== 'undefined') {
  window.addEventListener('beforeunload', () => {
    if (!pending.size || !board.value) return
    const ops = [...pending.entries()].map(([id, item]) =>
      item ? { kind: 'upsert', item } : { kind: 'delete', id }
    )
    navigator.sendBeacon?.(
      `/api/boards/${board.value.id}/commit`,
      new Blob([JSON.stringify({ ops })], { type: 'application/json' })
    )
  })
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') flush()
  })
}
