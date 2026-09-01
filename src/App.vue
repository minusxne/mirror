<script setup>
import { computed, onBeforeUnmount, onMounted, ref, shallowRef } from 'vue'
import BoardCanvas from './components/BoardCanvas.vue'
import ToolBar from './components/ToolBar.vue'
import StylePanel from './components/StylePanel.vue'
import TopBar from './components/TopBar.vue'
import HelpDialog from './components/HelpDialog.vue'
import BoardBrowser from './components/BoardBrowser.vue'
import ContextMenu from './components/ContextMenu.vue'
import { api } from './lib/api.js'
import { TOOLS } from './lib/constants.js'
import {
  addItem,
  bootstrap,
  bringToFront,
  clearSelection,
  copySelected,
  cutSelected,
  deleteSelected,
  duplicateSelected,
  editingId,
  eraser,
  setEraser,
  flush,
  loading,
  loadBoards,
  nudgeSelected,
  openBoard,
  pasteClipboard,
  redo,
  selectAll,
  selectedItems,
  selection,
  sendToBack,
  setTool,
  setZoom,
  settings,
  tool,
  style,
  undo,
  viewport,
  viewportSize,
  zoomToFit
} from './stores/board.js'

const canvas = ref(null)
const fileInput = ref(null)
const importInput = ref(null)
const helpOpen = ref(false)
const browserOpen = ref(false)
const contextMenu = shallowRef(null)
const bootError = ref(null)
const pointer = { x: 0, y: 0 }

const TOOL_KEYS = Object.fromEntries(TOOLS.map((t) => [t.key, t.id]))

onMounted(async () => {
  try {
    await bootstrap()
  } catch (err) {
    bootError.value = err.message
  }
  window.addEventListener('keydown', onKeydown)
  window.addEventListener('paste', onPaste)
  window.addEventListener('pointermove', trackPointer, { passive: true })
  document.addEventListener('mouseleave', onWindowLeave)
  document.addEventListener('mouseenter', onWindowEnter)
})

onBeforeUnmount(() => {
  window.removeEventListener('keydown', onKeydown)
  window.removeEventListener('paste', onPaste)
  window.removeEventListener('pointermove', trackPointer)
  document.removeEventListener('mouseleave', onWindowLeave)
  document.removeEventListener('mouseenter', onWindowEnter)
})

const nearTop = ref(false)
const nearLeft = ref(false)

/**
 * How close the pointer has to get before hidden chrome slides back. Generous
 * enough to catch a deliberate move to the edge, tight enough that it stays out
 * of the way while you are drawing.
 */
const REVEAL_TOP = 64
const REVEAL_LEFT = 76

function trackPointer (event) {
  pointer.x = event.clientX
  pointer.y = event.clientY
  if (settings.autoHideTopBar) nearTop.value = event.clientY <= REVEAL_TOP
  if (settings.autoHideToolBar) nearLeft.value = event.clientX <= REVEAL_LEFT
}

/**
 * Hidden chrome is forced back into view whenever something would otherwise be
 * unreachable — a dialog is open, a menu is showing, or the pointer has left
 * the window entirely and cannot be used to summon it.
 */
const pointerAway = ref(false)

const chromeForced = computed(
  () => browserOpen.value || helpOpen.value || !!contextMenu.value || pointerAway.value
)

const topBarHidden = computed(
  () => settings.autoHideTopBar && !nearTop.value && !chromeForced.value
)
const toolBarHidden = computed(
  () => settings.autoHideToolBar && !nearLeft.value && !chromeForced.value
)

function onWindowLeave () {
  pointerAway.value = true
}
function onWindowEnter () {
  pointerAway.value = false
}

/** World coordinates of the cursor, for pasting things where you are looking. */
function pointerWorld () {
  const el = canvas.value?.surface
  if (!el) return { x: 0, y: 0 }
  const rect = el.getBoundingClientRect()
  return {
    x: (pointer.x - rect.left - viewport.x) / viewport.k,
    y: (pointer.y - rect.top - viewport.y) / viewport.k
  }
}

function centreWorld () {
  return {
    x: (viewportSize.w / 2 - viewport.x) / viewport.k,
    y: (viewportSize.h / 2 - viewport.y) / viewport.k
  }
}

/* ---------------------------------------------------------- shortcuts -- */

const isTypingIn = (el) =>
  !!el && (/^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName) || el.isContentEditable)

