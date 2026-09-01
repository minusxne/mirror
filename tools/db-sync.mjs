#!/usr/bin/env node
/**
 * db-sync — move the study board database between your own machines over scp.
 *
 * The whole board lives in one SQLite file, so "continue on the laptop" is just
 * "copy that file". This wraps that copy with the things you actually want:
 * a consistent snapshot, a backup of whatever it is about to overwrite, an
 * atomic install on the far side, and a loud warning when the target has newer
 * work than the source.
 *
 *   node tools/db-sync.mjs help
 */
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import crypto from 'node:crypto'
import readline from 'node:readline'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { DatabaseSync } from 'node:sqlite'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.resolve(__dirname, '..')
const VERSION = '1.0.0'

const CONFIG_PATH = path.join(ROOT, 'sync.config.json')
const EXAMPLE_PATH = path.join(ROOT, 'sync.config.example.json')
const BACKUP_DIR = path.join(ROOT, '.db-backups')
const DEFAULT_DB = 'data/study-board.db'

/* ------------------------------------------------------------------ tty -- */

const isTTY = process.stdout.isTTY && !process.env.NO_COLOR
const c = (code) => (s) => (isTTY ? `\x1b[${code}m${s}\x1b[0m` : String(s))
const bold = c('1')
const dim = c('2')
const red = c('31')
const green = c('32')
const yellow = c('33')
const blue = c('36')

const say = (...a) => console.log(...a)
const warn = (msg) => console.error(`${yellow('warning')}  ${msg}`)
const fail = (msg, code = 1) => {
  console.error(`${red('error')}    ${msg}`)
  process.exit(code)
}

/* -------------------------------------------------------------- helpers -- */

function humanBytes (n) {
  if (!Number.isFinite(n) || n <= 0) return '0 B'
  const units = ['B', 'KB', 'MB', 'GB']
  const i = Math.min(units.length - 1, Math.floor(Math.log(n) / Math.log(1024)))
  return `${(n / 1024 ** i).toFixed(i === 0 ? 0 : 1)} ${units[i]}`
}

function humanTime (ms) {
  if (!ms) return 'never'
  const d = new Date(ms)
  const diff = Date.now() - ms
  const mins = Math.round(diff / 60000)
  let rel
  if (Math.abs(mins) < 1) rel = 'just now'
  else if (Math.abs(mins) < 60) rel = `${mins}m ago`
  else if (Math.abs(mins) < 60 * 24) rel = `${Math.round(mins / 60)}h ago`
  else rel = `${Math.round(mins / 1440)}d ago`
  return `${d.toLocaleString()} ${dim(`(${rel})`)}`
}

function stamp () {
  const d = new Date()
  const p = (n) => String(n).padStart(2, '0')
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`
}

async function confirm (question, assumeYes) {
  if (assumeYes) return true
  if (!process.stdin.isTTY) {
    fail('not attached to a terminal; re-run with --yes to confirm non-interactively')
  }
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout })
  const answer = await new Promise((resolve) => rl.question(`${question} ${dim('[y/N]')} `, resolve))
  rl.close()
  return /^y(es)?$/i.test(answer.trim())
}

/* --------------------------------------------------------------- config -- */

function loadConfig () {
  if (!fs.existsSync(CONFIG_PATH)) {
    fail(
      `no sync.config.json found.\n\n  Create one with:\n    ${bold('node tools/db-sync.mjs init')}\n\n  Then add this machine's counterpart:\n    ${bold('node tools/db-sync.mjs add laptop --host you@laptop.local --path ~/Repos/mirror')}`
    )
  }
  let cfg
  try {
    cfg = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8'))
  } catch (err) {
    fail(`sync.config.json is not valid JSON: ${err.message}`)
  }
  cfg.database ||= DEFAULT_DB
  cfg.devices ||= {}
  return cfg
}

function saveConfig (cfg) {
  fs.writeFileSync(CONFIG_PATH, JSON.stringify(cfg, null, 2) + '\n')
}

function getDevice (cfg, name) {
  if (!name) {
    const names = Object.keys(cfg.devices)
    fail(
      `no device given.\n\n  Known devices: ${names.length ? names.map(bold).join(', ') : dim('(none yet — run `db-sync add`)')}\n  Example: ${bold('node tools/db-sync.mjs push laptop')}`
    )
  }
  const dev = cfg.devices[name]
  if (!dev) {
    const names = Object.keys(cfg.devices)
    fail(
      `unknown device ${bold(name)}.\n  Known devices: ${names.length ? names.map(bold).join(', ') : dim('(none)')}`
    )
  }
  if (!dev.host) fail(`device ${bold(name)} has no "host" (expected something like you@laptop.local)`)
  return { name, ...dev }
}

/* ------------------------------------------------------------ ssh / scp -- */

function sshArgs (dev) {
  const args = ['-o', 'BatchMode=no', '-o', 'ConnectTimeout=10']
  if (dev.port) args.push('-p', String(dev.port))
  if (dev.identity) args.push('-i', expandHome(dev.identity))
  if (Array.isArray(dev.sshOptions)) args.push(...dev.sshOptions)
  return args
}

