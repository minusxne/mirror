<script setup>
/**
 * A small looping animation showing how one tool is used.
 *
 * Every demo is plain SVG driven by CSS keyframes — no canvas, no library, no
 * recorded video to keep in sync with the app. A shared "ghost pointer" traces
 * the gesture while the tool's result appears underneath it, so the shape of
 * the interaction is legible at a glance rather than described in a paragraph.
 */
defineProps({
  tool: { type: String, required: true }
})
</script>

<template>
  <div class="demo" :key="tool">
    <svg viewBox="0 0 260 140" role="img" :aria-label="`${tool} demonstration`">
      <rect class="paper" x="0" y="0" width="260" height="140" rx="8" />

      <!-- ---------------------------------------------------- select -- -->
      <g v-if="tool === 'select'">
        <rect class="obj" x="58" y="44" width="66" height="46" rx="4" />
        <rect class="obj alt" x="146" y="58" width="52" height="36" rx="4" />
        <rect class="marquee" x="46" y="34" width="164" height="70" rx="3" />
        <g class="handles">
          <rect v-for="(h, i) in [[46,34],[210,34],[46,104],[210,104]]" :key="i"
                :x="h[0] - 4" :y="h[1] - 4" width="8" height="8" rx="2" class="handle" />
        </g>
        <circle class="ghost path-select" r="6" />
      </g>

      <!-- ------------------------------------------------------ hand -- -->
      <g v-else-if="tool === 'hand'">
        <g class="pan-group">
          <circle v-for="i in 40" :key="i" class="dot"
                  :cx="20 + ((i - 1) % 8) * 32" :cy="16 + Math.floor((i - 1) / 8) * 28" r="1.6" />
          <rect class="obj" x="70" y="44" width="60" height="42" rx="4" />
        </g>
        <circle class="ghost path-pan" r="6" />
      </g>

      <!-- ------------------------------------------------ pen / marker -- -->
      <g v-else-if="tool === 'pen' || tool === 'marker'">
        <path v-if="tool === 'marker'" class="ink marker-ink"
              d="M40 78 C 80 62, 120 92, 160 74 S 214 60, 224 70" />
        <path v-else class="ink pen-ink"
              d="M36 92 C 58 40, 78 108, 100 62 S 138 44, 156 76 S 196 96, 224 54" />
        <circle class="ghost" :class="tool === 'marker' ? 'path-marker' : 'path-pen'" r="6" />
        <text v-if="tool === 'marker'" class="under" x="44" y="84">highlight the important bit</text>
      </g>

      <!-- ---------------------------------------------------- eraser -- -->
      <g v-else-if="tool === 'eraser'">
        <path class="ink split-left" d="M30 70 C 60 50, 84 88, 108 70" />
        <path class="ink split-right" d="M152 70 C 176 52, 200 88, 230 66" />
        <path class="ink split-middle" d="M108 70 C 122 62, 138 78, 152 70" />
        <circle class="brush-ring erase-sweep" r="17" />
        <circle class="ghost path-erase" r="6" />
      </g>

      <!-- ---------------------------------------------------- sticky -- -->
      <g v-else-if="tool === 'sticky'">
        <g class="pop">
          <rect class="note" x="82" y="30" width="92" height="80" rx="3" />
          <rect class="note-line" x="92" y="46" width="60" height="5" rx="2.5" />
          <rect class="note-line" x="92" y="58" width="72" height="5" rx="2.5" />
          <rect class="note-line" x="92" y="70" width="44" height="5" rx="2.5" />
        </g>
        <circle class="ghost path-click" r="6" />
      </g>

      <!-- ------------------------------------------------------ text -- -->
      <g v-else-if="tool === 'text'">
        <rect class="caret" x="64" y="56" width="2" height="26" />
        <g class="typed">
          <rect v-for="(w, i) in [26, 40, 18, 34]" :key="i" class="note-line"
                :x="70 + [0, 30, 74, 96][i]" y="66" :width="w" height="6" rx="3"
                :style="{ animationDelay: `${0.5 + i * 0.35}s` }" />
        </g>
        <circle class="ghost path-click" r="6" />
      </g>

      <!-- --------------------------------------------------- formula -- *-->
      <g v-else-if="tool === 'math'">
        <text class="latex" x="130" y="52">\\frac{-b \\pm \\sqrt{b^2-4ac}}{2a}</text>
        <g class="reveal">
          <text class="formula" x="130" y="100">x =</text>
          <line class="frac" x1="118" y1="98" x2="196" y2="98" />
          <text class="formula small" x="157" y="92">−b ± √(b²−4ac)</text>
          <text class="formula small" x="157" y="114">2a</text>
        </g>
      </g>

      <!-- ------------------------------------------------ calculator -- -->
      <g v-else-if="tool === 'calc'">
        <rect class="card" x="34" y="24" width="192" height="92" rx="6" />
        <line class="divider" x1="34" y1="42" x2="226" y2="42" />
        <g v-for="(row, i) in [['r = 4', '4'], ['pi r^2', '50.265'], ['ans / 2', '25.133']]"
           :key="i" class="calc-row" :style="{ animationDelay: `${0.4 + i * 0.55}s` }">
          <text class="code" x="44" :y="60 + i * 20">{{ row[0] }}</text>
          <text class="result" x="216" :y="60 + i * 20">{{ row[1] }}</text>
        </g>
      </g>

      <!-- ------------------------------------------------------ plot -- -->
      <g v-else-if="tool === 'plot'">
        <rect class="card" x="34" y="18" width="192" height="104" rx="6" />
        <line class="axis" x1="44" y1="70" x2="216" y2="70" />
        <line class="axis" x1="130" y1="26" x2="130" y2="114" />
        <path class="curve" d="M46 112 C 82 112, 100 28, 130 28 S 178 112, 214 112" />
        <text class="code small-label" x="44" y="34">y = x²</text>
      </g>

      <!-- ------------------------------------------- shapes and lines -- -->
      <g v-else-if="['rect', 'ellipse', 'diamond'].includes(tool)">
        <rect v-if="tool === 'rect'" class="obj drawn" x="70" y="38" width="120" height="64" rx="4" />
        <ellipse v-else-if="tool === 'ellipse'" class="obj drawn" cx="130" cy="70" rx="60" ry="32" />
        <polygon v-else class="obj drawn" points="130,38 190,70 130,102 70,70" />
        <rect class="drag-box" x="70" y="38" width="120" height="64" />
        <circle class="ghost path-drag" r="6" />
      </g>

      <g v-else-if="tool === 'line' || tool === 'arrow'">
        <line class="ink drawn-line" x1="52" y1="98" x2="204" y2="46" />
        <polygon v-if="tool === 'arrow'" class="arrow-head" points="204,46 190,48 195,60" />
        <circle class="ghost path-drag-line" r="6" />
      </g>

      <!-- ----------------------------------------------------- image -- -->
      <g v-else-if="tool === 'image'">
        <g class="pop">
          <rect class="card" x="74" y="30" width="112" height="80" rx="5" />
          <circle class="sun" cx="102" cy="52" r="8" />
          <path class="hill" d="M80 104 L110 72 L134 96 L152 80 L180 104 Z" />
        </g>
        <text class="under" x="130" y="128">paste, or drop a file</text>
      </g>

      <!-- --------------------------------------------------- fallback -- -->
      <g v-else>
        <rect class="obj" x="86" y="46" width="88" height="48" rx="5" />
      </g>
    </svg>
  </div>
