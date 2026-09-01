<script setup>
import { computed } from 'vue'
import {
  bringToFront,
  copySelected,
  cutSelected,
  deleteSelected,
  duplicateSelected,
  pasteClipboard,
  clipboard,
  selection,
  selectAll,
  sendToBack,
  zoomToFit,
  selectedItems
} from '../stores/board.js'

const props = defineProps({
  menu: { type: Object, required: true }
})
const emit = defineEmits(['close'])

const hasSelection = computed(() => selection.value.length > 0)

const style = computed(() => ({
  left: `${Math.min(props.menu.x, window.innerWidth - 200)}px`,
  top: `${Math.min(props.menu.y, window.innerHeight - 260)}px`
}))

function run (fn) {
  fn()
  emit('close')
}
</script>

<template>
  <div class="menu" :style="style" @pointerdown.stop @contextmenu.prevent>
    <template v-if="hasSelection">
      <button @click="run(duplicateSelected)">Duplicate<kbd>Ctrl D</kbd></button>
      <button @click="run(copySelected)">Copy<kbd>Ctrl C</kbd></button>
      <button @click="run(cutSelected)">Cut<kbd>Ctrl X</kbd></button>
      <hr />
      <button @click="run(bringToFront)">Bring to front<kbd>]</kbd></button>
      <button @click="run(sendToBack)">Send to back<kbd>[</kbd></button>
      <hr />
      <button @click="run(() => zoomToFit(selectedItems))">Zoom to selection<kbd>Ctrl 2</kbd></button>
      <hr />
      <button class="danger" @click="run(deleteSelected)">Delete<kbd>Del</kbd></button>
    </template>
    <template v-else>
      <button :disabled="!clipboard.length" @click="run(() => pasteClipboard(menu.world))">
        Paste here<kbd>Ctrl V</kbd>
      </button>
      <button @click="run(selectAll)">Select all<kbd>Ctrl A</kbd></button>
      <hr />
      <button @click="run(() => zoomToFit())">Fit everything<kbd>Ctrl 1</kbd></button>
    </template>
  </div>
</template>

<style scoped>
.menu {
  position: fixed;
  min-width: 190px;
  background: var(--panel);
  border: 1px solid var(--border);
  border-radius: 10px;
  box-shadow: var(--shadow-lg);
  padding: 5px;
  z-index: 90;
  display: flex;
  flex-direction: column;
}
button {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  border: none;
  background: transparent;
  color: var(--text);
  font: inherit;
  font-size: 12.5px;
  text-align: left;
  padding: 6px 9px;
  border-radius: 6px;
  cursor: pointer;
}
button:hover:not(:disabled) {
  background: var(--chip);
}
button:disabled {
  color: var(--faint);
  cursor: default;
}
button.danger:hover {
  background: color-mix(in srgb, #e5484d 12%, transparent);
  color: #e5484d;
}
kbd {
  font-family: var(--mono);
  font-size: 10px;
  color: var(--faint);
}
hr {
  border: none;
  border-top: 1px solid var(--border);
  margin: 4px 6px;
}
</style>
