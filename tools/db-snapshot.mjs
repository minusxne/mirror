#!/usr/bin/env node
/**
 * Writes a consistent, self-contained copy of the board database to <dest>.
 *
 * `VACUUM INTO` reads inside a transaction and folds the write-ahead log in, so
 * the result is a single file that is safe to copy even while the board app is
 * running. db-sync runs this locally before a push, and over ssh before a pull.
 *
 * Usage: node tools/db-snapshot.mjs <dest.db> [source.db]
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { DatabaseSync } from 'node:sqlite'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const PROJECT_ROOT = path.resolve(__dirname, '..')

const dest = process.argv[2]
const rel = process.argv[3] || process.env.BOARD_DB || 'data/study-board.db'

if (!dest) {
  console.error('usage: node tools/db-snapshot.mjs <dest.db> [source.db]')
  process.exit(2)
}

const source = path.isAbsolute(rel) ? rel : path.join(PROJECT_ROOT, rel)

if (!fs.existsSync(source)) {
  console.error(`no database at ${source}`)
  process.exit(3)
}

// VACUUM INTO refuses to write over an existing file.
fs.rmSync(dest, { force: true })

const db = new DatabaseSync(source)
db.exec(`VACUUM INTO '${dest.replace(/'/g, "''")}'`)
db.close()

process.stdout.write(`${dest}\n`)