</template>

<style scoped>
.demo {
  width: 100%;
  border-radius: 9px;
  overflow: hidden;
  background: var(--canvas);
  border: 1px solid var(--border);
}
svg {
  display: block;
  width: 100%;
  height: auto;
}

.paper { fill: transparent; }
.dot { fill: var(--grid); }

.obj {
  fill: none;
  stroke: var(--accent);
  stroke-width: 2;
}
.obj.alt { stroke: #8e4ec6; }

.ink {
  fill: none;
  stroke: var(--text);
  stroke-width: 3;
  stroke-linecap: round;
  stroke-linejoin: round;
}

.under {
  fill: var(--faint);
  font-family: var(--sans);
  font-size: 11px;
  text-anchor: middle;
}
.demo text.under:not([text-anchor]) { text-anchor: start; }

/* the ghost pointer that traces each gesture */
.ghost {
  fill: var(--accent);
  opacity: 0.85;
  stroke: var(--panel);
  stroke-width: 2;
}

/* ------------------------------------------------------------- select -- */
.marquee {
  fill: color-mix(in srgb, var(--accent) 10%, transparent);
  stroke: var(--accent);
  stroke-width: 1;
  stroke-dasharray: 4 3;
  opacity: 0;
  animation: fade-in-out 4s ease-in-out infinite;
}
.handle {
  fill: var(--panel);
  stroke: var(--accent);
  stroke-width: 1.5;
  opacity: 0;
  animation: fade-in-hold 4s ease-in-out infinite;
}
.path-select {
  offset-path: path('M 30 24 L 46 34 L 210 104 L 150 118');
  animation: travel 4s ease-in-out infinite;
}

/* --------------------------------------------------------------- hand -- */
.pan-group { animation: pan 4s ease-in-out infinite; }
.path-pan {
  offset-path: path('M 180 40 L 90 100');
  animation: travel 4s ease-in-out infinite;
}

/* ---------------------------------------------------------- pen ink -- */
.pen-ink {
  stroke-dasharray: 340;
  stroke-dashoffset: 340;
  animation: draw 4s ease-in-out infinite;
}
.path-pen {
  offset-path: path('M36 92 C 58 40, 78 108, 100 62 S 138 44, 156 76 S 196 96, 224 54');
  animation: trace 4s ease-in-out infinite;
}
.marker-ink {
  stroke: #ffe066;
  stroke-width: 17;
  opacity: 0.55;
  mix-blend-mode: multiply;
  stroke-dasharray: 220;
  stroke-dashoffset: 220;
  animation: draw 4s ease-in-out infinite;
}
.path-marker {
  offset-path: path('M40 78 C 80 62, 120 92, 160 74 S 214 60, 224 70');
  animation: trace 4s ease-in-out infinite;
}

/* ------------------------------------------------------------ eraser -- */
.split-left, .split-right { stroke-dasharray: none; }
.split-middle { animation: erase-away 4s ease-in-out infinite; }
.brush-ring {
  fill: color-mix(in srgb, var(--accent) 10%, transparent);
  stroke: var(--accent);
  stroke-width: 1.5;
  stroke-dasharray: 3 3;
  offset-path: path('M 130 30 L 130 110');
  animation: travel 4s ease-in-out infinite;
}
.path-erase {
  offset-path: path('M 130 30 L 130 110');
  animation: travel 4s ease-in-out infinite;
}

/* ------------------------------------------------------ sticky / text -- */
.note {
  fill: #fff3a3;
  animation: pop-in 4s ease-in-out infinite;
}
.note-line {
  fill: rgba(31, 41, 51, 0.35);
  animation: pop-in 4s ease-in-out infinite;
}
.pop { animation: pop-in 4s ease-in-out infinite; }
.path-click {
  offset-path: path('M 40 118 L 128 70');
  animation: travel-tap 4s ease-in-out infinite;
}
.caret {
  fill: var(--accent);
  animation: blink 1s steps(2) infinite;
}
.typed .note-line { animation: type-in 4s ease-in-out infinite; }

/* ----------------------------------------------------------- formula -- */
.latex {
  fill: var(--faint);
  font-family: var(--mono);
  font-size: 11px;
  text-anchor: middle;
  animation: fade-in-out 4s ease-in-out infinite;
}
.reveal { animation: pop-in 4s ease-in-out infinite; }
.formula {
  fill: var(--text);
  font-family: 'Times New Roman', serif;
  font-size: 19px;
  font-style: italic;
  text-anchor: end;
}
.formula.small { font-size: 14px; text-anchor: middle; }
.frac { stroke: var(--text); stroke-width: 1.4; }

/* -------------------------------------------------------- calc / plot -- */
.card {
  fill: var(--panel);
  stroke: var(--border);
  stroke-width: 1;
}
.divider { stroke: var(--border); stroke-width: 1; }
.calc-row { opacity: 0; animation: row-in 4s ease-in-out infinite; }
.code {
  fill: var(--text);
  font-family: var(--mono);
  font-size: 12px;
}
.code.small-label { font-size: 11px; fill: var(--muted); }
.result {
  fill: var(--accent);
  font-family: var(--mono);
  font-size: 12px;
  text-anchor: end;
}
.axis { stroke: var(--plot-axis); stroke-width: 1.2; }
.curve {
  fill: none;
  stroke: #0091ff;
  stroke-width: 2.5;
  stroke-linecap: round;
  stroke-dasharray: 260;
  stroke-dashoffset: 260;
  animation: draw 4s ease-in-out infinite;
}

/* ------------------------------------------------------------- shapes -- */
.drawn { animation: grow 4s ease-in-out infinite; }
.drag-box {
  fill: none;
  stroke: var(--faint);
  stroke-width: 1;
  stroke-dasharray: 3 3;
  opacity: 0;
  animation: fade-in-out 4s ease-in-out infinite;
}
.path-drag {
  offset-path: path('M 70 38 L 190 102');
  animation: travel 4s ease-in-out infinite;
}
.drawn-line {
  stroke-dasharray: 170;
  stroke-dashoffset: 170;
  animation: draw 4s ease-in-out infinite;
}
.arrow-head {
  fill: var(--text);
  animation: pop-in 4s ease-in-out infinite;
}
.path-drag-line {
  offset-path: path('M 52 98 L 204 46');
  animation: travel 4s ease-in-out infinite;
}

/* -------------------------------------------------------------- image -- */
.sun { fill: #ffb224; }
.hill { fill: var(--accent); opacity: 0.55; }

/* ---------------------------------------------------------- keyframes -- */
@keyframes travel {
  0%, 8%   { offset-distance: 0%;   opacity: 0; }
  14%      { opacity: 0.85; }
  70%      { offset-distance: 100%; opacity: 0.85; }
  86%, 100%{ offset-distance: 100%; opacity: 0; }
}
@keyframes travel-tap {
  0%, 6%    { offset-distance: 0%;   opacity: 0; }
  12%       { opacity: 0.85; }
  40%, 62%  { offset-distance: 100%; opacity: 0.85; }
  76%, 100% { offset-distance: 100%; opacity: 0; }
}
@keyframes trace {
  0%, 8%    { offset-distance: 0%; opacity: 0; }
  14%       { opacity: 0.85; }
  72%       { offset-distance: 100%; opacity: 0.85; }
  88%, 100% { offset-distance: 100%; opacity: 0; }
}
@keyframes draw {
  0%, 8%    { stroke-dashoffset: var(--len, 340); }
  72%, 88%  { stroke-dashoffset: 0; }
  96%, 100% { stroke-dashoffset: 0; opacity: 0; }
}
@keyframes pan {
  0%, 10%   { transform: translate(0, 0); }
  70%, 84%  { transform: translate(-56px, 38px); }
  96%, 100% { transform: translate(0, 0); }
}
@keyframes pop-in {
  0%, 38%   { opacity: 0; transform: scale(0.9); transform-origin: center; }
  50%, 88%  { opacity: 1; transform: scale(1); }
  96%, 100% { opacity: 0; }
}
@keyframes fade-in-out {
  0%, 12%   { opacity: 0; }
  30%, 78%  { opacity: 1; }
  92%, 100% { opacity: 0; }
}
@keyframes fade-in-hold {
  0%, 60%   { opacity: 0; }
  72%, 90%  { opacity: 1; }
  98%, 100% { opacity: 0; }
}
@keyframes type-in {
  0%, 10%   { opacity: 0; }
  22%, 88%  { opacity: 1; }
  96%, 100% { opacity: 0; }
}
@keyframes row-in {
  0%, 8%    { opacity: 0; transform: translateY(4px); }
  20%, 88%  { opacity: 1; transform: translateY(0); }
  96%, 100% { opacity: 0; }
}
@keyframes erase-away {
  0%, 44%   { opacity: 1; }
  56%, 100% { opacity: 0; }
}
@keyframes grow {
  0%, 8%    { transform: scale(0.05); transform-origin: 70px 38px; opacity: 0; }
  16%       { opacity: 1; }
  70%, 88%  { transform: scale(1); transform-origin: 70px 38px; opacity: 1; }
  96%, 100% { opacity: 0; }
}
@keyframes blink {
  0%, 50%  { opacity: 1; }
  51%, 100%{ opacity: 0; }
}

@media (prefers-reduced-motion: reduce) {
  .demo * {
    animation: none !important;
    opacity: 1 !important;
    stroke-dashoffset: 0 !important;
    transform: none !important;
  }
  .ghost { opacity: 0.4 !important; }
}
</style>