function scpArgs (dev) {
  const args = ['-o', 'ConnectTimeout=10', '-p'] // -p preserves mtime
  if (dev.port) args.push('-P', String(dev.port))
  if (dev.identity) args.push('-i', expandHome(dev.identity))
  if (Array.isArray(dev.sshOptions)) args.push(...dev.sshOptions)
  return args
}

function expandHome (p) {
  if (typeof p === 'string' && p.startsWith('~/')) return path.join(os.homedir(), p.slice(2))
  return p
}

/** Quote a path for a remote POSIX shell, leaving a leading ~/ expandable. */
function rq (p) {
  const q = (s) => `'${String(s).replace(/'/g, "'\\''")}'`
  if (p === '~') return '~'
  if (p.startsWith('~/')) return `~/${q(p.slice(2))}`
  return q(p)
}

function run (cmd, args, { capture = true, verbose = false } = {}) {
  if (verbose) say(dim(`  $ ${cmd} ${args.join(' ')}`))
  const res = spawnSync(cmd, args, {
    encoding: 'utf8',
    stdio: capture ? ['inherit', 'pipe', 'pipe'] : 'inherit'
  })
  if (res.error) {
    if (res.error.code === 'ENOENT') fail(`${cmd} not found on this machine. Install OpenSSH and try again.`)
    fail(`${cmd} failed to start: ${res.error.message}`)
  }
  return {
    status: res.status,
    stdout: (res.stdout || '').trim(),
    stderr: (res.stderr || '').trim()
  }
}

function ssh (dev, remoteCommand, opts = {}) {
  return run('ssh', [...sshArgs(dev), dev.host, remoteCommand], opts)
}

/* ---------------------------------------------------------------- probe -- */

function localProbe (dbRelative, verbose) {
  const res = run(process.execPath, [path.join(__dirname, 'db-probe.mjs'), dbRelative], { verbose })
  if (res.status !== 0) fail(`local probe failed: ${res.stderr || res.stdout}`)
  try {
    return JSON.parse(res.stdout)
  } catch {
    fail(`local probe returned unexpected output:\n${res.stdout}\n${res.stderr}`)
  }
}

/**
 * Resolve the remote repo to an absolute path (so `~` is expanded once, by a
 * real shell, instead of relying on scp's path handling) and probe its database.
 */
function remoteProbe (dev, dbRelative, verbose) {
  const repo = dev.path || '~/mirror'
  const cd = run('ssh', [...sshArgs(dev), dev.host, `cd ${rq(repo)} && pwd`], { verbose })
  if (cd.status !== 0) {
    fail(
      `cannot reach ${bold(dev.name)} (${dev.host}) or its repo path ${bold(repo)}.\n` +
      `  ssh said: ${cd.stderr || '(no output)'}\n\n` +
      '  Check: is the machine awake, is ssh set up, and is the repo cloned at that path?'
    )
  }
  const root = cd.stdout.split('\n').pop().trim()

  const probeCmd = `cd ${rq(root)} && node tools/db-probe.mjs ${rq(dbRelative)}`
  const res = run('ssh', [...sshArgs(dev), dev.host, probeCmd], { verbose })

  let info
  if (res.status === 0) {
    try {
      info = JSON.parse(res.stdout.split('\n').filter(Boolean).pop())
    } catch { /* fall through to the shell fallback */ }
  }

  if (!info) {
    // Fallback for a remote without node (or with an older checkout): plain
    // POSIX stat, which is enough to size things up and to copy safely.
    const dbAbs = `${root}/${dbRelative}`
    const fb = run('ssh', [...sshArgs(dev), dev.host,
      `if [ -f ${rq(dbAbs)} ]; then stat -c '%s %Y' ${rq(dbAbs)} 2>/dev/null || stat -f '%z %m' ${rq(dbAbs)}; else echo missing; fi`
    ], { verbose })
    if (fb.stdout === 'missing' || fb.status !== 0) {
      info = { exists: false, sizeBytes: 0, modifiedAt: null, revision: null }
    } else {
      const [size, mtime] = fb.stdout.split(/\s+/)
      info = {
        exists: true,
        sizeBytes: Number(size) || 0,
        modifiedAt: (Number(mtime) || 0) * 1000,
        revision: null,
        degraded: true
      }
    }
    if (res.stderr && verbose) warn(`remote probe fell back to stat: ${res.stderr}`)
  }

  info.root = root
  info.dbAbsolute = `${root}/${dbRelative}`
  info.deviceName = dev.name
  return info
}

/* ------------------------------------------------------------- snapshot -- */

/**
 * Produce a consistent, single-file copy of the database.
 *
 * `VACUUM INTO` reads inside a transaction, so it is safe even while the board
 * server is running, and the result already has the WAL folded in — which means
 * exactly one file needs to cross the network.
 */
