#!/usr/bin/env node
/**
 * Prints a one-line JSON description of this machine's board database.
 *
 * db-sync.mjs runs this locally AND over ssh on the remote machine (the repo is
 * cloned on both sides, so the remote already has this file). Using the same
 * script on both ends means "which side is newer?" is answered by the same
 * logic everywhere, instead of by fragile shell one-liners.
 *
 * Usage: node tools/db-probe.mjs [path/to/db]
 */
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import crypto from 'node:crypto'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const PROJECT_ROOT = path.resolve(__dirname, '..')

const arg = process.argv[2]
const rel = arg || process.env.BOARD_DB || 'data/study-board.db'
const dbPath = path.isAbsolute(rel) ? rel : path.join(PROJECT_ROOT, rel)

const out = {
  ok: true,
  host: os.hostname(),
  path: dbPath,
  exists: false,
  sizeBytes: 0,
  modifiedAt: null,
  sha256: null,
  boards: null,
  items: null,
  revision: null, // newest edit timestamp stored *inside* the database
  libraryId: null,
  walBytes: 0,
  readable: false,
  node: process.version,
  error: null
}

try {
  const st = fs.statSync(dbPath)
  out.exists = true
  out.sizeBytes = st.size
  out.modifiedAt = Math.round(st.mtimeMs)
} catch { /* no database yet */ }

if (out.exists) {
  try {
    out.walBytes = fs.statSync(`${dbPath}-wal`).size
  } catch { /* no wal sidecar */ }

  try {
    out.sha256 = crypto.createHash('sha256').update(fs.readFileSync(dbPath)).digest('hex')
  } catch (err) {
    out.error = `hash failed: ${err.message}`
  }

  try {
    const { DatabaseSync } = await import('node:sqlite')
    const db = new DatabaseSync(dbPath, { readOnly: true })
    out.readable = true
    out.boards = db.prepare('SELECT COUNT(*) AS n FROM boards').get().n
    out.items = db.prepare('SELECT COUNT(*) AS n FROM items').get().n
    const a = db.prepare('SELECT MAX(updated_at) AS t FROM boards').get().t || 0
    const b = db.prepare('SELECT MAX(updated_at) AS t FROM items').get().t || 0
    out.revision = Math.max(a, b) || null
    const meta = db.prepare("SELECT value FROM meta WHERE key = 'library_id'").get()
    out.libraryId = meta ? meta.value : null
    db.close()
  } catch (err) {
    // Locked, mid-write, or an older Node without node:sqlite — file stats above
    // are still useful, so this is not fatal.
    out.error = `read failed: ${err.message}`
  }
}

process.stdout.write(JSON.stringify(out) + '\n')
