/**
 * A small, self-contained maths evaluator.
 *
 * Deliberately not `eval` and not a dependency: it parses a fixed grammar, so a
 * board full of expressions can never run arbitrary code, and the whole thing
 * still works with the laptop offline.
 *
 * Supports:
 *   numbers            42, 3.14, .5, 1e-3, 0x1f, 1_000
 *   operators          + - * / % ^  (^ is right-associative), unary -, postfix !
 *   implicit product   2pi, 3(4+5), 2x
 *   grouping           ( ) [ ]
 *   constants          pi, tau, e, phi
 *   functions          sqrt cbrt abs sign exp ln log log2 log10
 *                      sin cos tan asin acos atan atan2 sinh cosh tanh
 *                      floor ceil round trunc min max pow hypot gcd lcm
 *                      root(x,n) fact nCr nPr
 *   variables          x = 3, then 2x + 1
 *   percentages        20% -> 0.2,  and "150 + 10%" -> 165
 */

const CONSTANTS = {
  pi: Math.PI,
  'π': Math.PI,
  tau: Math.PI * 2,
  e: Math.E,
  phi: (1 + Math.sqrt(5)) / 2,
  inf: Infinity,
  infinity: Infinity
}

function factorial (n) {
  if (n < 0 || !Number.isFinite(n)) return NaN
  if (n > 170) return Infinity
  if (Math.floor(n) !== n) {
    // Gamma(n+1) via Lanczos, so 0.5! is still meaningful.
    return gamma(n + 1)
  }
  let out = 1
  for (let i = 2; i <= n; i++) out *= i
  return out
}

const G = [
  676.5203681218851, -1259.1392167224028, 771.32342877765313,
  -176.61502916214059, 12.507343278686905, -0.13857109526572012,
  9.9843695780195716e-6, 1.5056327351493116e-7
]

function gamma (z) {
  if (z < 0.5) return Math.PI / (Math.sin(Math.PI * z) * gamma(1 - z))
  z -= 1
  let x = 0.99999999999980993
  for (let i = 0; i < G.length; i++) x += G[i] / (z + i + 1)
  const t = z + G.length - 0.5
  return Math.sqrt(2 * Math.PI) * Math.pow(t, z + 0.5) * Math.exp(-t) * x
}

function gcd (a, b) {
  a = Math.abs(Math.round(a)); b = Math.abs(Math.round(b))
  while (b) { [a, b] = [b, a % b] }
  return a
}

const FUNCTIONS = {
  sqrt: { arity: 1, fn: Math.sqrt },
  cbrt: { arity: 1, fn: Math.cbrt },
  abs: { arity: 1, fn: Math.abs },
  sign: { arity: 1, fn: Math.sign },
  exp: { arity: 1, fn: Math.exp },
  ln: { arity: 1, fn: Math.log },
  log: { arity: 1, fn: Math.log10 },
  log10: { arity: 1, fn: Math.log10 },
  log2: { arity: 1, fn: Math.log2 },
  floor: { arity: 1, fn: Math.floor },
  ceil: { arity: 1, fn: Math.ceil },
  round: { arity: 1, fn: Math.round },
  trunc: { arity: 1, fn: Math.trunc },
  fact: { arity: 1, fn: factorial },
  gamma: { arity: 1, fn: gamma },

  sin: { arity: 1, angle: 'in', fn: Math.sin },
  cos: { arity: 1, angle: 'in', fn: Math.cos },
  tan: { arity: 1, angle: 'in', fn: Math.tan },
  asin: { arity: 1, angle: 'out', fn: Math.asin },
  acos: { arity: 1, angle: 'out', fn: Math.acos },
  atan: { arity: 1, angle: 'out', fn: Math.atan },
  sinh: { arity: 1, fn: Math.sinh },
  cosh: { arity: 1, fn: Math.cosh },
  tanh: { arity: 1, fn: Math.tanh },

  atan2: { arity: 2, angle: 'out', fn: Math.atan2 },
  pow: { arity: 2, fn: Math.pow },
  root: { arity: 2, fn: (x, n) => (x < 0 && n % 2 === 1 ? -Math.pow(-x, 1 / n) : Math.pow(x, 1 / n)) },
  hypot: { arity: -1, fn: (...a) => Math.hypot(...a) },
  min: { arity: -1, fn: (...a) => Math.min(...a) },
  max: { arity: -1, fn: (...a) => Math.max(...a) },
  gcd: { arity: -1, fn: (...a) => a.reduce(gcd) },
  lcm: { arity: -1, fn: (...a) => a.reduce((x, y) => Math.abs(x * y) / gcd(x, y)) },
  ncr: { arity: 2, fn: (n, r) => factorial(n) / (factorial(r) * factorial(n - r)) },
  npr: { arity: 2, fn: (n, r) => factorial(n) / factorial(n - r) },
  mean: { arity: -1, fn: (...a) => a.reduce((x, y) => x + y, 0) / a.length },
  sum: { arity: -1, fn: (...a) => a.reduce((x, y) => x + y, 0) }
}