function snapshot (dbPath, verbose) {
  if (!fs.existsSync(dbPath)) {
    fail(`no database at ${bold(path.relative(ROOT, dbPath))}.\n  Start the app once (${bold('npm run dev')}) to create it.`)
  }
  const out = path.join(os.tmpdir(), `mirror-snapshot-${process.pid}-${crypto.randomBytes(4).toString('hex')}.db`)
  try {
    fs.rmSync(out, { force: true })
    const db = new DatabaseSync(dbPath, { readOnly: false })
    db.exec(`VACUUM INTO ${sqlLiteral(out)}`)
    db.close()
  } catch (err) {
    fail(
      `could not snapshot the database: ${err.message}\n` +
      '  If the board server is mid-write, try again in a moment.'
    )
  }
  if (verbose) say(dim(`  snapshot -> ${out} (${humanBytes(fs.statSync(out).size)})`))
  return out
}

const sqlLiteral = (s) => `'${String(s).replace(/'/g, "''")}'`

function sha256File (p) {
  return crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex')
}

function backupLocal (dbPath, label) {
  if (!fs.existsSync(dbPath)) return null
  fs.mkdirSync(BACKUP_DIR, { recursive: true })
  const dest = path.join(BACKUP_DIR, `${path.basename(dbPath, '.db')}-${label}-${stamp()}.db`)
  try {
    const db = new DatabaseSync(dbPath, { readOnly: false })
    db.exec(`VACUUM INTO ${sqlLiteral(dest)}`)
    db.close()
  } catch {
    fs.copyFileSync(dbPath, dest) // good enough as a last resort
  }
  return dest
}

/* ------------------------------------------------------------- printing -- */

function printSide (title, info, extra = '') {
  say(`  ${bold(title)} ${extra}`)
  if (!info.exists) {
    say(`    ${dim('no database file yet')}`)
    return
  }
  say(`    file      ${info.path || info.dbAbsolute}`)
  say(`    size      ${humanBytes(info.sizeBytes)}`)
  if (info.boards != null) say(`    contents  ${info.boards} boards, ${info.items} items`)
  if (info.revision) say(`    last edit ${humanTime(info.revision)}`)
  else say(`    modified  ${humanTime(info.modifiedAt)}`)
  if (info.walBytes) say(`    ${yellow('wal')}       ${humanBytes(info.walBytes)} pending ${dim('(app is probably running)')}`)
  if (info.degraded) say(`    ${dim('(remote has no node — limited info)')}`)
}

/**
 * Which side has the newer work?
 *
 * The comparison is on `revision` — the newest edit timestamp stored *inside*
 * the database — not on the file. A live database keeps recent writes in its
 * -wal sidecar, so the same board can hash and measure completely differently
 * on two machines while holding identical content; file identity would report
 * a difference that is not there. File hash and mtime are only consulted when
 * the remote is too old or too bare to report a revision.
 */
function compare (source, target) {
  const s = source.revision || source.modifiedAt || 0
  const t = target.revision || target.modifiedAt || 0

  if (!target.exists) return { verdict: 'new', s, t }

  if (source.revision && target.revision) {
    const sameContent =
      source.revision === target.revision &&
      source.boards === target.boards &&
      source.items === target.items
    if (sameContent) return { verdict: 'identical', s, t }
    if (target.revision > source.revision) return { verdict: 'target-newer', s, t }
    if (source.revision > target.revision) return { verdict: 'source-newer', s, t }
    return { verdict: 'same-age', s, t }
  }

  if (source.sha256 && target.sha256 && source.sha256 === target.sha256) {
    return { verdict: 'identical', s, t }
  }
  if (t > s + 2000) return { verdict: 'target-newer', s, t }
  if (s > t + 2000) return { verdict: 'source-newer', s, t }
  return { verdict: 'same-age', s, t }
}

/* ------------------------------------------------------------- commands -- */

async function cmdInit () {
  if (fs.existsSync(CONFIG_PATH)) {
    say(`${green('ok')}       sync.config.json already exists.`)
    say(`         Edit it, or add devices with ${bold('node tools/db-sync.mjs add <name> --host … --path …')}`)
    return
  }
  const template = {
    database: DEFAULT_DB,
    devices: {
      laptop: {
        host: `${os.userInfo().username}@laptop.local`,
        path: '~/Repos/mirror',
        port: 22,
        identity: null
      }
    }
  }
  saveConfig(template)
  say(`${green('created')}  ${path.relative(ROOT, CONFIG_PATH)}`)
  say('')
  say('  Now edit the "laptop" entry (or replace it) so host/path match your other machine:')
  say(`    ${dim('host')}  ssh target, e.g. ${bold('serban@laptop.local')} or ${bold('serban@192.168.1.42')}`)
  say(`    ${dim('path')}  where this repo is cloned over there, e.g. ${bold('~/Repos/mirror')}`)
  say('')
  say(`  Then check the connection with: ${bold('node tools/db-sync.mjs status laptop')}`)
  say(dim('  (this file is gitignored — it is per-machine)'))
}

