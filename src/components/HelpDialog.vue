<script setup>
import { computed, ref } from 'vue'
import Icon from './Icon.vue'
import GuideDemo from './GuideDemo.vue'
import { SHORTCUT_GROUPS, TOOL_GUIDE } from '../lib/guide.js'
import { TOOLS } from '../lib/constants.js'
import { setTool } from '../stores/board.js'

const emit = defineEmits(['close', 'pick-image'])

const SECTIONS = [
  { id: 'start', label: 'Getting started', icon: 'sparkle' },
  ...TOOL_GUIDE.map((t) => ({ id: t.id, label: t.title, icon: iconFor(t.id), tool: true })),
  { id: 'boards', label: 'Boards & groups', icon: 'boards' },
  { id: 'sync', label: 'Two computers', icon: 'sync' },
  { id: 'shortcuts', label: 'All shortcuts', icon: 'keyboard' }
]

function iconFor (id) {
  const t = TOOLS.find((x) => x.id === id)
  if (t) return t.icon
  return id === 'image' ? 'image' : 'rect'
}

const active = ref('start')
const current = computed(() => TOOL_GUIDE.find((t) => t.id === active.value) || null)

/** Close the guide and switch to the tool being described, ready to use. */
function tryTool (id) {
  setTool(id)
  emit('close')
}
</script>

<template>
  <div class="scrim" @click.self="emit('close')">
    <div class="dialog" role="dialog" aria-label="Guide">
      <header>
        <div class="head-title">
          <Icon name="help" :size="17" />
          <h2>Guide</h2>
        </div>
        <button class="icon-btn" aria-label="Close" @click="emit('close')">
          <Icon name="close" :size="18" />
        </button>
      </header>

      <div class="body">
        <nav aria-label="Guide sections">
          <button
            v-for="s in SECTIONS"
            :key="s.id"
            class="nav-item"
            :class="{ on: active === s.id }"
            @click="active = s.id"
          >
            <Icon :name="s.icon" :size="15" />
            <span>{{ s.label }}</span>
          </button>
        </nav>

        <div class="content">
          <!-- ------------------------------------------------ a tool -- -->
          <article v-if="current" :key="current.id">
            <div class="tool-head">
              <div>
                <h3>{{ current.title }}</h3>
                <p class="blurb">{{ current.blurb }}</p>
              </div>
              <span v-if="current.key" class="keys">
                <kbd v-for="k in current.key.split(' ')" :key="k">{{ k }}</kbd>
              </span>
            </div>

            <GuideDemo :tool="current.id" />

            <section>
              <h4>How to use it</h4>
              <ol>
                <li v-for="(step, i) in current.steps" :key="i">{{ step }}</li>
              </ol>
            </section>

            <section v-if="current.tips?.length">
              <h4>Worth knowing</h4>
              <ul>
                <li v-for="(tip, i) in current.tips" :key="i">{{ tip }}</li>
              </ul>
            </section>

            <button v-if="current.id === 'image'" class="try" @click="emit('pick-image')">
              <Icon name="image" :size="13" /> Choose an image…
            </button>
            <button v-else class="try" @click="tryTool(current.id)">
              <Icon name="play" :size="13" /> Try {{ current.title.toLowerCase() }} now
            </button>
          </article>

          <!-- ------------------------------------------ getting started -- -->
          <article v-else-if="active === 'start'">
            <h3>An infinite board for studying</h3>
            <p class="blurb">
              Write, draw, stick notes, typeset formulas, work through calculations and graph
              functions — all on one endless canvas. Everything is stored on this machine, in a
              single file, and nothing is sent anywhere.
            </p>

            <section>
              <h4>The three things to know first</h4>
              <ol>
                <li>Pick a tool from the bar on the left, or press its letter — <kbd>P</kbd> for the pen, <kbd>N</kbd> for a note.</li>
                <li>Scroll to move around, <kbd>Ctrl</kbd>+scroll to zoom. <kbd>Ctrl</kbd>+<kbd>1</kbd> fits everything back on screen when you get lost.</li>
                <li>Nothing needs saving. Every change is written to the board file as you make it.</li>
              </ol>
            </section>

            <section>
              <h4>Where to go next</h4>
              <ul>
                <li>Pick any tool on the left of this dialog to see what it does and how.</li>
                <li><kbd>Ctrl</kbd>+<kbd>B</kbd> opens the board browser, where boards live in groups.</li>
                <li>The gear in the top bar hides the panels, changes pen smoothing, and turns on right-drag panning.</li>
              </ul>
            </section>
          </article>

          <!-- --------------------------------------------- boards -- -->
          <article v-else-if="active === 'boards'">
            <h3>Boards and groups</h3>
            <p class="blurb">
              A board is one canvas. You can have as many as you like, filed into groups.
            </p>
            <section>
              <h4>How to use it</h4>
              <ol>
                <li>Press <kbd>Ctrl</kbd>+<kbd>B</kbd>, or click the boards button beside the logo.</li>
                <li>Every board shows a live thumbnail, so you can find one by what is on it.</li>
                <li>Drag a tile onto a group to file it there. Click a name to rename it.</li>
                <li>Search when the list gets long; collapse groups you are not using.</li>
              </ol>
            </section>
            <section>
              <h4>Worth knowing</h4>
              <ul>
                <li>Deleting a group never deletes boards — they fall back to Ungrouped.</li>
                <li>Moving a board between groups does not count as editing it, so it will not confuse the sync tool about which machine is newer.</li>
                <li>Any board can be exported to JSON on its own and imported elsewhere.</li>
              </ul>
            </section>
          </article>

          <!-- ----------------------------------------------- syncing -- -->
          <article v-else-if="active === 'sync'">
            <h3>Working on two computers</h3>
            <p class="blurb">
              Your whole board library is one file — <code>data/study-board.db</code> — so moving
              your work to the laptop is copying that file. A script does it over your network.
            </p>
            <section>
              <h4>How to use it</h4>
              <ol>
                <li>In a terminal, in the project folder, run <code>./sync.sh</code>.</li>
                <li>The first time, it walks you through adding your other computer.</li>
                <li>After that, pick <em>send</em> before you leave and <em>fetch</em> when you get back.</li>
              </ol>
            </section>
            <pre class="cmd">./sync.sh                    <span class="c"># the menu — no flags to remember</span>