export const FUNCTION_NAMES = Object.keys(FUNCTIONS)
export const CONSTANT_NAMES = Object.keys(CONSTANTS).filter((k) => /^[a-z]+$/.test(k))

/* --------------------------------------------------------------- tokens -- */

const OPERATORS = {
  '+': { prec: 1, assoc: 'left', fn: (a, b) => a + b },
  '-': { prec: 1, assoc: 'left', fn: (a, b) => a - b },
  '*': { prec: 2, assoc: 'left', fn: (a, b) => a * b },
  '/': { prec: 2, assoc: 'left', fn: (a, b) => a / b },
  '%': { prec: 2, assoc: 'left', fn: (a, b) => a % b },
  '^': { prec: 4, assoc: 'right', fn: (a, b) => Math.pow(a, b) }
}

class MathError extends Error {}

function tokenize (input) {
  const tokens = []
  let i = 0
  const src = input.replace(/−/g, '-').replace(/[×⋅]/g, '*').replace(/÷/g, '/')

  while (i < src.length) {
    const ch = src[i]

    if (ch === ' ' || ch === '\t') { i++; continue }

    if (/[0-9]/.test(ch) || (ch === '.' && /[0-9]/.test(src[i + 1] || ''))) {
      let j = i
      if (ch === '0' && /[xX]/.test(src[i + 1] || '')) {
        j = i + 2
        while (j < src.length && /[0-9a-fA-F_]/.test(src[j])) j++
        tokens.push({ type: 'num', value: parseInt(src.slice(i + 2, j).replace(/_/g, ''), 16) })
        i = j
        continue
      }
      while (j < src.length && /[0-9_]/.test(src[j])) j++
      if (src[j] === '.') { j++; while (j < src.length && /[0-9_]/.test(src[j])) j++ }
      if (/[eE]/.test(src[j] || '') && /[0-9+-]/.test(src[j + 1] || '')) {
        j++
        if (/[+-]/.test(src[j])) j++
        while (j < src.length && /[0-9]/.test(src[j])) j++
      }
      const value = Number(src.slice(i, j).replace(/_/g, ''))
      if (!Number.isFinite(value)) throw new MathError(`bad number "${src.slice(i, j)}"`)
      tokens.push({ type: 'num', value })
      i = j
      continue
    }

    if (/[a-zA-Z_π]/.test(ch)) {
      let j = i
      while (j < src.length && /[a-zA-Z0-9_π]/.test(src[j])) j++
      tokens.push({ type: 'name', value: src.slice(i, j) })
      i = j
      continue
    }

    if (ch === '(' || ch === '[') { tokens.push({ type: 'lparen' }); i++; continue }
    if (ch === ')' || ch === ']') { tokens.push({ type: 'rparen' }); i++; continue }
    if (ch === ',' || ch === ';') { tokens.push({ type: 'comma' }); i++; continue }
    if (ch === '!') { tokens.push({ type: 'postfix', value: '!' }); i++; continue }

    if (ch === '*' && src[i + 1] === '*') { tokens.push({ type: 'op', value: '^' }); i += 2; continue }
    if (OPERATORS[ch]) { tokens.push({ type: 'op', value: ch }); i++; continue }

    throw new MathError(`unexpected character "${ch}"`)
  }
  return tokens
}

/**
 * Insert the multiplications people leave out: 2pi, 3(x+1), (a)(b), 2x.
 * `%` after a value becomes a postfix percent instead of a modulo.
 */
function normalize (tokens) {
  const out = []
  for (let i = 0; i < tokens.length; i++) {
    const t = tokens[i]
    const prev = out[out.length - 1]

    if (t.type === 'op' && t.value === '%' && prev &&
        (prev.type === 'num' || prev.type === 'rparen' || prev.type === 'postfix' ||
         (prev.type === 'name' && !FUNCTIONS[prev.value.toLowerCase()]))) {
      const next = tokens[i + 1]
      const isModulo = next && (next.type === 'num' || next.type === 'name' || next.type === 'lparen')
      if (!isModulo) { out.push({ type: 'postfix', value: '%' }); continue }
    }

    const prevIsValue = prev && (
      prev.type === 'num' || prev.type === 'rparen' || prev.type === 'postfix' ||
      (prev.type === 'name' && !FUNCTIONS[prev.value.toLowerCase()])
    )
    const startsValue = t.type === 'num' || t.type === 'name' || t.type === 'lparen'

    if (prevIsValue && startsValue) out.push({ type: 'op', value: '*', implicit: true })
    out.push(t)
  }
  return out
}

