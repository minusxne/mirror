<script setup>
import Icon from './Icon.vue'
import { TOOLS } from '../lib/constants.js'
import { setTool, tool } from '../stores/board.js'

const emit = defineEmits(['pick-image'])

const GROUPS = [
  ['select', 'hand'],
  ['pen', 'marker', 'eraser'],
  ['sticky', 'text'],
  ['math', 'calc', 'plot'],
  ['rect', 'ellipse', 'diamond', 'line', 'arrow']
]

const byId = Object.fromEntries(TOOLS.map((t) => [t.id, t]))
</script>

<template>
  <div class="toolbar" role="toolbar" aria-label="Board tools">
    <template v-for="(group, gi) in GROUPS" :key="gi">
      <div v-if="gi > 0" class="divider" />
      <button
        v-for="id in group"
        :key="id"
        class="tool"
        :class="{ active: tool === id }"
        :title="`${byId[id].label}  (${byId[id].key.toUpperCase()})${byId[id].hint ? ' — ' + byId[id].hint : ''}`"
        :aria-label="byId[id].label"
        :aria-pressed="tool === id"
        @click="setTool(id)"
      >
        <Icon :name="byId[id].icon" :size="19" />
        <span class="key">{{ byId[id].key.toUpperCase() }}</span>
      </button>
    </template>

    <div class="divider" />
    <button class="tool" title="Insert an image  (or just paste one)" aria-label="Insert image" @click="emit('pick-image')">
      <Icon name="image" :size="19" />
    </button>
  </div>
</template>

<style scoped>
.toolbar {
  position: absolute;
  left: 12px;
  top: 50%;
  transform: translateY(-50%);
  display: flex;
  flex-direction: column;
  gap: 2px;
  padding: 5px;
  background: var(--panel);
  border: 1px solid var(--border);
  border-radius: 12px;
  box-shadow: var(--shadow-lg);
  z-index: 20;
  /* Relative to the stage, not the window — the stage is already shorter by the
     top bar, and a viewport-based cap silently clipped tools off the bottom. */
  max-height: calc(100% - 24px);
  overflow-y: auto;
}

.tool {
  position: relative;
  width: 34px;
  height: 34px;
  display: flex;
  align-items: center;
  justify-content: center;
  flex: none;
  border: none;
  border-radius: 8px;
  background: transparent;
  color: var(--muted);
  cursor: pointer;
  transition: background 0.12s, color 0.12s;
}
.tool:hover {
  background: var(--chip);
  color: var(--text);
}
.tool.active {
  background: var(--accent-soft);
  color: var(--accent);
}

.key {
  position: absolute;
  right: 4px;
  bottom: 3px;
  font-size: 9px;
  line-height: 1;
  color: var(--faint);
  font-weight: 600;
  pointer-events: none;
}
.tool.active .key {
  color: var(--accent);
  opacity: 0.7;
}

.divider {
  height: 1px;
  background: var(--border);
  margin: 3px 6px;
  flex: none;
}
</style>