function cmdDevices () {
  const cfg = loadConfig()
  const names = Object.keys(cfg.devices)
  say('')
  say(`  ${bold('database')}  ${cfg.database}`)
  say('')
  if (!names.length) {
    say(`  ${dim('No devices configured yet.')}`)
    say(`  Add one: ${bold('node tools/db-sync.mjs add laptop --host you@laptop.local --path ~/Repos/mirror')}`)
    say('')
    return
  }
  say(`  ${bold('devices')}`)
  for (const name of names) {
    const d = cfg.devices[name]
    const bits = [d.host]
    if (d.port && d.port !== 22) bits.push(`port ${d.port}`)
    if (d.identity) bits.push(`key ${d.identity}`)
    say(`    ${bold(name.padEnd(12))} ${bits.join('  ')}`)
    say(`    ${' '.repeat(12)} ${dim(d.path || '~/mirror')}`)
  }
  say('')
}

function cmdAdd (name, flags) {
  if (!name) fail('usage: db-sync add <name> --host user@host [--path ~/Repos/mirror] [--port 22] [--identity ~/.ssh/id_ed25519]')
  if (!flags.host) fail('--host is required, e.g. --host you@laptop.local')

  const cfg = fs.existsSync(CONFIG_PATH) ? loadConfig() : { database: DEFAULT_DB, devices: {} }
  cfg.devices[name] = {
    host: flags.host,
    path: flags.path || '~/Repos/mirror',
    port: flags.port ? Number(flags.port) : 22,
    identity: flags.identity || null
  }
  saveConfig(cfg)
  say(`${green('added')}    ${bold(name)} -> ${flags.host}:${cfg.devices[name].path}`)
  say(`         Test it with ${bold(`node tools/db-sync.mjs status ${name}`)}`)
}

function cmdRemove (name) {
  if (!name) fail('usage: db-sync remove <name>')
  const cfg = loadConfig()
  if (!cfg.devices[name]) fail(`unknown device ${bold(name)}`)
  delete cfg.devices[name]
  saveConfig(cfg)
  say(`${green('removed')}  ${bold(name)}`)
}

function cmdStatus (name, flags) {
  const cfg = fs.existsSync(CONFIG_PATH) ? loadConfig() : { database: DEFAULT_DB, devices: {} }
  const dbRelative = flags.db || cfg.database
  const local = localProbe(dbRelative, flags.verbose)

  say('')
  printSide('this machine', local, dim(`(${local.host})`))

  if (!name) {
    const names = Object.keys(cfg.devices)
    say('')
    if (names.length) say(`  ${dim(`Add a device name to compare: db-sync status ${names[0]}`)}`)
    else say(`  ${dim('No remote devices configured. Run: db-sync init')}`)
    say('')
    return
  }

  const dev = getDevice(cfg, name)
  const remote = remoteProbe(dev, dbRelative, flags.verbose)
  say('')
  printSide(name, remote, dim(`(${dev.host})`))

  const cmp = compare(local, remote)
  say('')
  if (cmp.verdict === 'identical') say(`  ${green('in sync')} — both sides hold the same database.`)
  else if (!remote.exists) say(`  ${yellow('remote has no database')} — ${bold(`db-sync push ${name}`)} to seed it.`)
  else if (cmp.verdict === 'source-newer') say(`  ${blue('this machine is ahead')} — ${bold(`db-sync push ${name}`)}`)
  else if (cmp.verdict === 'target-newer') say(`  ${blue(`${name} is ahead`)} — ${bold(`db-sync pull ${name}`)}`)
  else say(`  ${yellow('both sides changed around the same time')} — check before overwriting either one.`)

  if (local.libraryId && remote.libraryId && local.libraryId !== remote.libraryId) {
    say('')
    warn('these two databases have different library ids — they are separate collections,')
    warn('so copying one over the other replaces the whole thing rather than merging.')
  }
  say('')
}