function onKeydown (event) {
  const mod = event.ctrlKey || event.metaKey

  if (event.key === 'Escape') {
    if (contextMenu.value) return (contextMenu.value = null)
    if (browserOpen.value) return (browserOpen.value = false)
    if (helpOpen.value) return (helpOpen.value = false)
    if (editingId.value) {
      editingId.value = null
      document.activeElement?.blur?.()
      return
    }
    clearSelection()
    setTool('select')
    return
  }

  // A dialog owns the keyboard while it is open, apart from Escape above.
  if (browserOpen.value || helpOpen.value) return

  // While typing, only the modifier combos below are ours to intercept.
  if (isTypingIn(event.target)) {
    if (mod && event.key.toLowerCase() === 's') {
      event.preventDefault()
      flush()
    }
    return
  }

  if (mod) {
    switch (event.key.toLowerCase()) {
      case 'z':
        event.preventDefault()
        event.shiftKey ? redo() : undo()
        return
      case 'y':
        event.preventDefault()
        redo()
        return
      case 'a':
        event.preventDefault()
        selectAll()
        return
      case 'b':
        event.preventDefault()
        browserOpen.value = true
        return
      case 'd':
        event.preventDefault()
        duplicateSelected()
        return
      case 'c':
        copySelected()
        return
      case 'x':
        cutSelected()
        return
      case 'v':
        // Handled by the paste listener so images and text come through too.
        return
      case 's':
        event.preventDefault()
        flush()
        return
      case '0':
        event.preventDefault()
        setZoom(1)
        return
      case '1':
        event.preventDefault()
        zoomToFit()
        return
      case '2':
        event.preventDefault()
        zoomToFit(selectedItems.value)
        return
    }
    return
  }

  if (event.altKey) return

  switch (event.key) {
    case 'Delete':
    case 'Backspace':
      event.preventDefault()
      deleteSelected()
      return
    case 'ArrowUp':
      event.preventDefault()
      nudgeSelected(0, event.shiftKey ? -10 : -1)
      return
    case 'ArrowDown':
      event.preventDefault()
      nudgeSelected(0, event.shiftKey ? 10 : 1)
      return
    case 'ArrowLeft':
      event.preventDefault()
      nudgeSelected(event.shiftKey ? -10 : -1, 0)
      return
    case 'ArrowRight':
      event.preventDefault()
      nudgeSelected(event.shiftKey ? 10 : 1, 0)
      return
    case ']':
      bringToFront()
      return
    case '[':
      sendToBack()
      return
    case '+':
    case '=':
      setZoom(viewport.k * 1.25)
      return
    case '-':
    case '_':
      setZoom(viewport.k / 1.25)
      return
    case '?':
      helpOpen.value = true
      return
  }

  const toolId = TOOL_KEYS[event.key.toLowerCase()]
  if (!toolId) return
  // Tapping E again flips the eraser between whole-object and brush.
  if (toolId === 'eraser' && tool.value === 'eraser') {
    setEraser({ mode: eraser.mode === 'brush' ? 'object' : 'brush' })
    return
  }
  setTool(toolId)
}

/* -------------------------------------------------------------- paste -- */

async function onPaste (event) {
  if (isTypingIn(event.target)) return

  const files = [...(event.clipboardData?.items || [])]
    .filter((i) => i.kind === 'file' && i.type.startsWith('image/'))
    .map((i) => i.getAsFile())
    .filter(Boolean)

  if (files.length) {
    event.preventDefault()
    for (const file of files) await insertImage(file, pointerWorld())
    return
  }

  const text = event.clipboardData?.getData('text/plain')
  if (text?.trim()) {
    event.preventDefault()
    const at = pointerWorld()
    addItem({
      type: 'text',
      x: at.x,
      y: at.y,
      w: 200,
      h: 40,
      data: { text: text.trim().slice(0, 20000), color: style.color, fontSize: style.fontSize }
    })
    return
  }

  // Nothing on the system clipboard we understand — fall back to our own.
  if (selection.value.length === 0) pasteClipboard(pointerWorld())
  else pasteClipboard()
}

const MAX_IMAGE_BYTES = 8 * 1024 * 1024

/**
 * Images are inlined as data URIs on purpose: it keeps the whole board inside
 * the single database file, so syncing it to another machine can never leave
 * pictures behind.
 */
function insertImage (file, at) {
  return new Promise((resolve) => {
    if (file.size > MAX_IMAGE_BYTES) {
      alert(`"${file.name || 'image'}" is ${(file.size / 1048576).toFixed(1)} MB. Images are stored inside the board database, so please keep them under 8 MB.`)
      return resolve()
    }
    const reader = new FileReader()
    reader.onload = () => {
      const img = new Image()
      img.onload = () => {
        const scale = Math.min(1, 520 / Math.max(img.width, img.height))
        addItem({
          type: 'image',
          x: at.x,
          y: at.y,
          w: Math.round(img.width * scale),
          h: Math.round(img.height * scale),
          data: { src: reader.result, alt: file.name || 'image' }
        })
        resolve()
      }
      img.onerror = () => resolve()
      img.src = reader.result
    }
    reader.onerror = () => resolve()
    reader.readAsDataURL(file)
  })
}

function onPickImage () {
  fileInput.value?.click()
}

async function onImageChosen (event) {
  const files = [...event.target.files]
  const at = centreWorld()
  for (let i = 0; i < files.length; i++) {
    await insertImage(files[i], { x: at.x + i * 24, y: at.y + i * 24 })
  }
  event.target.value = ''
}

