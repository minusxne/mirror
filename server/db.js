/**
 * Database layer.
 *
 * The entire application state lives in ONE SQLite file (default:
 * `data/study-board.db`). That is deliberate: it means "moving your work to
 * another machine" is literally "copy one file", which is exactly what
 * tools/db-sync.mjs does over scp.
 *
 * Uses node:sqlite (built into Node >= 22.5), so there is no native module to
 * compile. Clone the repo anywhere, `npm install`, and it just runs.
 */
import { DatabaseSync } from 'node:sqlite'
import fs from 'node:fs'
import path from 'node:path'
import crypto from 'node:crypto'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
export const PROJECT_ROOT = path.resolve(__dirname, '..')

/** Where the database lives, relative to the project root. */
export const DEFAULT_DB_RELATIVE = 'data/study-board.db'

export const SCHEMA_VERSION = 2

/** Item kinds the board understands. Anything else is rejected on write. */
export const ITEM_TYPES = new Set([
  'path', // freehand pen / highlighter stroke
  'line',
  'arrow',
  'rect',
  'ellipse',
  'diamond',
  'sticky',
  'text',
  'math', // KaTeX / LaTeX block
  'calc', // multi-line calculator
  'plot', // function grapher
  'image'
])

export function resolveDbPath (custom) {
  const raw = custom || process.env.BOARD_DB || DEFAULT_DB_RELATIVE
  return path.isAbsolute(raw) ? raw : path.join(PROJECT_ROOT, raw)
}

/**
 * Open (creating if needed) the board database and make sure the schema is
 * present and up to date.
 */
export function openDatabase (dbPath = resolveDbPath()) {
  fs.mkdirSync(path.dirname(dbPath), { recursive: true })

  const db = new DatabaseSync(dbPath, { enableForeignKeyConstraints: true })

  // WAL keeps the UI snappy while autosave writes in the background.
  // The sync tool takes a consistent single-file snapshot (VACUUM INTO) before
  // copying, so the -wal/-shm sidecars never need to travel over the network.
  db.exec('PRAGMA journal_mode = WAL')
  db.exec('PRAGMA synchronous = NORMAL')
  db.exec('PRAGMA busy_timeout = 5000')

  migrate(db)
  return db
}