async function cmdPush (name, flags) {
  const cfg = loadConfig()
  const dev = getDevice(cfg, name)
  const dbRelative = flags.db || cfg.database
  const dbPath = path.isAbsolute(dbRelative) ? dbRelative : path.join(ROOT, dbRelative)

  const local = localProbe(dbRelative, flags.verbose)
  if (!local.exists) fail(`no local database at ${bold(dbRelative)} — nothing to push.`)

  const remote = remoteProbe(dev, dbRelative, flags.verbose)
  const cmp = compare(local, remote)

  say('')
  printSide('this machine', local, dim('(source)'))
  say('')
  printSide(name, remote, dim(`(target — ${dev.host})`))
  say('')

  if (cmp.verdict === 'identical' && !flags.force) {
    say(`  ${green('already in sync')} — nothing to do. ${dim('(--force to copy anyway)')}`)
    return
  }
  if (cmp.verdict === 'target-newer' && !flags.force) {
    fail(
      `${bold(name)} has NEWER work than this machine (${humanTime(cmp.t)} vs ${humanTime(cmp.s)}).\n` +
      `  Pushing would throw that away.\n\n` +
      `  Did you mean:  ${bold(`node tools/db-sync.mjs pull ${name}`)}\n` +
      `  Or override:   ${bold(`node tools/db-sync.mjs push ${name} --force`)}`
    )
  }
  if (cmp.verdict === 'same-age' && !flags.force) {
    warn(`both sides were edited at about the same time — one of them is about to lose changes.`)
  }
  if (remote.walBytes > 0) {
    warn(`${name} has a non-empty write-ahead log; the board app is probably open over there.`)
    warn('close it before continuing so it does not write over what you copy.')
  }

  say(`  ${bold('plan')}  this machine  ${blue('──scp──▶')}  ${bold(name)}:${remote.dbAbsolute}`)
  if (remote.exists && !flags.noBackup) say(`        a timestamped backup is made on ${name} first`)
  say('')

  if (flags.dryRun) return say(`  ${dim('dry run — nothing was copied.')}`)
  if (!(await confirm(`  Copy this machine's board over ${bold(name)}?`, flags.yes))) {
    return say(`  ${dim('cancelled.')}`)
  }

  const snap = snapshot(dbPath, flags.verbose)
  try {
    const tempRemote = `${remote.dbAbsolute}.incoming-${stamp()}`
    say(`  ${dim('uploading…')}`)
    const up = run('scp', [...scpArgs(dev), snap, `${dev.host}:${tempRemote}`], {
      capture: !flags.verbose,
      verbose: flags.verbose
    })
    if (up.status !== 0) fail(`scp failed: ${up.stderr || up.stdout || `exit ${up.status}`}`)

    // Back up + swap in one remote shell so the live file is replaced atomically.
    const backupCmd = flags.noBackup
      ? 'true'
      : `if [ -f ${rq(remote.dbAbsolute)} ]; then mkdir -p ${rq(`${remote.root}/.db-backups`)} && cp ${rq(remote.dbAbsolute)} ${rq(`${remote.root}/.db-backups/pushed-over-${stamp()}.db`)}; fi`

    const install = ssh(dev, [
      `mkdir -p ${rq(path.posix.dirname(remote.dbAbsolute))}`,
      backupCmd,
      `mv ${rq(tempRemote)} ${rq(remote.dbAbsolute)}`,
      // Stale sidecars would otherwise be replayed on top of the new file.
      `rm -f ${rq(`${remote.dbAbsolute}-wal`)} ${rq(`${remote.dbAbsolute}-shm`)}`
    ].join(' && '), { verbose: flags.verbose })

    if (install.status !== 0) {
      fail(`could not install the file on ${name}: ${install.stderr || install.stdout}`)
    }

    say('')
    say(`  ${green('pushed')}   ${humanBytes(fs.statSync(snap).size)} to ${bold(name)}`)
    say(`  ${dim(`sha256 ${sha256File(snap).slice(0, 16)}…`)}`)
    say(`  ${dim(`Open the board on ${name} and keep going.`)}`)
    say('')
  } finally {
    fs.rmSync(snap, { force: true })
  }
}

async function cmdPull (name, flags) {
  const cfg = loadConfig()
  const dev = getDevice(cfg, name)
  const dbRelative = flags.db || cfg.database
  const dbPath = path.isAbsolute(dbRelative) ? dbRelative : path.join(ROOT, dbRelative)

  const local = localProbe(dbRelative, flags.verbose)
  const remote = remoteProbe(dev, dbRelative, flags.verbose)

  if (!remote.exists) fail(`${bold(name)} has no database at ${bold(remote.dbAbsolute)} — nothing to pull.`)

  const cmp = compare(remote, local)

  say('')
  printSide(name, remote, dim(`(source — ${dev.host})`))
  say('')
  printSide('this machine', local, dim('(target)'))
  say('')

  if (cmp.verdict === 'identical' && !flags.force) {
    say(`  ${green('already in sync')} — nothing to do. ${dim('(--force to copy anyway)')}`)
    return
  }
  if (cmp.verdict === 'target-newer' && !flags.force) {
    fail(
      `this machine has NEWER work than ${bold(name)} (${humanTime(cmp.t)} vs ${humanTime(cmp.s)}).\n` +
      `  Pulling would throw that away.\n\n` +
      `  Did you mean:  ${bold(`node tools/db-sync.mjs push ${name}`)}\n` +
      `  Or override:   ${bold(`node tools/db-sync.mjs pull ${name} --force`)}`
    )
  }
  if (cmp.verdict === 'same-age' && !flags.force) {
    warn('both sides were edited at about the same time — one of them is about to lose changes.')
  }
  if (local.walBytes > 0) {
    warn('this machine has a non-empty write-ahead log; stop the board app before pulling.')
  }

  say(`  ${bold('plan')}  ${bold(name)}  ${blue('──scp──▶')}  this machine:${dbRelative}`)
  if (local.exists && !flags.noBackup) say(`        a timestamped backup is made in .db-backups/ first`)
  say('')

  if (flags.dryRun) return say(`  ${dim('dry run — nothing was copied.')}`)
  if (!(await confirm(`  Replace this machine's board with ${bold(name)}'s?`, flags.yes))) {
    return say(`  ${dim('cancelled.')}`)
  }

  // Ask the far side for a clean snapshot rather than copying a live file.
  // (The remote has this repo cloned, so it has the same snapshot script.)
  const remoteSnap = `${remote.dbAbsolute}.snapshot-${stamp()}`
  const mk = ssh(
    dev,
    `cd ${rq(remote.root)} && node tools/db-snapshot.mjs ${rq(remoteSnap)} ${rq(dbRelative)}`,
    { verbose: flags.verbose }
  )

  let fetchFrom = remoteSnap
  let cleanupRemote = true
  if (mk.status !== 0) {
    warn('could not snapshot on the remote; copying the live file instead.')
    if (flags.verbose && mk.stderr) warn(mk.stderr)
    fetchFrom = remote.dbAbsolute
    cleanupRemote = false
  }

  // Land the download beside the real database, never in /tmp: the final step
  // is a rename, and rename is only atomic — only possible, even — within one
  // filesystem. /tmp is very often a separate one.
  fs.mkdirSync(path.dirname(dbPath), { recursive: true })
  const tmpLocal = `${dbPath}.incoming-${stamp()}-${crypto.randomBytes(3).toString('hex')}`

  try {
    say(`  ${dim('downloading…')}`)
    const down = run('scp', [...scpArgs(dev), `${dev.host}:${fetchFrom}`, tmpLocal], {
      capture: !flags.verbose,
      verbose: flags.verbose
    })
    if (down.status !== 0) fail(`scp failed: ${down.stderr || down.stdout || `exit ${down.status}`}`)

    // Sanity-check what arrived before letting it replace real work.
    try {
      const check = new DatabaseSync(tmpLocal, { readOnly: true })
      check.prepare('SELECT COUNT(*) AS n FROM boards').get()
      check.close()
    } catch (err) {
      fail(`the downloaded file is not a readable board database (${err.message}) — nothing was replaced.`)
    }

    // Back up first: this reads the current database *including* its -wal, so
    // it has to happen while that sidecar is still in place.
    if (!flags.noBackup && local.exists) {
      const backup = backupLocal(dbPath, `before-pull-from-${name}`)
      if (backup) say(`  ${dim(`backup   ${path.relative(ROOT, backup)}`)}`)
    }

    // Swap, then drop the old sidecars. In this order a failure anywhere above
    // leaves the existing database whole rather than half-replaced.
    fs.renameSync(tmpLocal, dbPath)
    fs.rmSync(`${dbPath}-wal`, { force: true })
    fs.rmSync(`${dbPath}-shm`, { force: true })

    say('')
    say(`  ${green('pulled')}   ${humanBytes(fs.statSync(dbPath).size)} from ${bold(name)}`)
    say(`  ${dim(`sha256 ${sha256File(dbPath).slice(0, 16)}…`)}`)
    say(`  ${dim('Start the app (npm run dev) and keep going.')}`)
    say('')
  } finally {
    fs.rmSync(tmpLocal, { force: true })
    if (cleanupRemote) ssh(dev, `rm -f ${rq(remoteSnap)}`)
  }
}

