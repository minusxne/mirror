<script setup>
/**
 * A small looping animation showing how one tool is used.
 *
 * Every demo is plain SVG driven by CSS keyframes — no canvas, no library, no
 * recorded video to keep in sync with the app. A shared "ghost pointer" traces
 * the gesture while the tool's result appears underneath it, so the shape of
 * the interaction is legible at a glance rather than described in a paragraph.
 *
 * The timeline is the same everywhere: settle until 10%, act until 68%, hold
 * the result, then fade out and loop. Keeping the ink and the pointer on
 * identical percentages is what makes the pointer sit exactly on the tip of
 * whatever is being drawn.
 */
defineProps({
  tool: { type: String, required: true }
})

/** A grid that overruns the frame, so panning never exposes an empty edge. */
const GRID = []
for (let y = -20; y <= 168; y += 22) {
  for (let x = -20; x <= 296; x += 24) GRID.push([x, y])
}

/** y = x², sampled — an upward parabola with its vertex on the origin. */
const PARABOLA = (() => {
  const cx = 130
  const cy = 102
  const a = 66 / 74 ** 2 // arms top out at y = 36, clear of the card edge
  const pts = []
  for (let x = 56; x <= 204; x += 8) {
    pts.push([x, +(cy - a * (x - cx) ** 2).toFixed(1)])
  }
  return pts.map((p) => p.join(',')).join(' ')
})()
</script>

