<script setup>
import Icon from './Icon.vue'

defineEmits(['close'])

const SHORTCUTS = [
  {
    group: 'Tools',
    keys: [
      ['V', 'Select'],
      ['H', 'Pan'],
      ['P', 'Pen'],
      ['M', 'Highlighter'],
      ['E', 'Eraser'],
      ['N', 'Sticky note'],
      ['T', 'Text'],
      ['F', 'Formula (LaTeX)'],
      ['C', 'Calculator'],
      ['G', 'Graph'],
      ['R / O / D', 'Rectangle / ellipse / diamond'],
      ['L / A', 'Line / arrow']
    ]
  },
  {
    group: 'Canvas',
    keys: [
      ['Scroll', 'Pan up and down'],
      ['Shift + scroll', 'Pan sideways'],
      ['Ctrl + scroll', 'Zoom to cursor'],
      ['Space + drag', 'Pan from any tool'],
      ['Middle-drag', 'Pan'],
      ['Ctrl + 0', 'Zoom to 100%'],
      ['Ctrl + 1', 'Fit everything on screen'],
      ['Ctrl + 2', 'Zoom to selection'],
      ['+ / −', 'Zoom in / out']
    ]
  },
  {
    group: 'Editing',
    keys: [
      ['Double-click', 'Edit an item, or make text on empty canvas'],
      ['Drag', 'Move the selection'],
      ['Shift + drag', 'Constrain to one axis'],
      ['Shift + resize', 'Keep proportions'],
      ['Alt + resize', 'Resize around the centre'],
      ['Shift + click', 'Add to / remove from the selection'],
      ['Ctrl + A', 'Select everything'],
      ['Ctrl + D', 'Duplicate'],
      ['Ctrl + C / X / V', 'Copy / cut / paste'],
      ['Delete', 'Delete the selection'],
      ['Arrow keys', 'Nudge by 1 (Shift for 10)'],
      ['[ / ]', 'Send to back / bring to front'],
      ['Ctrl + Z', 'Undo'],
      ['Ctrl + Shift + Z', 'Redo'],
      ['Ctrl + S', 'Force a save now'],
      ['Esc', 'Finish editing / clear the selection']
    ]
  }
]

const CALC_EXAMPLES = [
  ['r = 4', 'name a value'],
  ['area = pi r^2', 'implicit multiplication works'],
  ['area / 2', 'plain expressions'],
  ['ans * 3', '`ans` is the previous line'],
  ['sqrt(2) + 5!', 'functions and factorials'],
  ['sin(30)', 'switch DEG/RAD on the note'],
  ['150 + 10%', 'percentages'],
  ['# a comment', 'ignored']
]
</script>

<template>
  <div class="scrim" @click.self="$emit('close')">
    <div class="dialog" role="dialog" aria-label="Help">
      <header>
        <h2>Mirror — help</h2>
        <button class="icon-btn" aria-label="Close" @click="$emit('close')">
          <Icon name="close" :size="18" />
        </button>
      </header>

      <div class="body">
        <section class="intro">
          <p>
            An infinite board for studying: write, draw, stick notes, typeset formulas, work
            through calculations and graph functions. Everything is stored on this machine, in
            one SQLite file.
          </p>
        </section>

        <div class="columns">
          <section v-for="s in SHORTCUTS" :key="s.group">
            <h3>{{ s.group }}</h3>
            <dl>
              <template v-for="[key, what] in s.keys" :key="key">
                <dt><kbd>{{ key }}</kbd></dt>
                <dd>{{ what }}</dd>
              </template>
            </dl>
          </section>
        </div>

        <section>
          <h3>Maths tools</h3>
          <p class="lede">
            <strong>Formula</strong> (F) typesets LaTeX with KaTeX — double-click to edit the
            source. <strong>Graph</strong> (G) plots one or more <code>y = f(x)</code> curves.
            <strong>Calculator</strong> (C) is a running sheet:
          </p>
          <dl class="examples">
            <template v-for="[code, what] in CALC_EXAMPLES" :key="code">
              <dt><code>{{ code }}</code></dt>
              <dd>{{ what }}</dd>
            </template>
          </dl>
          <p class="lede">
            Functions: <code>sqrt cbrt root abs sign exp ln log log2 sin cos tan asin acos atan
            atan2 sinh cosh tanh floor ceil round min max hypot gcd lcm ncr npr sum mean fact</code>.
            Constants: <code>pi tau e phi</code>.
          </p>
        </section>

        <section>
          <h3>Moving the board between machines</h3>
          <p class="lede">
            The board is one file — <code>data/study-board.db</code> — and it is gitignored, so
            <code>git clone</code> gives you the app without anyone's notes. To carry the notes
            themselves across your network, use the sync tool over scp:
          </p>
          <pre class="cmd">node tools/db-sync.mjs init                <span class="c"># first time: create sync.config.json</span>