function cmdBackup (flags) {
  const cfg = fs.existsSync(CONFIG_PATH) ? loadConfig() : { database: DEFAULT_DB, devices: {} }
  const dbRelative = flags.db || cfg.database
  const dbPath = path.isAbsolute(dbRelative) ? dbRelative : path.join(ROOT, dbRelative)
  if (!fs.existsSync(dbPath)) fail(`no database at ${bold(dbRelative)}`)
  const dest = backupLocal(dbPath, 'manual')
  say(`${green('backed up')}  ${path.relative(ROOT, dest)}  (${humanBytes(fs.statSync(dest).size)})`)
}

async function cmdRestore (file, flags) {
  const cfg = fs.existsSync(CONFIG_PATH) ? loadConfig() : { database: DEFAULT_DB, devices: {} }
  const dbRelative = flags.db || cfg.database
  const dbPath = path.isAbsolute(dbRelative) ? dbRelative : path.join(ROOT, dbRelative)

  const backups = fs.existsSync(BACKUP_DIR)
    ? fs.readdirSync(BACKUP_DIR).filter((f) => f.endsWith('.db')).sort().reverse()
    : []

  if (!file) {
    say('')
    if (!backups.length) {
      say(`  ${dim('No backups yet. Make one with: db-sync backup')}`)
      say('')
      return
    }
    say(`  ${bold('backups')} ${dim(`in ${path.relative(ROOT, BACKUP_DIR)}/`)}`)
    for (const b of backups) {
      const st = fs.statSync(path.join(BACKUP_DIR, b))
      say(`    ${b}  ${dim(`${humanBytes(st.size)}  ${humanTime(st.mtimeMs)}`)}`)
    }
    say('')
    say(`  Restore one with: ${bold(`node tools/db-sync.mjs restore ${backups[0]}`)}`)
    say('')
    return
  }

  const src = path.isAbsolute(file) ? file : path.join(BACKUP_DIR, file)
  if (!fs.existsSync(src)) fail(`no such backup: ${file}`)

  say(`  This replaces ${bold(dbRelative)} with ${bold(path.basename(src))}.`)
  if (!(await confirm('  Continue?', flags.yes))) return say(`  ${dim('cancelled.')}`)

  if (fs.existsSync(dbPath)) backupLocal(dbPath, 'before-restore')
  fs.rmSync(`${dbPath}-wal`, { force: true })
  fs.rmSync(`${dbPath}-shm`, { force: true })
  fs.copyFileSync(src, dbPath)
  say(`${green('restored')}  ${dbRelative}`)
}