<template>
  <div class="demo" :key="tool">
    <svg viewBox="0 0 260 140" role="img" :aria-label="`${tool} demonstration`">
      <!-- ------------------------------------------------------ select -- -->
      <g v-if="tool === 'select'">
        <rect class="obj" x="60" y="46" width="64" height="44" rx="4" />
        <rect class="obj alt" x="144" y="58" width="50" height="34" rx="4" />
        <rect class="marquee" x="48" y="36" width="158" height="66" rx="2" />
        <g class="handles">
          <rect
            v-for="(h, i) in [[48, 36], [206, 36], [48, 102], [206, 102]]"
            :key="i"
            :x="h[0] - 3.5" :y="h[1] - 3.5" width="7" height="7" rx="1.5" class="handle"
          />
        </g>
        <circle class="ghost trace-select" r="5.5" />
      </g>

      <!-- --------------------------------------------------------- pan -- -->
      <g v-else-if="tool === 'hand'">
        <g class="pan-group">
          <circle v-for="(d, i) in GRID" :key="i" class="dot" :cx="d[0]" :cy="d[1]" r="1.5" />
          <rect class="obj" x="98" y="30" width="62" height="42" rx="4" />
          <rect class="note-mini" x="176" y="54" width="44" height="32" rx="3" />
        </g>
        <circle class="ghost trace-pan" r="5.5" />
      </g>

      <!-- --------------------------------------------------------- pen -- -->
      <g v-else-if="tool === 'pen'">
        <path class="ink pen-ink" d="M36 96 C 58 44, 78 110, 100 64 S 138 46, 156 78 S 196 98, 224 52" />
        <circle class="ghost trace-pen" r="5.5" />
      </g>

      <!-- ------------------------------------------------- highlighter -- -->
      <g v-else-if="tool === 'marker'">
        <!-- Text first, band over it: the point of a highlighter is that what
             is underneath stays readable. -->
        <text class="body-text" x="130" y="62" text-anchor="middle">the derivative of a</text>
        <text class="body-text" x="130" y="84" text-anchor="middle">product is not the product</text>
        <path class="marker-ink" d="M52 78 C 96 74, 150 82, 208 77" />
        <circle class="ghost trace-marker" r="5.5" />
      </g>

      <!-- ------------------------------------------------------ eraser -- -->
      <g v-else-if="tool === 'eraser'">
        <path class="ink" d="M26 66 C 52 44, 74 86, 100 68" />
        <path class="ink erased" d="M100 68 C 116 57, 134 77, 150 68" />
        <path class="ink" d="M150 68 C 178 50, 202 88, 234 62" />
        <circle class="brush-ring sweep" r="18" />
        <circle class="ghost sweep" r="5.5" />
      </g>

      <!-- ------------------------------------------------ sticky note -- -->
      <g v-else-if="tool === 'sticky'">
        <g class="pop">
          <rect class="note" x="84" y="28" width="92" height="84" rx="3" />
          <rect class="note-line" x="94" y="44" width="62" height="5" rx="2.5" />
          <rect class="note-line" x="94" y="57" width="72" height="5" rx="2.5" />
          <rect class="note-line" x="94" y="70" width="48" height="5" rx="2.5" />
        </g>
        <circle class="ghost tap" r="5.5" />
      </g>

      <!-- -------------------------------------------------------- text -- -->
      <g v-else-if="tool === 'text'">
        <g class="typed">
          <text
            v-for="(w, i) in [['Chapter', 46], ['3', 106], ['—', 120], ['eigenvalues', 140]]"
            :key="i"
            :class="`word word-${i + 1}`"
            :x="w[1]"
            y="76"
          >{{ w[0] }}</text>
        </g>
        <rect class="caret" x="46" y="62" width="2" height="19" />
        <circle class="ghost tap-text" r="5.5" />
      </g>

      <!-- ----------------------------------------------------- formula -- -->
      <g v-else-if="tool === 'math'">
        <text class="source" x="130" y="36" text-anchor="middle">\frac{-b \pm \sqrt{b^2-4ac}}{2a}</text>
        <g class="pop">
          <text class="formula" x="84" y="88" text-anchor="end">x =</text>
          <text class="formula num" x="154" y="80" text-anchor="middle">−b ± √(b²− 4ac)</text>
          <line class="frac" x1="96" y1="88" x2="212" y2="88" />
          <text class="formula num" x="154" y="106" text-anchor="middle">2a</text>
        </g>
      </g>

      <!-- -------------------------------------------------- calculator -- -->
      <g v-else-if="tool === 'calc'">
        <rect class="card" x="30" y="22" width="200" height="96" rx="6" />
        <text class="card-label" x="42" y="40">WORKING</text>
        <line class="divider" x1="30" y1="48" x2="230" y2="48" />
        <g
          v-for="(row, i) in [['r = 4', '4'], ['pi r^2', '50.265'], ['ans / 2', '25.133']]"
          :key="i"
          :class="`calc-row row-${i + 1}`"
        >
          <text class="code" x="42" :y="68 + i * 20">{{ row[0] }}</text>
          <text class="result" x="218" :y="68 + i * 20" text-anchor="end">{{ row[1] }}</text>
        </g>
      </g>

      <!-- -------------------------------------------------------- plot -- -->
      <g v-else-if="tool === 'plot'">
        <rect class="card" x="30" y="16" width="200" height="108" rx="6" />
        <line class="axis" x1="40" y1="104" x2="220" y2="104" />
        <line class="axis" x1="130" y1="24" x2="130" y2="112" />
        <polyline class="curve" :points="PARABOLA" />
        <text class="code axis-label" x="42" y="118">y = x²</text>
      </g>

      <!-- ------------------------------------------------------ shapes -- -->
      <g v-else-if="tool === 'rect'">
        <rect class="shape-grow" x="66" y="38" rx="4" />
        <circle class="ghost trace-drag" r="5.5" />
        <g class="hints">
          <ellipse class="obj hint" cx="212" cy="52" rx="20" ry="13" />
          <polygon class="obj hint" points="212,84 232,102 212,120 192,102" />
        </g>
      </g>

      <!-- ---------------------------------------------- line and arrow -- -->
      <g v-else-if="tool === 'line'">
        <line class="ink line-draw" x1="48" y1="102" x2="190" y2="46.6" />
        <!-- Tip on the line extended, back corners swept 0.45 rad either side
             of its bearing, so the head points where the line actually goes. -->
        <polygon class="arrow-head" points="201,42.3 188.2,56.0 182.4,41.1" />
        <circle class="ghost trace-line" r="5.5" />
      </g>

      <!-- ------------------------------------------------------- image -- -->
      <g v-else-if="tool === 'image'">
        <g class="pop">
          <rect class="photo" x="72" y="26" width="116" height="82" rx="5" />
          <circle class="sun" cx="100" cy="48" r="8" />
          <path class="hill" d="M78 102 L110 68 L134 92 L152 76 L182 102 Z" />
        </g>
        <text class="caption" x="130" y="126" text-anchor="middle">paste, or drop a file</text>
      </g>

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