node tools/db-sync.mjs add laptop \
  --host you@laptop.local --path ~/Repos/mirror

node tools/db-sync.mjs status laptop      <span class="c"># who has the newer work?</span>
node tools/db-sync.mjs push laptop        <span class="c"># send this board over there</span>
node tools/db-sync.mjs pull laptop        <span class="c"># bring theirs back here</span>

node tools/db-sync.mjs help               <span class="c"># every command and flag</span>
node tools/db-sync.mjs help push          <span class="c"># detail on one command</span></pre>
          <p class="lede">
            It refuses to overwrite a side that has newer edits unless you pass
            <code>--force</code>, and it backs up whatever it replaces into
            <code>.db-backups/</code>. Close the app on the receiving machine first — this is a
            copy, not a merge, so whichever side you copy <em>from</em> wins.
          </p>
        </section>
      </div>
    </div>
  </div>
</template>

<style scoped>
.scrim {
  position: fixed;
  inset: 0;
  background: rgba(15, 23, 42, 0.4);
  backdrop-filter: blur(2px);
  display: grid;
  place-items: center;
  z-index: 100;
  padding: 24px;
}
.dialog {
  width: min(880px, 100%);
  max-height: min(86vh, 900px);
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
  padding: 14px 16px;
  border-bottom: 1px solid var(--border);
  flex: none;
}
h2 {
  margin: 0;
  font-size: 15px;
  font-weight: 650;
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
.body {
  padding: 16px;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: 22px;
}
.intro p {
  margin: 0;
  font-size: 13px;
  color: var(--muted);
  line-height: 1.6;
  max-width: 68ch;
}
.columns {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(240px, 1fr));
  gap: 22px;
}
h3 {
  margin: 0 0 8px;
  font-size: 10px;
  text-transform: uppercase;
  letter-spacing: 0.07em;
  color: var(--faint);
  font-weight: 700;
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
  color: var(--muted);
}
kbd {
  font-family: var(--mono);
  font-size: 10.5px;
  background: var(--chip);
  border: 1px solid var(--border);
  border-bottom-width: 2px;
  border-radius: 5px;
  padding: 1px 5px;
  color: var(--text);
  white-space: nowrap;
}
.examples dt {
  text-align: left;
}
.examples code,
.lede code {
  font-family: var(--mono);
  font-size: 11.5px;
  background: var(--chip);
  border-radius: 4px;
  padding: 1px 5px;
  color: var(--text);
}
.lede {
  margin: 0 0 10px;
  font-size: 12.5px;
  color: var(--muted);
  line-height: 1.65;
  max-width: 76ch;
}
.cmd {
  font-family: var(--mono);
  font-size: 11.5px;
  line-height: 1.65;
  background: var(--chip);
  border: 1px solid var(--border);
  border-radius: 8px;
  padding: 12px 14px;
  margin: 0 0 10px;
  overflow-x: auto;
  color: var(--text);
}
.cmd .c {
  color: var(--faint);
}
</style>