function cmdCheckpoint (flags) {
  const cfg = fs.existsSync(CONFIG_PATH) ? loadConfig() : { database: DEFAULT_DB, devices: {} }
  const dbRelative = flags.db || cfg.database
  const dbPath = path.isAbsolute(dbRelative) ? dbRelative : path.join(ROOT, dbRelative)
  if (!fs.existsSync(dbPath)) fail(`no database at ${bold(dbRelative)}`)
  const db = new DatabaseSync(dbPath)
  db.exec('PRAGMA wal_checkpoint(TRUNCATE)')
  db.close()
  say(`${green('ok')}       write-ahead log folded into ${dbRelative}; it is now a single clean file.`)
}

/* ----------------------------------------------------------------- help -- */

const HELP_TOPICS = {
  push: `
${bold('db-sync push <device>')}   send this machine's board to another machine

  Takes a consistent snapshot of the local database, copies it with scp, and
  swaps it into place on the far side atomically. The old remote database is
  backed up over there first (into .db-backups/) unless you pass --no-backup.

  ${bold('Refuses to run')} if the remote has newer edits than this machine, so you
  cannot silently overwrite an afternoon of work on the laptop. Override with
  --force once you are sure.

  ${bold('Options')}
    --yes, -y        do not ask for confirmation
    --force, -f      copy even if the remote is newer, or identical
    --dry-run, -n    show exactly what would happen, copy nothing
    --no-backup      skip the safety copy on the remote
    --db <path>      use a different database file
    --verbose, -v    print the ssh/scp commands being run

  ${bold('Examples')}
    node tools/db-sync.mjs push laptop
    node tools/db-sync.mjs push laptop --dry-run
    node tools/db-sync.mjs push laptop --yes --force
`,
  pull: `
${bold('db-sync pull <device>')}   bring another machine's board here

  Asks the remote for a clean snapshot, downloads it with scp, verifies the file
  really is a board database, backs up your current one into .db-backups/, and
  only then swaps it in.

  ${bold('Refuses to run')} if THIS machine has newer edits than the remote. Override
  with --force once you are sure.

  ${bold('Options')}
    --yes, -y        do not ask for confirmation
    --force, -f      copy even if this machine is newer, or identical
    --dry-run, -n    show exactly what would happen, copy nothing
    --no-backup      skip the local safety copy
    --db <path>      use a different database file
    --verbose, -v    print the ssh/scp commands being run

  ${bold('Examples')}
    node tools/db-sync.mjs pull pc
    node tools/db-sync.mjs pull pc --dry-run
`,
  status: `
${bold('db-sync status [device]')}   compare this machine with another one

  With no device: describes the local database (size, boards, items, last edit).
  With a device: probes the remote over ssh too and tells you which side is
  ahead, so you know whether you want push or pull.

  ${bold('Options')}
    --db <path>      inspect a different database file
    --verbose, -v    print the ssh commands being run

  ${bold('Examples')}
    node tools/db-sync.mjs status
    node tools/db-sync.mjs status laptop
`,
  init: `
${bold('db-sync init')}   create sync.config.json

  Writes a starter config with one example device. Edit the host and path to
  match your other machine. The file is gitignored because it is specific to the
  machine it lives on: on your PC it points at the laptop, and vice versa.
`,
  add: `
${bold('db-sync add <name> --host <user@host> [--path <repo>]')}   register a machine

  ${bold('Options')}
    --host <target>      required. e.g. serban@laptop.local or serban@192.168.1.42
    --path <dir>         where this repo is cloned there (default ~/Repos/mirror)
    --port <n>           ssh port, if not 22
    --identity <key>     ssh private key to use

  ${bold('Example')}
    node tools/db-sync.mjs add laptop --host serban@laptop.local --path ~/Repos/mirror
`,
  remove: `
${bold('db-sync remove <name>')}   forget a machine

  Only edits sync.config.json. Nothing on either machine is deleted.
`,
  devices: `
${bold('db-sync devices')}   list the machines you have registered

  Shows each device's ssh target and the repo path it expects on that side.
`,
  backup: `
${bold('db-sync backup')}   snapshot the local database into .db-backups/

  push and pull already do this automatically before overwriting anything; this
  is for when you are about to try something risky by hand.
`,
  restore: `
${bold('db-sync restore [file]')}   put a backup back

  With no argument: lists the backups in .db-backups/, newest first.
  With a filename: replaces the live database with that backup (after backing up
  the current one, naturally).

  ${bold('Example')}
    node tools/db-sync.mjs restore
    node tools/db-sync.mjs restore study-board-manual-20260901-141500.db
`,
  checkpoint: `
${bold('db-sync checkpoint')}   fold the write-ahead log into the database file

  SQLite keeps recent writes in a .db-wal sidecar. push and pull handle this for
  you. Run this when you want to copy data/study-board.db by hand — with a USB
  stick, say — and want the one file to be complete on its own.
`
}