/* ------------------------------------------------------------ evaluator -- */

/**
 * Evaluate one expression.
 * @param {string} input
 * @param {object} scope   variable name -> number (mutated by assignments)
 * @param {object} options { degrees?: boolean }
 * @returns {number}
 */
export function evaluate (input, scope = {}, options = {}) {
  const degrees = !!options.degrees
  const toRad = (v) => (degrees ? (v * Math.PI) / 180 : v)
  const fromRad = (v) => (degrees ? (v * 180) / Math.PI : v)

  const tokens = normalize(tokenize(input))
  if (!tokens.length) throw new MathError('empty expression')

  const values = []
  // Tracks which stack entries came from a `%` postfix, so that `150 + 10%`
  // reads as "ten percent of 150" the way it would on a till receipt, while
  // `200 * 10%` still means "times 0.1".
  const percents = []
  const ops = []
  let expectValue = true // distinguishes unary minus from subtraction

  const pushValue = (v, isPercent = false) => {
    values.push(v)
    percents.push(isPercent)
  }
  const popValue = () => {
    percents.pop()
    return values.pop()
  }

  const applyOperator = (op) => {
    if (op.type === 'unary') {
      const wasPercent = percents[percents.length - 1] === true
      const a = popValue()
      if (a === undefined) throw new MathError('missing operand')
      pushValue(op.value === '-' ? -a : a, wasPercent)
      return
    }
    if (op.type === 'func') {
      const spec = FUNCTIONS[op.name]
      const args = values.splice(values.length - op.argc, op.argc)
      percents.splice(percents.length - op.argc, op.argc)
      if (args.length !== op.argc) throw new MathError(`${op.name}() got too few arguments`)
      if (spec.arity !== -1 && spec.arity !== op.argc) {
        throw new MathError(`${op.name}() takes ${spec.arity} argument${spec.arity === 1 ? '' : 's'}, got ${op.argc}`)
      }
      let result
      if (spec.angle === 'in') result = spec.fn(...args.map(toRad))
      else result = spec.fn(...args)
      if (spec.angle === 'out') result = fromRad(result)
      pushValue(result)
      return
    }
    const bIsPercent = percents[percents.length - 1] === true
    const b = popValue()
    const a = popValue()
    if (a === undefined || b === undefined) throw new MathError(`missing operand for "${op.value}"`)
    const relative = bIsPercent && (op.value === '+' || op.value === '-')
    pushValue(OPERATORS[op.value].fn(a, relative ? a * b : b))
  }

  const popWhile = (test) => {
    while (ops.length && test(ops[ops.length - 1])) applyOperator(ops.pop())
  }

  for (let i = 0; i < tokens.length; i++) {
    const t = tokens[i]

    if (t.type === 'num') {
      pushValue(t.value)
      expectValue = false
      continue
    }

    if (t.type === 'name') {
      const lower = t.value.toLowerCase()
      if (FUNCTIONS[lower]) {
        if (tokens[i + 1]?.type !== 'lparen') {
          // Allow `sin 30` and `sqrt 9` — grab the next value only.
          ops.push({ type: 'func', name: lower, argc: 1, bare: true })
          expectValue = true
          continue
        }
        ops.push({ type: 'func', name: lower, argc: 1 })
        expectValue = true
        continue
      }
      if (lower in CONSTANTS) { pushValue(CONSTANTS[lower]); expectValue = false; continue }
      if (Object.hasOwn(scope, t.value)) { pushValue(scope[t.value]); expectValue = false; continue }
      if (Object.hasOwn(scope, lower)) { pushValue(scope[lower]); expectValue = false; continue }
      throw new MathError(`unknown name "${t.value}"`)
    }

    if (t.type === 'op') {
      if (expectValue) {
        if (t.value === '-' || t.value === '+') {
          ops.push({ type: 'unary', value: t.value })
          continue
        }
        throw new MathError(`unexpected "${t.value}"`)
      }
      const o = OPERATORS[t.value]
      popWhile((top) => {
        if (top.type === 'lparen' || top.type === 'func') return top.type === 'func' && top.bare
        if (top.type === 'unary') return o.prec <= 3
        return o.assoc === 'left' ? OPERATORS[top.value].prec >= o.prec : OPERATORS[top.value].prec > o.prec
      })
      ops.push({ type: 'binary', value: t.value })
      expectValue = true
      continue
    }

    if (t.type === 'postfix') {
      const a = popValue()
      if (a === undefined) throw new MathError(`nothing to apply "${t.value}" to`)
      pushValue(t.value === '!' ? factorial(a) : a / 100, t.value === '%')
      expectValue = false
      continue
    }

    if (t.type === 'lparen') {
      ops.push({ type: 'lparen', argc: 1 })
      expectValue = true
      continue
    }

    if (t.type === 'comma') {
      popWhile((top) => top.type !== 'lparen')
      const open = ops[ops.length - 1]
      if (!open) throw new MathError('comma outside of a function call')
      open.argc++
      expectValue = true
      continue
    }

    if (t.type === 'rparen') {
      popWhile((top) => top.type !== 'lparen')
      const open = ops.pop()
      if (!open) throw new MathError('unbalanced )')
      const fn = ops[ops.length - 1]
      if (fn && fn.type === 'func' && !fn.bare) {
        fn.argc = open.argc
        applyOperator(ops.pop())
      } else if (open.argc > 1) {
        throw new MathError('commas only make sense inside a function call')
      }
      expectValue = false
      continue
    }
  }

  popWhile((top) => {
    if (top.type === 'lparen') throw new MathError('unbalanced (')
    return true
  })

  if (values.length !== 1) throw new MathError('incomplete expression')
  return values[0]
}