function migrate (db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS meta (
      key   TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS boards (
      id          TEXT PRIMARY KEY,
      name        TEXT    NOT NULL,
      background  TEXT    NOT NULL DEFAULT 'dots',
      created_at  INTEGER NOT NULL,
      updated_at  INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS items (
      id         TEXT PRIMARY KEY,
      board_id   TEXT    NOT NULL REFERENCES boards(id) ON DELETE CASCADE,
      type       TEXT    NOT NULL,
      x          REAL    NOT NULL DEFAULT 0,
      y          REAL    NOT NULL DEFAULT 0,
      w          REAL    NOT NULL DEFAULT 0,
      h          REAL    NOT NULL DEFAULT 0,
      z          INTEGER NOT NULL DEFAULT 0,
      data       TEXT    NOT NULL DEFAULT '{}',
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_items_board ON items(board_id, z);

    CREATE TABLE IF NOT EXISTS board_groups (
      id         TEXT PRIMARY KEY,
      name       TEXT    NOT NULL,
      color      TEXT    NOT NULL DEFAULT '#8b8d98',
      collapsed  INTEGER NOT NULL DEFAULT 0,
      created_at INTEGER NOT NULL
    );
  `)

  // Databases written before groups existed need the column adding. Checking
  // the table rather than the version number keeps this safe to re-run.
  if (!hasColumn(db, 'boards', 'group_id')) {
    db.exec('ALTER TABLE boards ADD COLUMN group_id TEXT')
  }
  db.exec('CREATE INDEX IF NOT EXISTS idx_boards_group ON boards(group_id, updated_at)')

  const version = Number(getMeta(db, 'schema_version') || 0)
  if (version < SCHEMA_VERSION) setMeta(db, 'schema_version', String(SCHEMA_VERSION))

  // A stable id for this database file. Travels with the file, so both
  // machines agree on "which board collection is this".
  if (!getMeta(db, 'library_id')) setMeta(db, 'library_id', crypto.randomUUID())

  // Give a brand-new database something to open onto.
  const { n } = db.prepare('SELECT COUNT(*) AS n FROM boards').get()
  if (n === 0) createBoard(db, 'My Study Board')
}

/* ------------------------------------------------------------------ meta -- */

export function getMeta (db, key) {
  const row = db.prepare('SELECT value FROM meta WHERE key = ?').get(key)
  return row ? row.value : null
}

export function setMeta (db, key, value) {
  db.prepare(
    'INSERT INTO meta (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value'
  ).run(key, String(value))
}

function hasColumn (db, table, column) {
  return db.prepare(`PRAGMA table_info(${table})`).all().some((c) => c.name === column)
}

/* ---------------------------------------------------------------- groups -- */

export function listGroups (db) {
  return db
    .prepare(
      `SELECT g.id, g.name, g.color, g.collapsed, g.created_at,
              (SELECT COUNT(*) FROM boards b WHERE b.group_id = g.id) AS board_count
         FROM board_groups g
        ORDER BY g.created_at ASC`
    )
    .all()
}

export function createGroup (db, name = 'New group', color = '#8b8d98') {
  const id = crypto.randomUUID()
  db.prepare('INSERT INTO board_groups (id, name, color, collapsed, created_at) VALUES (?, ?, ?, 0, ?)').run(
    id,
    String(name).slice(0, 120) || 'New group',
    String(color).slice(0, 32),
    Date.now()
  )
  return db.prepare('SELECT * FROM board_groups WHERE id = ?').get(id)
}

export function updateGroup (db, id, patch) {
  const group = db.prepare('SELECT * FROM board_groups WHERE id = ?').get(id)
  if (!group) return null
  db.prepare('UPDATE board_groups SET name = ?, color = ?, collapsed = ? WHERE id = ?').run(
    patch.name === undefined ? group.name : String(patch.name).slice(0, 120),
    patch.color === undefined ? group.color : String(patch.color).slice(0, 32),
    patch.collapsed === undefined ? group.collapsed : (patch.collapsed ? 1 : 0),
    id
  )
  return db.prepare('SELECT * FROM board_groups WHERE id = ?').get(id)
}

/** Deleting a group never deletes boards — they fall back to Ungrouped. */
export function deleteGroup (db, id) {
  db.exec('BEGIN IMMEDIATE')
  try {
    db.prepare('UPDATE boards SET group_id = NULL WHERE group_id = ?').run(id)
    const info = db.prepare('DELETE FROM board_groups WHERE id = ?').run(id)
    db.exec('COMMIT')
    return info.changes > 0
  } catch (err) {
    db.exec('ROLLBACK')
    throw err
  }
}

/* ---------------------------------------------------------------- boards -- */

export function listBoards (db) {
  return db
    .prepare(
      `SELECT b.id, b.name, b.background, b.group_id, b.created_at, b.updated_at,
              (SELECT COUNT(*) FROM items i WHERE i.board_id = b.id) AS item_count
         FROM boards b
        ORDER BY b.updated_at DESC`
    )
    .all()
}

export function getBoard (db, id) {
  return db.prepare('SELECT * FROM boards WHERE id = ?').get(id) || null
}

export function createBoard (db, name = 'Untitled board', background = 'dots', groupId = null) {
  const now = Date.now()
  const id = crypto.randomUUID()
  db.prepare(
    'INSERT INTO boards (id, name, background, group_id, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)'
  ).run(id, String(name).slice(0, 200) || 'Untitled board', background, groupId || null, now, now)
  return getBoard(db, id)
}

export function updateBoard (db, id, patch) {
  const board = getBoard(db, id)
  if (!board) return null
  const name = patch.name === undefined ? board.name : String(patch.name).slice(0, 200)
  const background = patch.background === undefined ? board.background : String(patch.background)
  const groupId = patch.groupId === undefined ? board.group_id : (patch.groupId || null)
  // Moving a board between groups is not an edit to its contents, so it must
  // not bump updated_at — that timestamp is what the sync tool compares.
  const touch = patch.name !== undefined || patch.background !== undefined
  db.prepare('UPDATE boards SET name = ?, background = ?, group_id = ?, updated_at = ? WHERE id = ?').run(
    name,
    background,
    groupId,
    touch ? Date.now() : board.updated_at,
    id
  )
  return getBoard(db, id)
}

export function deleteBoard (db, id) {
  const info = db.prepare('DELETE FROM boards WHERE id = ?').run(id)
  return info.changes > 0
}

export function touchBoard (db, id, at = Date.now()) {
  db.prepare('UPDATE boards SET updated_at = ? WHERE id = ?').run(at, id)
}

/* ----------------------------------------------------------------- items -- */

function rowToItem (row) {
  let data = {}
  try {
    data = JSON.parse(row.data)
  } catch {
    data = {}
  }
  return {
    id: row.id,
    type: row.type,
    x: row.x,
    y: row.y,
    w: row.w,
    h: row.h,
    z: row.z,
    data,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  }
}

export function listItems (db, boardId) {
  return db
    .prepare('SELECT * FROM items WHERE board_id = ? ORDER BY z ASC, created_at ASC')
    .all(boardId)
    .map(rowToItem)
}

const num = (v, fallback = 0) => {
  const n = Number(v)
  return Number.isFinite(n) ? n : fallback
}

/**
 * Apply a batch of client mutations inside one transaction.
 * ops: [{ kind: 'upsert', item }, { kind: 'delete', id }]
 */
export function commitOps (db, boardId, ops) {
  const board = getBoard(db, boardId)
  if (!board) return null

  const now = Date.now()
  const upsert = db.prepare(`
    INSERT INTO items (id, board_id, type, x, y, w, h, z, data, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET
      type       = excluded.type,
      x          = excluded.x,
      y          = excluded.y,
      w          = excluded.w,
      h          = excluded.h,
      z          = excluded.z,
      data       = excluded.data,
      updated_at = excluded.updated_at
  `)
  const remove = db.prepare('DELETE FROM items WHERE id = ? AND board_id = ?')

  let applied = 0
  let rejected = 0

  db.exec('BEGIN IMMEDIATE')
  try {
    for (const op of ops) {
      if (!op || typeof op !== 'object') { rejected++; continue }

      if (op.kind === 'delete') {
        if (typeof op.id === 'string') { remove.run(op.id, boardId); applied++ }
        else rejected++
        continue
      }

      if (op.kind === 'upsert') {
        const it = op.item
        if (!it || typeof it.id !== 'string' || !ITEM_TYPES.has(it.type)) { rejected++; continue }
        upsert.run(
          it.id,
          boardId,
          it.type,
          num(it.x),
          num(it.y),
          num(it.w),
          num(it.h),
          Math.trunc(num(it.z)),
          JSON.stringify(it.data ?? {}),
          Math.trunc(num(it.createdAt, now)),
          now
        )
        applied++
        continue
      }

      rejected++
    }
    db.prepare('UPDATE boards SET updated_at = ? WHERE id = ?').run(now, boardId)
    db.exec('COMMIT')
  } catch (err) {
    db.exec('ROLLBACK')
    throw err
  }

  return { applied, rejected, updatedAt: now }
}

/** Replace a board's contents wholesale (used by JSON import). */
export function replaceBoardItems (db, boardId, items) {
  const now = Date.now()
  db.exec('BEGIN IMMEDIATE')
  try {
    db.prepare('DELETE FROM items WHERE board_id = ?').run(boardId)
    const insert = db.prepare(`
      INSERT INTO items (id, board_id, type, x, y, w, h, z, data, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `)
    for (const it of items) {
      if (!it || !ITEM_TYPES.has(it.type)) continue
      insert.run(
        typeof it.id === 'string' ? it.id : crypto.randomUUID(),
        boardId,
        it.type,
        num(it.x),
        num(it.y),
        num(it.w),
        num(it.h),
        Math.trunc(num(it.z)),
        JSON.stringify(it.data ?? {}),
        Math.trunc(num(it.createdAt, now)),
        now
      )
    }
    db.prepare('UPDATE boards SET updated_at = ? WHERE id = ?').run(now, boardId)
    db.exec('COMMIT')
  } catch (err) {
    db.exec('ROLLBACK')
    throw err
  }
}

/* --------------------------------------------------------------- preview -- */

const MAX_PREVIEW_ITEMS = 260
const MAX_PREVIEW_POINTS = 16

/**
 * A miniature description of a board, for the thumbnails in the board browser.
 *
 * Sending real board data would not scale — a few thousand strokes is megabytes,
 * and the browser wants several boards at once. So this keeps only what shows up
 * at thumbnail size: geometry, colour, and heavily decimated stroke paths. Image
 * data URIs and calculator text are dropped entirely; they are drawn as blocks.
 *
 * When a board has more items than fit, the largest are kept — those are the
 * ones you would actually see.
 */
export function boardPreview (db, boardId) {
  const rows = db
    .prepare('SELECT type, x, y, w, h, z, data FROM items WHERE board_id = ?')
    .all(boardId)

  let minX = Infinity; let minY = Infinity; let maxX = -Infinity; let maxY = -Infinity
  for (const r of rows) {
    minX = Math.min(minX, r.x)
    minY = Math.min(minY, r.y)
    maxX = Math.max(maxX, r.x + r.w)
    maxY = Math.max(maxY, r.y + r.h)
  }

  const chosen = rows.length <= MAX_PREVIEW_ITEMS
    ? rows
    : [...rows].sort((a, b) => b.w * b.h - a.w * a.h).slice(0, MAX_PREVIEW_ITEMS)

  const items = chosen
    .sort((a, b) => a.z - b.z)
    .map((r) => {
      let data = {}
      try {
        data = JSON.parse(r.data)
      } catch { /* keep the empty object */ }

      const out = {
        type: r.type,
        x: round2(r.x),
        y: round2(r.y),
        w: round2(r.w),
        h: round2(r.h)
      }
      if (data.color) out.color = data.color
      if (data.fill) out.fill = data.fill
      if (data.strokeWidth) out.strokeWidth = data.strokeWidth
      if (data.opacity !== undefined && data.opacity !== 1) out.opacity = data.opacity

      if (Array.isArray(data.points) && data.points.length) {
        out.points = decimate(data.points, MAX_PREVIEW_POINTS)
      }
      if (r.type === 'sticky' || r.type === 'text') {
        const text = String(data.text || '').trim()
        if (text) out.label = text.slice(0, 90)
      }
      return out
    })

  return {
    bounds: rows.length
      ? { x: round2(minX), y: round2(minY), w: round2(maxX - minX), h: round2(maxY - minY) }
      : null,
    count: rows.length,
    shown: items.length,
    items
  }
}

const round2 = (n) => Math.round(n * 100) / 100

/** Keep the endpoints, drop evenly spaced points in between. */
function decimate (points, max) {
  if (points.length <= max) return points.map(([x, y]) => [round2(x), round2(y)])
  const step = (points.length - 1) / (max - 1)
  const out = []
  for (let i = 0; i < max; i++) {
    const [x, y] = points[Math.round(i * step)]
    out.push([round2(x), round2(y)])
  }
  return out
}

/* ------------------------------------------------------------ statistics -- */

export function databaseStats (db, dbPath) {
  let size = 0
  let mtime = null
  try {
    const st = fs.statSync(dbPath)
    size = st.size
    mtime = st.mtimeMs
  } catch { /* not created yet */ }

  const boards = db.prepare('SELECT COUNT(*) AS n FROM boards').get().n
  const items = db.prepare('SELECT COUNT(*) AS n FROM items').get().n
  const lastEdit = db.prepare('SELECT MAX(updated_at) AS t FROM boards').get().t

  return {
    path: dbPath,
    relativePath: path.relative(PROJECT_ROOT, dbPath),
    sizeBytes: size,
    modifiedAt: mtime,
    boards,
    items,
    lastEditAt: lastEdit,
    libraryId: getMeta(db, 'library_id'),
    schemaVersion: Number(getMeta(db, 'schema_version') || 0)
  }
}