./sync.sh push laptop        <span class="c"># send your boards there</span>
./sync.sh pull laptop        <span class="c"># bring theirs back here</span></pre>
            <section>
              <h4>Worth knowing</h4>
              <ul>
                <li>It refuses to overwrite a machine that has newer work, and backs up whatever it replaces.</li>
                <li>This is a copy, not a merge — whichever side you copy <em>from</em> wins. Close the board on the receiving machine first.</li>
                <li>The board file is gitignored, so <code>git push</code> never uploads your notes.</li>
              </ul>
            </section>
          </article>

          <!-- --------------------------------------------- shortcuts -- -->
          <article v-else-if="active === 'shortcuts'">
            <h3>Every shortcut</h3>
            <div class="shortcut-columns">
              <section v-for="s in SHORTCUT_GROUPS" :key="s.group">
                <h4>{{ s.group }}</h4>
                <dl>
                  <template v-for="[key, what] in s.keys" :key="key">
                    <dt><kbd>{{ key }}</kbd></dt>
                    <dd>{{ what }}</dd>
                  </template>
                </dl>
              </section>
            </div>
          </article>
        </div>
      </div>
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
.dialog {
  width: min(920px, 100%);
  height: min(84vh, 720px);
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
  padding: 12px 14px;
  border-bottom: 1px solid var(--border);
  flex: none;
}
.head-title {
  display: flex;
  align-items: center;
  gap: 8px;
  color: var(--muted);
}
h2 {
  margin: 0;
  font-size: 15px;
  line-height: 20px;
  font-weight: 650;
  color: var(--text);
}
.icon-btn {
  border: none;
  background: transparent;
  color: var(--muted);
  cursor: pointer;
  border-radius: 6px;
  width: 28px;
  height: 28px;
  display: flex;
  align-items: center;
  justify-content: center;
}
.icon-btn:hover {
  background: var(--chip);
  color: var(--text);
}

