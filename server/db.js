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

export const SCHEMA_VERSION = 1

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
  `)

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

/* ---------------------------------------------------------------- boards -- */

export function listBoards (db) {
  return db
    .prepare(
      `SELECT b.id, b.name, b.background, b.created_at, b.updated_at,
              (SELECT COUNT(*) FROM items i WHERE i.board_id = b.id) AS item_count
         FROM boards b
        ORDER BY b.updated_at DESC`
    )
    .all()
}

export function getBoard (db, id) {
  return db.prepare('SELECT * FROM boards WHERE id = ?').get(id) || null
}

export function createBoard (db, name = 'Untitled board', background = 'dots') {
  const now = Date.now()
  const id = crypto.randomUUID()
  db.prepare(
    'INSERT INTO boards (id, name, background, created_at, updated_at) VALUES (?, ?, ?, ?, ?)'
  ).run(id, String(name).slice(0, 200) || 'Untitled board', background, now, now)
  return getBoard(db, id)
}

export function updateBoard (db, id, patch) {
  const board = getBoard(db, id)
  if (!board) return null
  const name = patch.name === undefined ? board.name : String(patch.name).slice(0, 200)
  const background = patch.background === undefined ? board.background : String(patch.background)
  db.prepare('UPDATE boards SET name = ?, background = ?, updated_at = ? WHERE id = ?').run(
    name,
    background,
    Date.now(),
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