/* ------------------------------------------------------------ notebook -- */

const ASSIGNMENT = /^\s*([a-zA-Z_][a-zA-Z0-9_]*)\s*(?:=|:=)\s*(.+)$/

/**
 * Evaluate a multi-line calculator sheet. Each line yields a result; variables
 * and `ans` carry forward, blank lines and `#` comments pass through.
 *
 * @returns {Array<{ text, value, error, kind, name }>}
 */
export function evaluateSheet (source, options = {}) {
  const scope = Object.create(null)
  const lines = String(source ?? '').split('\n')
  const results = []
  let last = null

  for (const raw of lines) {
    const line = raw.replace(/\/\/.*$/, '').replace(/#.*$/, '').trim()

    if (!line) {
      results.push({ text: raw, kind: 'blank', value: null, error: null })
      continue
    }

    try {
      const m = ASSIGNMENT.exec(line)
      if (m && !FUNCTION_NAMES.includes(m[1].toLowerCase()) && !CONSTANT_NAMES.includes(m[1].toLowerCase())) {
        const value = evaluate(m[2], { ...scope, ans: last ?? 0 }, options)
        scope[m[1]] = value
        last = value
        results.push({ text: raw, kind: 'assign', name: m[1], value, error: null })
      } else {
        const value = evaluate(line, { ...scope, ans: last ?? 0 }, options)
        last = value
        results.push({ text: raw, kind: 'value', value, error: null })
      }
    } catch (err) {
      results.push({ text: raw, kind: 'error', value: null, error: err.message })
    }
  }

  return results
}

/**
 * Compile `f(x)` once and reuse it for every sample — the plotter calls this
 * hundreds of times per redraw, so re-tokenising each point would be wasteful.
 */
export function compileFunction (expression, variable = 'x', options = {}) {
  const body = String(expression).replace(/^\s*[a-zA-Z]\s*\(\s*[a-zA-Z]\s*\)\s*=\s*/, '').replace(/^\s*y\s*=\s*/, '')
  const tokens = normalize(tokenize(body))
  if (!tokens.length) throw new MathError('empty expression')
  // Validate once with a probe value so errors surface before plotting.
  evaluate(body, { [variable]: 1 }, options)
  return (v) => {
    try {
      return evaluate(body, { [variable]: v }, options)
    } catch {
      return NaN
    }
  }
}

/** Format a number the way a calculator would: readable, not noisy. */
export function formatNumber (value, precision = 10) {
  if (value === null || value === undefined) return ''
  if (typeof value !== 'number' || Number.isNaN(value)) return 'NaN'
  if (!Number.isFinite(value)) return value > 0 ? '∞' : '-∞'
  if (value === 0) return '0'

  const abs = Math.abs(value)
  if (abs >= 1e15 || abs < 1e-7) return value.toExponential(6).replace(/e([+-])(\d)$/, 'e$10$2')

  const rounded = Number(value.toPrecision(precision))
  if (Number.isInteger(rounded)) return rounded.toLocaleString('en-US', { maximumFractionDigits: 0 })

  const decimals = Math.min(20, Math.max(0, precision - Math.floor(Math.log10(abs)) - 1))
  return rounded.toLocaleString('en-US', { maximumFractionDigits: decimals })
}