.body {
  flex: 1;
  min-height: 0;
  display: grid;
  grid-template-columns: 188px 1fr;
}

/* ------------------------------------------------------------------ nav -- */
nav {
  border-right: 1px solid var(--border);
  padding: 8px;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: 1px;
  background: var(--bg);
}
.nav-item {
  display: flex;
  align-items: center;
  gap: 9px;
  width: 100%;
  border: none;
  background: transparent;
  color: var(--muted);
  font: inherit;
  font-size: 12.5px;
  line-height: 16px;
  text-align: left;
  padding: 7px 9px;
  border-radius: 7px;
  cursor: pointer;
  flex: none;
}
.nav-item:hover {
  background: var(--chip);
  color: var(--text);
}
.nav-item.on {
  background: var(--accent-soft);
  color: var(--accent);
  font-weight: 550;
}

/* -------------------------------------------------------------- content -- */
.content {
  overflow-y: auto;
  padding: 18px 22px 24px;
}
article {
  display: flex;
  flex-direction: column;
  gap: 16px;
  max-width: 62ch;
}
.tool-head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 16px;
}
.tool-head > div {
  display: flex;
  flex-direction: column;
  gap: 5px;
}
h3 {
  margin: 0;
  font-size: 17px;
  line-height: 22px;
  font-weight: 650;
  color: var(--text);
}
.blurb {
  margin: 0;
  font-size: 13px;
  line-height: 1.6;
  color: var(--muted);
}
.keys {
  display: flex;
  gap: 4px;
  flex: none;
}

section {
  display: flex;
  flex-direction: column;
  gap: 7px;
}
h4 {
  margin: 0;
  font-size: 10px;
  line-height: 14px;
  text-transform: uppercase;
  letter-spacing: 0.07em;
  color: var(--faint);
  font-weight: 700;
}
ol,
ul {
  margin: 0;
  padding-left: 20px;
  display: flex;
  flex-direction: column;
  gap: 6px;
}
li {
  font-size: 13px;
  line-height: 1.6;
  color: var(--muted);
}
li::marker {
  color: var(--faint);
}

kbd {
  font-family: var(--mono);
  font-size: 10.5px;
  line-height: 14px;
  background: var(--chip);
  border: 1px solid var(--border);
  border-bottom-width: 2px;
  border-radius: 5px;
  padding: 1px 5px;
  color: var(--text);
  white-space: nowrap;
}
code {
  font-family: var(--mono);
  font-size: 11.5px;
  background: var(--chip);
  border-radius: 4px;
  padding: 1px 5px;
  color: var(--text);
}
.cmd {
  font-family: var(--mono);
  font-size: 11.5px;
  line-height: 1.7;
  background: var(--chip);
  border: 1px solid var(--border);
  border-radius: 8px;
  padding: 12px 14px;
  margin: 0;
  overflow-x: auto;
  color: var(--text);
}
.cmd .c {
  color: var(--faint);
}

.try {
  align-self: flex-start;
  display: inline-flex;
  align-items: center;
  gap: 6px;
  border: 1px solid var(--accent);
  background: var(--accent-soft);
  color: var(--accent);
  border-radius: 8px;
  font: inherit;
  font-size: 12.5px;
  line-height: 16px;
  padding: 7px 12px;
  cursor: pointer;
}
.try:hover {
  background: var(--accent);
  color: #fff;
}

.shortcut-columns {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(230px, 1fr));
  gap: 22px;
}
dl {
  display: grid;
  grid-template-columns: auto 1fr;
  gap: 5px 12px;
  margin: 0;
  align-items: baseline;
}
dt {
  text-align: right;
}
dd {
  margin: 0;
  font-size: 12.5px;
  line-height: 16px;
  color: var(--muted);
}

@media (max-width: 720px) {
  .body {
    grid-template-columns: 1fr;
    grid-template-rows: auto 1fr;
  }
  nav {
    border-right: none;
    border-bottom: 1px solid var(--border);
    flex-direction: row;
    overflow-x: auto;
    gap: 4px;
  }
  .nav-item span {
    white-space: nowrap;
  }
}
</style>