/* ------------------------------------------------------------ primitives -- */
.dot { fill: var(--grid); }

.obj {
  fill: none;
  stroke: var(--accent);
  stroke-width: 2;
}
.obj.alt { stroke: #8e4ec6; }
.obj.hint { opacity: 0.32; }

.ink {
  fill: none;
  stroke: var(--text);
  stroke-width: 3;
  stroke-linecap: round;
  stroke-linejoin: round;
}

.body-text {
  fill: var(--text);
  font-family: var(--sans);
  font-size: 12px;
}
.caption {
  fill: var(--faint);
  font-family: var(--sans);
  font-size: 11px;
}

.ghost {
  fill: var(--accent);
  stroke: var(--panel);
  stroke-width: 2;
}

.card,
.photo {
  fill: var(--panel);
  stroke: var(--border);
  stroke-width: 1;
}
.card-label {
  fill: var(--faint);
  font-family: var(--sans);
  font-size: 8px;
  font-weight: 700;
  letter-spacing: 0.08em;
}
.divider { stroke: var(--border); stroke-width: 1; }

/* ---------------------------------------------------------------- select -- */
.marquee {
  fill: color-mix(in srgb, var(--accent) 11%, transparent);
  stroke: var(--accent);
  stroke-width: 1;
  stroke-dasharray: 4 3;
  animation: fade-mid 4s ease-in-out infinite;
}
.handle {
  fill: var(--panel);
  stroke: var(--accent);
  stroke-width: 1.5;
  animation: fade-late 4s ease-in-out infinite;
}
.trace-select {
  offset-path: path('M 26 22 L 48 36 L 206 102 L 152 122');
  animation: trace 4s ease-in-out infinite;
}

/* ------------------------------------------------------------------- pan -- */
.pan-group { animation: pan 4s ease-in-out infinite; }
.note-mini {
  fill: #ffe9a8;
  stroke: #e8c96a;
  stroke-width: 1;
}
.trace-pan {
  offset-path: path('M 198 40 L 144 74');
  animation: trace 4s ease-in-out infinite;
}

/* ------------------------------------------------------------------- pen -- */
.pen-ink {
  stroke-dasharray: 360;
  animation: draw-360 4s ease-in-out infinite;
}
.trace-pen {
  offset-path: path('M36 96 C 58 44, 78 110, 100 64 S 138 46, 156 78 S 196 98, 224 52');
  animation: trace 4s ease-in-out infinite;
}

/* ----------------------------------------------------------- highlighter -- */
.marker-ink {
  fill: none;
  stroke: #ffd43b;
  stroke-width: 20;
  stroke-linecap: round;
  /* Deliberately not mix-blend-mode: multiply. On the board that blend is what
     keeps words legible under a highlight, but against a dark canvas it turns
     the stroke black — so the demo uses plain transparency instead, which
     reads the same way in either theme. */
  opacity: 0.42;
  stroke-dasharray: 170;
  animation: draw-170 4s ease-in-out infinite;
}
.trace-marker {
  offset-path: path('M52 78 C 96 74, 150 82, 208 77');
  animation: trace 4s ease-in-out infinite;
}

/* ---------------------------------------------------------------- eraser -- */
.erased { animation: rub-out 4s ease-in-out infinite; }
.brush-ring {
  fill: color-mix(in srgb, var(--accent) 12%, transparent);
  stroke: var(--accent);
  stroke-width: 1.5;
  stroke-dasharray: 3 3;
}
.sweep {
  offset-path: path('M 125 28 L 125 108');
  animation: trace 4s ease-in-out infinite;
}

/* ----------------------------------------------------------------- notes -- */
.note { fill: #ffe9a8; }
.note-line { fill: rgba(31, 41, 51, 0.32); }
.pop { animation: pop 4s ease-in-out infinite; }
.tap {
  offset-path: path('M 34 122 L 130 70');
  animation: tap 4s ease-in-out infinite;
}
/* Text is placed from its left edge, so the pointer settles there rather than
   parking on top of the words it just typed. */
.tap-text {
  offset-path: path('M 34 120 L 44 90');
  animation: tap 4s ease-in-out infinite;
}

/* ------------------------------------------------------------------ text -- */
.word {
  fill: var(--text);
  font-family: var(--sans);
  font-size: 15px;
  opacity: 0;
}
/* Staggered by keyframe rather than animation-delay. A delay offsets an
   infinite animation's whole cycle, so delayed elements would fade out after
   the rest of the demo had already looped. */
.word-1 { animation: word-1 4s ease-in-out infinite; }
.word-2 { animation: word-2 4s ease-in-out infinite; }
.word-3 { animation: word-3 4s ease-in-out infinite; }
.word-4 { animation: word-4 4s ease-in-out infinite; }
.caret {
  fill: var(--accent);
  /* Steps rather than a slide: a caret jumps to the end of each word as it
     lands, it does not glide there. */
  animation: caret 4s steps(1, end) infinite;
}

/* --------------------------------------------------------------- formula -- */
.source {
  fill: var(--faint);
  font-family: var(--mono);
  font-size: 10px;
  animation: fade-mid 4s ease-in-out infinite;
}
.formula {
  fill: var(--text);
  font-family: 'Times New Roman', Times, serif;
  font-size: 20px;
  font-style: italic;
}
.formula.num { font-size: 14px; }
.frac { stroke: var(--text); stroke-width: 1.3; }

/* ------------------------------------------------------------ calc / plot -- */
.calc-row { opacity: 0; }
.row-1 { animation: row-1 4s ease-in-out infinite; }
.row-2 { animation: row-2 4s ease-in-out infinite; }
.row-3 { animation: row-3 4s ease-in-out infinite; }
.code {
  fill: var(--text);
  font-family: var(--mono);
  font-size: 12px;
}
.result {
  fill: var(--accent);
  font-family: var(--mono);
  font-size: 12px;
}
.axis-label { font-size: 11px; fill: var(--muted); }
.axis { stroke: var(--plot-axis); stroke-width: 1.2; }
.curve {
  fill: none;
  stroke: #0091ff;
  stroke-width: 2.5;
  stroke-linecap: round;
  stroke-linejoin: round;
  stroke-dasharray: 300;
  animation: draw-300 4s ease-in-out infinite;
}

/* ---------------------------------------------------------------- shapes -- */
.shape-grow {
  fill: color-mix(in srgb, var(--accent) 9%, transparent);
  stroke: var(--accent);
  stroke-width: 2;
  width: 0;
  height: 0;
  animation: shape-grow 4s ease-in-out infinite;
}
.trace-drag {
  offset-path: path('M 66 38 L 178 100');
  animation: trace 4s ease-in-out infinite;
}
.hints { animation: fade-late 4s ease-in-out infinite; }

/* ------------------------------------------------------------------ line -- */
.line-draw {
  stroke-dasharray: 160;
  animation: draw-160 4s ease-in-out infinite;
}
.arrow-head {
  fill: var(--text);
  animation: fade-late 4s ease-in-out infinite;
}
.trace-line {
  offset-path: path('M 48 102 L 196 44');
  animation: trace 4s ease-in-out infinite;
}

/* ----------------------------------------------------------------- image -- */
.sun { fill: #ffb224; }
.hill { fill: var(--accent); opacity: 0.5; }

/* ------------------------------------------------------------- keyframes --
   Every keyframe block states opacity at each stop. Naming it only in the
   final stop would make the browser synthesise a 0% keyframe from the base
   value and fade the whole animation out across its entire length — which is
   exactly how the ink used to end up washed out halfway through. */

@keyframes trace {
  0%   { offset-distance: 0%;   opacity: 0; }
  10%  { offset-distance: 0%;   opacity: 1; }
  68%  { offset-distance: 100%; opacity: 1; }
  90%  { offset-distance: 100%; opacity: 1; }
  100% { offset-distance: 100%; opacity: 0; }
}

@keyframes tap {
  0%   { offset-distance: 0%;   opacity: 0; }
  10%  { offset-distance: 0%;   opacity: 1; }
  34%  { offset-distance: 100%; opacity: 1; }
  90%  { offset-distance: 100%; opacity: 1; }
  100% { offset-distance: 100%; opacity: 0; }
}

@keyframes draw-360 {
  0%, 10%  { stroke-dashoffset: 360px; opacity: 1; }
  68%, 90% { stroke-dashoffset: 0;     opacity: 1; }
  100%     { stroke-dashoffset: 0;     opacity: 0; }
}
@keyframes draw-300 {
  0%, 10%  { stroke-dashoffset: 300px; opacity: 1; }
  68%, 90% { stroke-dashoffset: 0;     opacity: 1; }
  100%     { stroke-dashoffset: 0;     opacity: 0; }
}
@keyframes draw-170 {
  0%, 10%  { stroke-dashoffset: 170px; opacity: 0.42; }
  68%, 90% { stroke-dashoffset: 0;     opacity: 0.42; }
  100%     { stroke-dashoffset: 0;     opacity: 0; }
}
@keyframes draw-160 {
  0%, 10%  { stroke-dashoffset: 160px; opacity: 1; }
  68%, 90% { stroke-dashoffset: 0;     opacity: 1; }
  100%     { stroke-dashoffset: 0;     opacity: 0; }
}

@keyframes pan {
  0%, 10%  { transform: translate(0, 0); }
  68%, 90% { transform: translate(-54px, 34px); }
  100%     { transform: translate(0, 0); }
}

@keyframes pop {
  0%, 26%  { opacity: 0; transform: scale(0.94); transform-origin: center; }
  40%, 90% { opacity: 1; transform: scale(1);    transform-origin: center; }
  100%     { opacity: 0; transform: scale(1);    transform-origin: center; }
}

/* Appears partway through and holds — marquees, LaTeX source. */
@keyframes fade-mid {
  0%, 12%  { opacity: 0; }
  28%, 90% { opacity: 1; }
  100%     { opacity: 0; }
}

/* Appears only once the gesture has finished — handles, arrowheads. */
@keyframes fade-late {
  0%, 62%  { opacity: 0; }
  74%, 90% { opacity: 1; }
  100%     { opacity: 0; }
}

@keyframes rub-out {
  0%, 40%  { opacity: 1; }
  54%, 90% { opacity: 0; }
  100%     { opacity: 0; }
}

@keyframes word-1 { 0%, 13% { opacity: 0; } 16%, 90% { opacity: 1; } 100% { opacity: 0; } }
@keyframes word-2 { 0%, 21% { opacity: 0; } 24%, 90% { opacity: 1; } 100% { opacity: 0; } }
@keyframes word-3 { 0%, 28% { opacity: 0; } 31%, 90% { opacity: 1; } 100% { opacity: 0; } }
@keyframes word-4 { 0%, 36% { opacity: 0; } 39%, 90% { opacity: 1; } 100% { opacity: 0; } }

/* x tracks the end of whatever has been typed so far — the word reveals are
   delayed 0.6s apart on a 4s loop, i.e. every 7.5%. */
@keyframes caret {
  0%, 13%  { x: 46px;  opacity: 0; }
  15%      { x: 46px;  opacity: 1; }
  23%      { x: 110px; opacity: 1; }
  30%      { x: 118px; opacity: 1; }
  38%      { x: 137px; opacity: 1; }
  45%, 90% { x: 222px; opacity: 1; }
  100%     { x: 222px; opacity: 0; }
}

@keyframes row-1 { 0%, 12% { opacity: 0; } 16%, 90% { opacity: 1; } 100% { opacity: 0; } }
@keyframes row-2 { 0%, 24% { opacity: 0; } 28%, 90% { opacity: 1; } 100% { opacity: 0; } }
@keyframes row-3 { 0%, 36% { opacity: 0; } 40%, 90% { opacity: 1; } 100% { opacity: 0; } }

@keyframes shape-grow {
  0%, 10%  { width: 0;     height: 0;    opacity: 1; }
  68%, 90% { width: 112px; height: 62px; opacity: 1; }
  100%     { width: 112px; height: 62px; opacity: 0; }
}

@media (prefers-reduced-motion: reduce) {
  .demo * {
    animation: none !important;
    opacity: 1 !important;
    stroke-dashoffset: 0 !important;
    transform: none !important;
  }
  .ghost { opacity: 0.45 !important; }
  .erased { opacity: 0 !important; }
  .word, .calc-row { opacity: 1 !important; }
  .shape-grow { width: 112px !important; height: 62px !important; }
  .marker-ink { opacity: 0.42 !important; }
}
</style>
