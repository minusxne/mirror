# Mirror

An infinite study board — a local-first take on Miro. Write, draw, stick notes,
typeset formulas, work through calculations and graph functions on one endless
canvas.

Everything lives in a single SQLite file on your own machine. Nothing is sent
anywhere. When you want to carry your work from the PC to the laptop, a bundled
tool copies that one file across your network over `scp`.

```bash
npm install
npm run dev          # → http://localhost:5173
```

---

## Why it is built this way

- **One file holds everything.** Boards, strokes, notes, formulas and pasted
  images all live in `data/study-board.db`. Moving your work between machines is
  moving one file — which is exactly what `tools/db-sync.mjs` does.
- **No native modules.** It uses `node:sqlite`, built into Node 22.5+. Clone the
  repo anywhere, `npm install`, and it runs — nothing to compile, so a laptop
  with a different CPU or OS is not a problem.
- **The database is gitignored.** `git clone` gives you the app. Your notes stay
  yours and travel separately.
- **Fully offline.** KaTeX and its fonts are bundled; the maths engine is written
  from scratch rather than pulled from npm. No request ever leaves the machine.

## Requirements

Node 22.5 or newer (for `node:sqlite`), and `ssh`/`scp` if you want to sync
between machines.

## Running it

```bash
npm run dev      # Vite on :5173 + API on :5174, with hot reload
npm run serve    # build once, then serve the whole app from :5174
npm start        # serve an existing build
```

`npm run serve` is the better one for daily use — a single process, one URL.

The server binds to `127.0.0.1` by default. To reach the board from your phone
or another machine on the LAN:

```bash
HOST=0.0.0.0 npm run serve
```

---

## The board

| | |
|---|---|
| **Select** `V` | Move, resize, multi-select, marquee |
| **Pan** `H` | Or hold space, or middle-drag, from any tool |
| **Pen** `P` | Freehand, smoothed and simplified |
| **Highlighter** `M` | Wide translucent stroke that multiplies over what is under it |
| **Eraser** `E` | Two modes — see below |
| **Sticky note** `N` | Auto-shrinking text, eight colours |
| **Text** `T` | Plain text that grows to fit |
| **Formula** `F` | LaTeX, typeset live with KaTeX |
| **Calculator** `C` | A running sheet with variables and `ans` |
| **Graph** `G` | Plot one or more `y = f(x)` curves |
| **Shapes** `R` `O` `D` `L` `A` | Rectangle, ellipse, diamond, line, arrow |
| **Images** | Paste from the clipboard or drop a file on the canvas |

Press `?` in the app for the full shortcut list.

Scroll to pan, `Ctrl`+scroll to zoom at the cursor, `Ctrl+1` to fit everything.
Undo/redo covers every edit, including multi-item drags and eraser sweeps.

### The two erasers

**Object** mode removes whole things — a note, a shape, a formula, an entire stroke —
the moment you touch them.

**Brush** mode rubs out only the ink you paint over. Drag through the middle of a pen
line and it becomes two lines with a gap exactly where the brush went; the stroke is
resampled and split rather than deleted. Brush size is adjustable, and the sweep shows a
ring so you can see what you are about to remove.

Switch modes in the panel beside the toolbar, or tap `E` again while the eraser is
already selected. The choice is remembered between sessions.

The brush works on pen and highlighter ink. Sticky notes, shapes and formulas are
objects rather than ink — there is no meaningful "half a sticky note" — so the brush
leaves them alone and Object mode handles them. Either way, one sweep is one undo.

### The maths tools

The **calculator** evaluates line by line, carrying variables forward:

```
r = 4
area = pi r^2        →  50.26548246
area / 2             →  25.13274123
ans + 10%            →  27.64601535
sqrt(2) + 5!         →  121.4142136
```

Implicit multiplication (`2pi`, `3(x+1)`), factorials, percentages
(`150 + 10%` is 165, `200 * 10%` is 20), a DEG/RAD toggle, `#` comments, and
`ans` for the previous line. Functions: `sqrt cbrt root abs sign exp ln log
log2 sin cos tan asin acos atan atan2 sinh cosh tanh floor ceil round min max
hypot gcd lcm ncr npr sum mean fact`. Constants: `pi tau e phi`.

The **graph** tool uses the same engine, so anything the calculator understands
can be plotted. It breaks curves at asymptotes rather than drawing a vertical
line through them.

The expression parser is hand-written — no `eval` — so a board full of formulas
can never execute code.

### Boards and groups

`Ctrl+B` opens the board browser: every board as a live thumbnail, filed into
groups you create. Drag a tile onto a group to move it, click a name to rename
it, search when the list gets long, and collapse groups you are not using —
collapsed state is remembered.