function helpFor (topic) {
  if (topic && HELP_TOPICS[topic]) {
    say(HELP_TOPICS[topic])
    return
  }
  if (topic) warn(`no help topic named ${bold(topic)}`)

  say(`
${bold('db-sync')} ${dim(`v${VERSION}`)} — carry your study board between your own machines over scp

  The whole board is one SQLite file (${dim(DEFAULT_DB)}). This tool copies that
  file back and forth, with a snapshot, a backup, and a check that stops you
  overwriting newer work on the other side.

${bold('USAGE')}
  node tools/db-sync.mjs <command> [device] [options]
  npm run sync -- <command> [device] [options]     ${dim('(note the --)')}

${bold('COMMANDS')}
  ${bold('status')} [device]        compare this machine with another one
  ${bold('push')} <device>          send this machine's board to that device
  ${bold('pull')} <device>          bring that device's board here

  ${bold('init')}                   create sync.config.json
  ${bold('add')} <name> --host …    register a machine
  ${bold('remove')} <name>          forget a machine
  ${bold('devices')}                list registered machines

  ${bold('backup')}                 snapshot the local database into .db-backups/
  ${bold('restore')} [file]         list backups, or put one back
  ${bold('checkpoint')}             fold the -wal sidecar into the .db file
  ${bold('help')} [command]         detailed help for one command

${bold('OPTIONS')}
  -y, --yes            do not ask for confirmation
  -f, --force          proceed even if the target looks newer
  -n, --dry-run        show what would happen, copy nothing
  -v, --verbose        print the ssh/scp commands being run
      --no-backup      skip the safety copy before overwriting
      --db <path>      use a different database file
      --version        print the version

${bold('FIRST RUN')}
  On this machine:
    1. ${bold('node tools/db-sync.mjs init')}
    2. edit ${bold('sync.config.json')} — set host + path for your other machine
    3. ${bold('node tools/db-sync.mjs status laptop')}      ${dim('check it connects')}

  On the other machine, clone the repo, ${bold('npm install')}, and add an entry
  pointing back at this one. Each machine has its own sync.config.json.

${bold('TYPICAL DAY')}
  ${dim('# finishing on the PC, heading out with the laptop')}
  node tools/db-sync.mjs push laptop

  ${dim('# back at the PC afterwards')}
  node tools/db-sync.mjs pull laptop

${bold('THE ONE RULE')}
  This is a copy, not a merge. Whichever side you copy ${bold('from')} wins completely.
  Close the board app on the receiving machine first, and push before you walk
  away rather than after you have edited both sides.

${bold('SSH SETUP')}
  Needs plain ssh access between the machines — the same thing that makes
  ${bold('ssh you@laptop.local')} work. Key-based auth is worth the two minutes:
    ssh-keygen -t ed25519
    ssh-copy-id you@laptop.local

${bold('FILES')}
  ${DEFAULT_DB}       the board itself ${dim('(gitignored)')}
  sync.config.json               devices ${dim('(gitignored, per-machine)')}
  .db-backups/                   automatic safety copies ${dim('(gitignored)')}
`)
}

/* ----------------------------------------------------------------- args -- */

function parseArgs (argv) {
  const flags = {}
  const positional = []
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]
    if (a === '--') { positional.push(...argv.slice(i + 1)); break }
    if (a.startsWith('--')) {
      const key = a.slice(2)
      const camel = key.replace(/-([a-z])/g, (_, ch) => ch.toUpperCase())
      if (['host', 'path', 'port', 'identity', 'db', 'config'].includes(camel)) {
        flags[camel] = argv[++i]
      } else {
        flags[camel] = true
      }
    } else if (a.startsWith('-') && a.length > 1) {
      for (const ch of a.slice(1)) {
        if (ch === 'y') flags.yes = true
        else if (ch === 'f') flags.force = true
        else if (ch === 'n') flags.dryRun = true
        else if (ch === 'v') flags.verbose = true
        else if (ch === 'h') flags.help = true
        else if (ch === 'i') flags.identity = argv[++i]
        else fail(`unknown option -${ch}  (try: db-sync help)`)
      }
    } else {
      positional.push(a)
    }
  }
  return { flags, positional }
}

/* ----------------------------------------------------------------- main -- */

async function main () {
  const { flags, positional } = parseArgs(process.argv.slice(2))
  const [command, arg] = positional

  if (flags.version) return say(VERSION)
  if (!command || flags.help || command === 'help' || command === '--help') {
    return helpFor(command === 'help' ? arg : command && command !== '--help' ? command : null)
  }

  switch (command) {
    case 'init': return cmdInit()
    case 'devices':
    case 'list': return cmdDevices()
    case 'add': return cmdAdd(arg, flags)
    case 'remove':
    case 'rm': return cmdRemove(arg)
    case 'status':
    case 'st': return cmdStatus(arg, flags)
    case 'push': return cmdPush(arg, flags)
    case 'pull': return cmdPull(arg, flags)
    case 'backup': return cmdBackup(flags)
    case 'restore': return cmdRestore(arg, flags)
    case 'checkpoint': return cmdCheckpoint(flags)
    default:
      fail(`unknown command ${bold(command)}\n  Try: ${bold('node tools/db-sync.mjs help')}`)
  }
}

main().catch((err) => fail(err?.stack || String(err)))