/* ----------------------------------------------------- drag and drop -- */

async function onDrop (event) {
  event.preventDefault()
  const el = canvas.value?.surface
  if (!el) return
  const rect = el.getBoundingClientRect()
  const at = {
    x: (event.clientX - rect.left - viewport.x) / viewport.k,
    y: (event.clientY - rect.top - viewport.y) / viewport.k
  }
  const files = [...(event.dataTransfer?.files || [])]
  let offset = 0
  for (const file of files) {
    if (file.type.startsWith('image/')) {
      await insertImage(file, { x: at.x + offset, y: at.y + offset })
      offset += 24
    } else if (file.type === 'application/json' || file.name.endsWith('.json')) {
      await importFile(file)
    }
  }
}

/* ------------------------------------------------------ import/export -- */

function onImportClick () {
  importInput.value?.click()
}

async function importFile (file) {
  try {
    const payload = JSON.parse(await file.text())
    const { board: created } = await api.importBoard(payload)
    await loadBoards()
    await openBoard(created.id)
  } catch (err) {
    alert(`Could not import that file: ${err.message}`)
  }
}

async function onImportChosen (event) {
  const [file] = event.target.files
  if (file) await importFile(file)
  event.target.value = ''
}

function onContextMenu (payload) {
  contextMenu.value = payload
}
</script>

<template>
  <div
    class="app"
    :class="{
      'float-top': settings.autoHideTopBar,
      'float-left': settings.autoHideToolBar,
      'top-hidden': topBarHidden,
      'left-hidden': toolBarHidden
    }"
    @dragover.prevent
    @drop="onDrop"
    @pointerdown="contextMenu = null"
  >
    <TopBar @help="helpOpen = true" @import="onImportClick" @browse="browserOpen = true" />

    <main class="stage">
      <BoardCanvas ref="canvas" @context-menu="onContextMenu" />
      <ToolBar @pick-image="onPickImage" />
      <StylePanel />

      <div v-if="loading" class="veil">Opening board…</div>
      <div v-if="bootError" class="veil error">
        <strong>Could not reach the local server.</strong>
        <p>{{ bootError }}</p>
        <p class="mono">npm run dev</p>
      </div>
    </main>

    <BoardBrowser v-if="browserOpen" @close="browserOpen = false" />
    <ContextMenu v-if="contextMenu" :menu="contextMenu" @close="contextMenu = null" />
    <HelpDialog v-if="helpOpen" @close="helpOpen = false" @pick-image="helpOpen = false; onPickImage()" />

    <input
      ref="fileInput"
      type="file"
      accept="image/*"
      multiple
      class="hidden-input"
      @change="onImageChosen"
    />
    <input
      ref="importInput"
      type="file"
      accept="application/json,.json"
      class="hidden-input"
      @change="onImportChosen"
    />
  </div>
</template>

<style scoped>
.app {
  position: fixed;
  inset: 0;
  display: flex;
  flex-direction: column;
  background: var(--bg);
}

/* ------------------------------------------------------- auto-hide chrome --
   When a bar can hide, it is lifted out of the layout first. Sliding an
   in-flow element would resize the canvas underneath it and shove the whole
   board sideways every time the pointer neared an edge. */
.app.float-top :deep(.topbar) {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  /* Floating over the canvas rather than sitting above it, so it needs a real
     shadow instead of the inset hairline that separates it in normal layout. */
  box-shadow: var(--shadow-lg);
  transition: transform 0.18s ease, opacity 0.18s ease;
}
.app.top-hidden :deep(.topbar) {
  transform: translateY(-100%);
  opacity: 0;
  pointer-events: none;
}

.app.float-left :deep(.toolbar),
.app.float-left :deep(.style-panel) {
  transition: transform 0.18s ease, opacity 0.18s ease;
}
.app.left-hidden :deep(.toolbar) {
  transform: translateY(-50%) translateX(calc(-100% - 16px));
  opacity: 0;
  pointer-events: none;
}
.app.left-hidden :deep(.style-panel) {
  transform: translateY(-50%) translateX(calc(-100% - 80px));
  opacity: 0;
  pointer-events: none;
}


.stage {
  position: relative;
  flex: 1;
  min-height: 0;
}

.veil {
  position: absolute;
  inset: 0;
  display: grid;
  place-content: center;
  justify-items: center;
  gap: 6px;
  background: color-mix(in srgb, var(--bg) 80%, transparent);
  color: var(--muted);
  font-size: 13px;
  z-index: 50;
  text-align: center;
}
.veil.error {
  color: var(--text);
}
.veil p {
  margin: 0;
  font-size: 12.5px;
  color: var(--muted);
  max-width: 40ch;
}
.veil .mono {
  font-family: var(--mono);
  background: var(--chip);
  border: 1px solid var(--border);
  border-radius: 6px;
  padding: 5px 10px;
  margin-top: 4px;
}

.hidden-input {
  display: none;
}
</style>
