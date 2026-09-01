/**
 * Local API server.
 *
 * In development Vite serves the UI on :5173 and proxies /api here.
 * In production (`npm run serve`) this process serves the built UI too, so the
 * whole app is one `node server/index.js` on any machine you cloned to.
 */
import express from 'express'
import fs from 'node:fs'
import path from 'node:path'

import {
  PROJECT_ROOT,
  openDatabase,
  resolveDbPath,
  listBoards,
  getBoard,
  createBoard,
  updateBoard,
  deleteBoard,
  listItems,
  commitOps,
  replaceBoardItems,
  databaseStats
} from './db.js'

const PORT = Number(process.env.API_PORT || process.env.PORT || 5174)
// Loopback by default. Set HOST=0.0.0.0 to reach the board from your phone or
// another machine on the LAN.
const HOST = process.env.HOST || '127.0.0.1'

const dbPath = resolveDbPath()
const db = openDatabase(dbPath)

const app = express()
app.disable('x-powered-by')
// Generous limit: pasted images are stored inline as data URIs so the database
// stays a single self-contained file you can scp.
app.use(express.json({ limit: '64mb' }))

const asJson = (res, status, body) => res.status(status).json(body)
const notFound = (res) => asJson(res, 404, { error: 'not_found' })

/* ------------------------------------------------------------------ meta -- */

app.get('/api/health', (_req, res) => res.json({ ok: true, uptime: process.uptime() }))

app.get('/api/info', (_req, res) => {
  res.json({
    database: databaseStats(db, dbPath),
    projectRoot: PROJECT_ROOT,
    node: process.version,
    host: HOST,
    port: PORT
  })
})

/* ---------------------------------------------------------------- boards -- */

app.get('/api/boards', (_req, res) => res.json({ boards: listBoards(db) }))

app.post('/api/boards', (req, res) => {
  const board = createBoard(db, req.body?.name || 'Untitled board', req.body?.background || 'dots')
  asJson(res, 201, { board })
})

app.get('/api/boards/:id', (req, res) => {
  const board = getBoard(db, req.params.id)
  if (!board) return notFound(res)
  res.json({ board, items: listItems(db, board.id) })
})

app.patch('/api/boards/:id', (req, res) => {
  const board = updateBoard(db, req.params.id, req.body || {})
  if (!board) return notFound(res)
  res.json({ board })
})

app.delete('/api/boards/:id', (req, res) => {
  if (listBoards(db).length <= 1) {
    return asJson(res, 409, { error: 'last_board', message: 'Cannot delete the only board.' })
  }
  if (!deleteBoard(db, req.params.id)) return notFound(res)
  res.json({ ok: true })
})

/* --------------------------------------------------------------- commits -- */

app.post('/api/boards/:id/commit', (req, res) => {
  const ops = Array.isArray(req.body?.ops) ? req.body.ops : []
  if (ops.length > 5000) return asJson(res, 413, { error: 'too_many_ops' })
  const result = commitOps(db, req.params.id, ops)
  if (!result) return notFound(res)
  res.json(result)
})

/* -------------------------------------------------------- export /import -- */

app.get('/api/boards/:id/export', (req, res) => {
  const board = getBoard(db, req.params.id)
  if (!board) return notFound(res)
  res.json({
    format: 'mirror-study-board',
    version: 1,
    exportedAt: Date.now(),
    board: { name: board.name, background: board.background },
    items: listItems(db, board.id)
  })
})

app.post('/api/boards/import', (req, res) => {
  const payload = req.body
  if (!payload || !Array.isArray(payload.items)) {
    return asJson(res, 400, { error: 'bad_payload', message: 'Expected { board, items[] }.' })
  }
  const name = payload.board?.name ? `${payload.board.name} (imported)` : 'Imported board'
  const board = createBoard(db, name, payload.board?.background || 'dots')
  replaceBoardItems(db, board.id, payload.items)
  asJson(res, 201, { board })
})

/* -------------------------------------------------- static UI (built app) -- */

const distDir = path.join(PROJECT_ROOT, 'dist')
if (fs.existsSync(distDir)) {
  app.use(express.static(distDir))
  app.use((req, res, next) => {
    if (req.method !== 'GET' || req.path.startsWith('/api/')) return next()
    res.sendFile(path.join(distDir, 'index.html'))
  })
}

app.use((req, res) => asJson(res, 404, { error: 'not_found', path: req.path }))

// eslint-disable-next-line no-unused-vars
app.use((err, _req, res, _next) => {
  console.error('[api]', err)
  asJson(res, 500, { error: 'server_error', message: err?.message || String(err) })
})

const server = app.listen(PORT, HOST, () => {
  const stats = databaseStats(db, dbPath)
  console.log('')
  console.log('  Mirror — Study Board')
  console.log(`  API      http://${HOST}:${PORT}`)
  if (fs.existsSync(distDir)) console.log(`  UI       http://${HOST}:${PORT}`)
  else console.log('  UI       http://127.0.0.1:5173  (vite dev server)')
  console.log(`  Database ${stats.relativePath}  (${stats.boards} boards, ${stats.items} items)`)
  console.log('')
})

for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => {
    server.close(() => {
      try {
        // Fold the WAL back into the main file so the database is a single
        // clean file the moment the server stops — nice for scp'ing.
        db.exec('PRAGMA wal_checkpoint(TRUNCATE)')
        db.close()
      } catch { /* already closed */ }
      process.exit(0)
    })
  })
}