Deleting a group never deletes boards; they fall back to *Ungrouped*.

Thumbnails are drawn from a compact summary the server builds on demand rather
than from the boards themselves — a 900-stroke board is a 68 KB preview instead
of a 1.4 MB download, so opening the browser stays instant however much you have
drawn. Boards larger than that are represented by their most prominent items,
and the tile says so.

Groups live in the same database as everything else, so they travel with your
work when you sync.

### Export and import

Any board can be exported to JSON and imported again (or dropped onto the
canvas), which is handy for sharing a single board without handing over your
whole database.

---

## Moving your work between machines

The board is one file, so syncing is a file copy. `tools/db-sync.mjs` wraps that
copy with the parts you would otherwise get wrong: a consistent snapshot, a
backup of whatever it is about to overwrite, an atomic swap on the far side, and
a refusal to clobber newer work.

```bash
node tools/db-sync.mjs help          # every command, with examples
node tools/db-sync.mjs help push     # detail on one command
```

### First time, on each machine

```bash
# 1. clone and install (on both the PC and the laptop)
git clone <your-repo> mirror && cd mirror && npm install

# 2. create the local sync config
node tools/db-sync.mjs init

# 3. tell it about the *other* machine
node tools/db-sync.mjs add laptop \
  --host you@laptop.local \
  --path ~/Repos/mirror

# 4. check it can reach it
node tools/db-sync.mjs status laptop
```

`sync.config.json` is gitignored and per-machine: on the PC it points at the
laptop, on the laptop it points back at the PC.

### Day to day

```bash
node tools/db-sync.mjs status laptop   # who has the newer work?
node tools/db-sync.mjs push laptop     # send this machine's board over there
node tools/db-sync.mjs pull laptop     # bring theirs back here
```

`status` tells you which side is ahead, so you rarely have to guess.

### What it does for you

- **Snapshots before copying.** SQLite keeps recent writes in a `-wal` sidecar,
  so the `.db` file on its own can be out of date. `push` and `pull` both take a
  `VACUUM INTO` snapshot first — one complete file crosses the network.
- **Refuses to overwrite newer work.** If the other side has edits yours does
  not, it stops and suggests the opposite command. `--force` overrides.
- **Backs up what it replaces.** Into `.db-backups/` locally, or the same folder
  on the remote. `restore` lists them and puts one back.
- **Installs atomically.** The file is copied under a temporary name and moved
  into place in one step, so an interrupted transfer cannot leave a half-written
  database.
- **Verifies the download.** A pulled file is opened and read before it is
  allowed to replace anything.

### The one rule

**This is a copy, not a merge.** Whichever side you copy *from* wins completely.
Close the board on the receiving machine first, and get into the habit of
pushing when you finish rather than after you have edited both sides.

### Other commands

```bash
node tools/db-sync.mjs devices      # list registered machines
node tools/db-sync.mjs backup       # snapshot into .db-backups/
node tools/db-sync.mjs restore      # list backups, or restore one
node tools/db-sync.mjs checkpoint   # fold the -wal in, for copying by hand
node tools/db-sync.mjs remove pc    # forget a machine
```

Flags: `--yes` `--force` `--dry-run` `--no-backup` `--verbose` `--db <path>`.

`--dry-run` is worth knowing — it prints exactly what would happen and copies
nothing.

### Copying it by hand instead

Nothing stops you. Stop the app, fold the write-ahead log in, and take the file:

```bash
node tools/db-sync.mjs checkpoint
scp data/study-board.db you@laptop.local:~/Repos/mirror/data/
```

### SSH setup

The tool needs the same plain `ssh` access that makes `ssh you@laptop.local`
work. If you have not set up keys yet:

```bash
ssh-keygen -t ed25519
ssh-copy-id you@laptop.local
```

---

## Layout

```
server/          local API — Express + node:sqlite
  db.js          schema, queries, the whole data model
  index.js       routes and static hosting
src/
  components/    canvas, tools, panels
  lib/
    mathEval.js  the expression parser and evaluator
    geometry.js  path smoothing, simplification, hit maths
    erase.js     brush erasing — resampling and splitting strokes
  stores/board.js  application state, undo/redo, autosave
tools/
  db-sync.mjs    the scp sync tool  (start at `help`)
  db-probe.mjs   reports on a database; run on both ends by db-sync
  db-snapshot.mjs  writes a consistent copy; used before every transfer
data/            your database  (gitignored)
.db-backups/     automatic safety copies  (gitignored)
```

## What is gitignored

`data/` (the database), `sync.config.json` (machine-specific hosts and paths),
`.db-backups/`, and the usual `node_modules/` and `dist/`. Cloning the repo
gets you the application and nothing personal.
