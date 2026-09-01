<script setup>
import Icon from './Icon.vue'
import { SMOOTHING_OPTIONS } from '../lib/smoothing.js'
import { resetSettings, setSetting, settings } from '../stores/board.js'

defineEmits(['close'])

const TOGGLES = [
  {
    key: 'autoHideTopBar',
    label: 'Hide the top bar',
    hint: 'It slides away and comes back when the pointer nears the top of the screen.'
  },
  {
    key: 'autoHideToolBar',
    label: 'Hide the tool bar',
    hint: 'Same, for the tools down the left edge. Keyboard shortcuts keep working.'
  },
  {
    key: 'rightClickPan',
    label: 'Right-drag pans the canvas',
    hint: 'Hold the right button and drag to move around. A right click without dragging still opens the menu.'
  }
]
</script>

<template>
  <div class="settings" @pointerdown.stop>
    <div class="head"><span>Settings</span></div>

    <section>
      <span class="label">Pen smoothing</span>
      <div class="segmented">
        <button
          v-for="o in SMOOTHING_OPTIONS"
          :key="o.id"
          :class="{ on: settings.smoothing === o.id }"
          :title="o.hint"
          @click="setSetting('smoothing', o.id)"
        >{{ o.label }}</button>
      </div>
      <p class="hint">
        {{ SMOOTHING_OPTIONS.find(o => o.id === settings.smoothing)?.hint }}
      </p>
    </section>

    <hr />

    <section class="toggles">
      <label v-for="t in TOGGLES" :key="t.key" class="toggle">
        <input
          type="checkbox"
          :checked="settings[t.key]"
          @change="setSetting(t.key, $event.target.checked)"
        />
        <span class="switch" aria-hidden="true"><span class="knob" /></span>
        <span class="text">
          <span class="toggle-label">{{ t.label }}</span>
          <span class="toggle-hint">{{ t.hint }}</span>
        </span>
      </label>
    </section>

    <hr />

    <button class="reset" @click="resetSettings">
      <Icon name="undo" :size="13" /> Reset to defaults
    </button>
  </div>
</template>

<style scoped>
.settings {
  width: 320px;
  display: flex;
  flex-direction: column;
  gap: 10px;
}
.head {
  font-size: 10px;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  color: var(--faint);
  font-weight: 600;
  padding: 2px 4px 0;
}
section {
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding: 0 4px;
}
.label {
  font-size: 10px;
  line-height: 14px;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  color: var(--faint);
  font-weight: 600;
}
hr {
  border: none;
  border-top: 1px solid var(--border);
  margin: 0;
}

.segmented {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 3px;
  padding: 3px;
  background: var(--chip);
  border-radius: 8px;
}
.segmented button {
  border: none;
  background: transparent;
  color: var(--muted);
  font: inherit;
  font-size: 11.5px;
  line-height: 16px;
  padding: 4px 0;
  border-radius: 6px;
  cursor: pointer;
}
.segmented button:hover {
  color: var(--text);
}
.segmented button.on {
  background: var(--panel);
  color: var(--accent);
  box-shadow: var(--shadow-md);
}
.hint {
  margin: 0;
  font-size: 11px;
  line-height: 1.45;
  color: var(--faint);
  min-height: 16px;
}

.toggles {
  gap: 10px;
}
.toggle {
  display: grid;
  grid-template-columns: auto 1fr;
  gap: 9px;
  align-items: start;
  cursor: pointer;
}
.toggle input {
  position: absolute;
  opacity: 0;
  width: 0;
  height: 0;
}
.switch {
  width: 30px;
  height: 18px;
  border-radius: 9px;
  background: var(--chip);
  border: 1px solid var(--border);
  position: relative;
  transition: background 0.14s, border-color 0.14s;
  margin-top: 1px;
  flex: none;
}
.knob {
  position: absolute;
  top: 2px;
  left: 2px;
  width: 12px;
  height: 12px;
  border-radius: 50%;
  background: var(--muted);
  transition: transform 0.14s, background 0.14s;
}
.toggle input:checked + .switch {
  background: var(--accent-soft);
  border-color: var(--accent);
}
.toggle input:checked + .switch .knob {
  transform: translateX(12px);
  background: var(--accent);
}
.toggle input:focus-visible + .switch {
  outline: 2px solid var(--accent);
  outline-offset: 2px;
}
.text {
  display: flex;
  flex-direction: column;
  gap: 2px;
}
.toggle-label {
  font-size: 12.5px;
  line-height: 16px;
  color: var(--text);
}
.toggle-hint {
  font-size: 11px;
  line-height: 1.45;
  color: var(--faint);
}

.reset {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 5px;
  border: 1px solid var(--border);
  background: var(--panel);
  color: var(--muted);
  border-radius: 7px;
  font: inherit;
  font-size: 11.5px;
  line-height: 16px;
  padding: 5px 8px;
  cursor: pointer;
}
.reset:hover {
  color: var(--text);
  border-color: var(--muted);
}
</style>
