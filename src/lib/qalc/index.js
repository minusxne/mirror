/**
 * A Qalculate-flavoured expression engine.
 *
 * Aims to behave the way `qalc` does for the things a study board actually
 * needs: exact answers where they exist, units carried through the arithmetic,
 * `to` conversions, and angle-aware trigonometry so `sin 30deg` is a half
 * rather than a decimal accident.
 *
 * Deliberately not a Qalculate port. There is no currency, no symbolic algebra,
 * no date arithmetic, and the automatic choice of output unit is simpler.
 * Everything it does claim to do is checked against real qalc output.
 */
import * as R from './rational.js'
import {
  CONSTANTS,
  PREFERRED,
  UNITS,
  dimEqual,
  dimIsEmpty,
  dimMul,
  dimPow,
  dimToString,
  lookupUnit
} from './units.js'

/* --------------------------------------------------------------- values -- */

/**
 * A quantity: a number, the dimension it lives in, and — when the user named
 * one — the unit it should be shown in.
 */
const qty = (value, dim = {}, display = null) => ({ value, dim, display })

const scalar = (value) => qty(value, {})

const isScalar = (q) => dimIsEmpty(q.dim)

class QalcError extends Error {
  constructor (message, partial = false) {
    super(message)
    // `partial` marks the errors you get from an expression that is merely
    // unfinished, so a live view can stay quiet until you stop typing.
    this.partial = partial
  }
}
const fail = (msg) => { throw new QalcError(msg) }
const failPartial = (msg) => { throw new QalcError(msg, true) }

/* ------------------------------------------------------------ tokeniser -- */

const NAME_START = /[A-Za-zΩµμπ°_]/
const NAME_PART = /[A-Za-z0-9Ωµμπ°_]/

function tokenize (input) {
  const src = String(input)
    .replace(/[−–—]/g, '-')
    .replace(/[×⋅·]/g, '*')
    .replace(/÷/g, '/')
    .replace(/≤/g, '<=')
    .replace(/≥/g, '>=')

  const tokens = []
  let i = 0

  while (i < src.length) {
    const ch = src[i]

    if (ch === ' ' || ch === '\t') {
      // Space is not nothing: it separates `5 m m` from `5 mm`.
      tokens.push({ type: 'space' })
      i++
      continue
    }

    if (/[0-9]/.test(ch) || (ch === '.' && /[0-9]/.test(src[i + 1] || ''))) {
      if (ch === '0' && /[xX]/.test(src[i + 1] || '')) {
        let j = i + 2
        while (j < src.length && /[0-9a-fA-F_]/.test(src[j])) j++
        tokens.push({ type: 'num', value: R.exact(BigInt(parseInt(src.slice(i + 2, j).replace(/_/g, ''), 16))) })
        i = j
        continue
      }
      if (ch === '0' && /[bB]/.test(src[i + 1] || '') && /[01]/.test(src[i + 2] || '')) {
        let j = i + 2
        while (j < src.length && /[01_]/.test(src[j])) j++
        tokens.push({ type: 'num', value: R.exact(BigInt(parseInt(src.slice(i + 2, j).replace(/_/g, ''), 2))) })
        i = j
        continue
      }
      let j = i
      while (j < src.length && /[0-9_]/.test(src[j])) j++
      if (src[j] === '.' && /[0-9]/.test(src[j + 1] || '')) {
        j++
        while (j < src.length && /[0-9_]/.test(src[j])) j++
      } else if (src[j] === '.' && !NAME_START.test(src[j + 1] || '')) {
        j++
      }
      if (/[eE]/.test(src[j] || '') && /[0-9+-]/.test(src[j + 1] || '')) {
        const save = j
        j++
        if (/[+-]/.test(src[j])) j++
        if (/[0-9]/.test(src[j])) { while (j < src.length && /[0-9]/.test(src[j])) j++ } else j = save
      }
      tokens.push({ type: 'num', value: R.fromDecimalString(src.slice(i, j).replace(/_/g, '')) })
      i = j
      continue
    }

    if (NAME_START.test(ch)) {
      let j = i
      while (j < src.length && NAME_PART.test(src[j])) j++
      tokens.push({ type: 'name', value: src.slice(i, j) })
      i = j
      continue
    }

    if (ch === '(' || ch === '[') { tokens.push({ type: '(' }); i++; continue }
    if (ch === ')' || ch === ']') { tokens.push({ type: ')' }); i++; continue }
    if (ch === ',' || ch === ';') { tokens.push({ type: ',' }); i++; continue }
    if (ch === '!') { tokens.push({ type: '!' }); i++; continue }
    if (ch === '%') { tokens.push({ type: '%' }); i++; continue }

    if (src.startsWith('->', i) || src.startsWith('=>', i)) { tokens.push({ type: 'to' }); i += 2; continue }
    if (src.startsWith('**', i)) { tokens.push({ type: 'op', value: '^' }); i += 2; continue }
    if (src.startsWith('//', i)) { tokens.push({ type: 'op', value: '//' }); i += 2; continue }
    if ('+-*/^'.includes(ch)) { tokens.push({ type: 'op', value: ch }); i++; continue }

    fail(`unexpected character "${ch}"`)
  }

  tokens.push({ type: 'end' })
  return tokens
}

/* --------------------------------------------------------------- parser -- */

const FUNCTIONS = {
  sqrt: 1, cbrt: 1, abs: 1, sign: 1, exp: 1, ln: 1, log: -1, log2: 1, log10: 1, lg: 1,
  sin: 1, cos: 1, tan: 1, asin: 1, acos: 1, atan: 1, atan2: 2,
  sinh: 1, cosh: 1, tanh: 1, asinh: 1, acosh: 1, atanh: 1,
  floor: 1, ceil: 1, round: 1, trunc: 1, fac: 1, factorial: 1, gamma: 1,
  min: -1, max: -1, hypot: -1, gcd: -1, lcm: -1, sum: -1, mean: -1, average: -1,
  root: 2, pow: 2, mod: 2, rem: 2, ncr: 2, npr: 2, comb: 2, perm: 2, cbrt2: 1
}

const isFunction = (n) => Object.hasOwn(FUNCTIONS, n.toLowerCase())

/**
 * Recursive-descent parser.
 *
 * Precedence, loosest first: `to` conversion, +/-, * and /, implicit product,
 * unary minus, ^, postfix ! and %, then atoms. Implicit multiplication binds
 * tighter than explicit division so that `100 km/h` is a speed and not
 * `(100 km)/h` — the same reading Qalculate takes.
 */
function parse (tokens, scope) {
  let pos = 0
  const peek = (k = 0) => tokens[pos + k]
  const skipSpace = () => { while (peek().type === 'space') pos++ }

  function at (type, value) {
    skipSpace()
    const t = peek()
    return t.type === type && (value === undefined || t.value === value)
  }

  function eat (type, value) {
    if (!at(type, value)) return false
    pos++
    return true
  }

  function parseExpression () {
    let left = parseSum()
    for (;;) {
      skipSpace()
      if (peek().type === 'to') { pos++; left = { kind: 'convert', from: left, to: parseUnitTarget() }; continue }
      if (peek().type === 'name' && ['to', 'in', 'as'].includes(peek().value.toLowerCase()) && isConversionAhead()) {
        pos++
        left = { kind: 'convert', from: left, to: parseUnitTarget() }
        continue
      }
      return left
    }
  }

  /** `in` is a unit as well as a keyword, so only treat it as one if a unit
   *  expression follows and the thing before it already had a dimension. */
  function isConversionAhead () {
    let k = 1
    while (tokens[pos + k]?.type === 'space') k++
    const t = tokens[pos + k]
    return t && (t.type === 'name' || t.type === '(')
  }

  function parseUnitTarget () {
    skipSpace()
    if (at('name')) {
      const word = peek().value.toLowerCase()
      if (['fraction', 'frac'].includes(word)) { pos++; return { kind: 'toFraction' } }
      if (['decimal', 'dec'].includes(word)) { pos++; return { kind: 'toDecimal' } }
      if (['hex', 'hexadecimal'].includes(word)) { pos++; return { kind: 'toBase', base: 16 } }
      if (['bin', 'binary'].includes(word)) { pos++; return { kind: 'toBase', base: 2 } }
      if (['oct', 'octal'].includes(word)) { pos++; return { kind: 'toBase', base: 8 } }
      if (['sci', 'scientific'].includes(word)) { pos++; return { kind: 'toSci' } }
    }
    return { kind: 'unitExpr', node: parseProduct() }
  }

  function parseSum () {
    let left = parseProduct()
    for (;;) {
      skipSpace()
      const t = peek()
      if (t.type === 'op' && (t.value === '+' || t.value === '-')) {
        pos++
        const right = parseProduct()
        left = { kind: 'binary', op: t.value, left, right }
        continue
      }
      return left
    }
  }

  function parseProduct () {
    let left = parseImplicit()
    for (;;) {
      skipSpace()
      const t = peek()
      if (t.type === 'op' && ['*', '/', '//'].includes(t.value)) {
        pos++
        const right = parseImplicit()
        left = { kind: 'binary', op: t.value, left, right }
        continue
      }
      if (t.type === 'name' && t.value.toLowerCase() === 'of') {
        pos++
        left = { kind: 'binary', op: '*', left, right: parseImplicit() }
        continue
      }
      if (t.type === 'name' && ['mod', 'rem'].includes(t.value.toLowerCase())) {
        pos++
        const right = parseImplicit()
        left = { kind: 'binary', op: 'mod', left, right }
        continue
      }
      return left
    }
  }

  /** Juxtaposition: `2pi`, `3(x+1)`, `100 km`, `9.81 m/s^2`. */
  function parseImplicit () {
    let left = parseUnary()
    for (;;) {
      const save = pos
      skipSpace()
      const t = peek()
      const startsValue =
        t.type === 'num' || t.type === '(' ||
        (t.type === 'name' && !['to', 'in', 'as', 'mod', 'rem', 'of', 'and', 'where'].includes(t.value.toLowerCase()))
      if (!startsValue) { pos = save; return left }
      const right = parseUnary()
      left = { kind: 'binary', op: '*', left, right, implicit: true }
    }
  }

  function parseUnary () {
    skipSpace()
    const t = peek()
    if (t.type === 'op' && (t.value === '-' || t.value === '+')) {
      pos++
      const operand = parseUnary()
      return t.value === '-' ? { kind: 'neg', operand } : operand
    }
    return parsePower()
  }

  function parsePower () {
    const base = parsePostfix()
    const save = pos
    skipSpace()
    if (peek().type === 'op' && peek().value === '^') {
      pos++
      // Right-associative, and the exponent may itself be signed.
      const exponent = parseUnary()
      return { kind: 'binary', op: '^', left: base, right: exponent }
    }
    pos = save
    return base
  }

  function parsePostfix () {
    let node = parseAtom()
    for (;;) {
      const save = pos
      // No skipSpace: `5 !` is not a factorial, and `50 %` should still read
      // as a percentage, so only `%` tolerates the space.
      if (peek().type === '!') { pos++; node = { kind: 'factorial', operand: node }; continue }
      if (peek().type === '%') { pos++; node = { kind: 'percent', operand: node }; continue }
      skipSpace()
      if (peek().type === '%') { pos++; node = { kind: 'percent', operand: node }; continue }
      pos = save
      // A digit exponent glued to a unit: `m2` means m^2.
      return node
    }
  }

  function parseAtom () {
    skipSpace()
    const t = peek()

    if (t.type === 'num') {
      pos++
      return { kind: 'number', value: t.value }
    }

    if (t.type === '(') {
      pos++
      const inner = parseExpression()
      if (!eat(')')) failPartial('missing )')
      return inner
    }

    if (t.type === 'name') {
      const raw = t.value
      const lower = raw.toLowerCase()
      pos++

      // `min` is both a function and a minute. Without parentheses the unit
      // reading is the useful one, which is how `60 s to min` works.
      const calledWithParens = (() => {
        let k = 0
        while (tokens[pos + k]?.type === 'space') k++
        return tokens[pos + k]?.type === '('
      })()

      if (isFunction(lower) && !(lookupUnit(raw) && !calledWithParens)) {
        const save = pos
        skipSpace()
        if (peek().type === '(') {
          pos++
          const args = []
          if (!at(')')) {
            do { args.push(parseExpression()) } while (eat(','))
          }
          if (!eat(')')) failPartial(`missing ) after ${raw}(`)
          return { kind: 'call', name: lower, args }
        }
        // `sin 30deg`, `sqrt 16` — the argument is the whole implicit product
        // that follows, so the unit belongs to the angle and not to the result.
        // It still stops at + and -, leaving `sin 30deg + 1` well behaved.
        pos = save
        skipSpace()
        if (peek().type === 'end') failPartial(`${raw} needs a value`)
        return { kind: 'call', name: lower, args: [parseImplicit()], bare: true }
      }

      return { kind: 'name', value: raw }
    }

    if (t.type === 'end') failPartial('incomplete expression')
    fail(`unexpected "${t.value ?? t.type}"`)
  }

  const tree = parseExpression()
  skipSpace()
  if (peek().type !== 'end') fail(`unexpected "${peek().value ?? peek().type}"`)
  return tree
}

/* ------------------------------------------------------------ evaluator -- */

const PI = R.inexact(Math.PI)

/** Exact sine values at multiples of 30° and 45°, so `sin 30deg` is 1/2. */
function exactTrig (fn, radians) {
  if (!Number.isFinite(radians)) return null
  const turns = radians / (Math.PI / 2) // quarter turns
  const twelfths = radians / (Math.PI / 12)
  const nearest = Math.round(twelfths)
  if (Math.abs(twelfths - nearest) > 1e-12) return null
  void turns

  const k = ((nearest % 24) + 24) % 24
  const HALF = R.exact(1n, 2n)
  const NEG_HALF = R.exact(-1n, 2n)
  const table = {
    sin: {
      0: R.ZERO, 2: HALF, 6: R.ONE, 10: HALF, 12: R.ZERO,
      14: NEG_HALF, 18: R.exact(-1n), 22: NEG_HALF
    },
    cos: {
      0: R.ONE, 4: HALF, 6: R.ZERO, 8: NEG_HALF, 12: R.exact(-1n),
      16: NEG_HALF, 18: R.ZERO, 20: HALF
    },
    tan: { 0: R.ZERO, 6: null, 12: R.ZERO, 18: null }
  }
  const found = table[fn]?.[k]
  return found === undefined ? null : found
}

function toBaseValue (q) {
  return q.value
}

function evaluate (node, scope) {
  switch (node.kind) {
    case 'number':
      return scalar(node.value)

    case 'neg': {
      const v = evaluate(node.operand, scope)
      return { ...v, value: R.neg(v.value) }
    }

    case 'name':
      return resolveName(node.value, scope)

    case 'percent': {
      const v = evaluate(node.operand, scope)
      return { ...v, value: R.div(v.value, R.exact(100n)), percent: true }
    }

    case 'factorial': {
      const v = evaluate(node.operand, scope)
      if (!isScalar(v)) fail('factorial needs a plain number')
      return scalar(factorial(v.value))
    }

    case 'binary':
      return applyBinary(node, scope)

    case 'call':
      return applyFunction(node, scope)

    case 'convert':
      return applyConversion(node, scope)

    default:
      fail('cannot evaluate that')
  }
}

function resolveName (raw, scope) {
  if (Object.hasOwn(scope, raw)) return scope[raw]
  const lower = raw.toLowerCase()
  if (Object.hasOwn(scope, lower)) return scope[lower]

  // Exact unit names come first: `h` is an hour and `T` a tesla, the way qalc
  // reads them. Constants only get a look in when no unit claims the name,
  // which still leaves c, e, pi and G to mean what you would expect.
  if (Object.hasOwn(UNITS, raw)) return unitQuantity(raw, UNITS[raw], 1, '')

  if (Object.hasOwn(CONSTANTS, raw)) {
    const c = CONSTANTS[raw]
    return qty(R.inexact(c.value), c.dim, c.symbol ? unitDisplay(c.symbol) : null)
  }
  if (Object.hasOwn(CONSTANTS, lower)) {
    const c = CONSTANTS[lower]
    return qty(R.inexact(c.value), c.dim, c.symbol ? unitDisplay(c.symbol) : null)
  }

  const found = lookupUnit(raw)
  if (found) return unitQuantity(raw, found.unit, found.factor, found.prefix)
  failPartial(`unknown name "${raw}"`)
}

/**
 * A written unit, as a quantity.
 *
 * `value` is always in base units — one km is 1000 — and `display.factor`
 * records how to get back to what the user wrote. Storing the base value is
 * what makes `1 km - 250 m` arithmetic rather than string matching; keeping
 * the factor is what stops the answer being labelled with the wrong unit.
 */
function unitQuantity (raw, unit, factor, prefix) {
  const scale = unit.factor * factor
  return {
    value: R.inexact(scale),
    dim: unit.dim,
    bareUnit: true,
    display: {
      parts: [{ text: `${prefix}${unit.symbol}`, power: 1 }],
      factor: scale,
      offset: unit.offset || 0
    }
  }
}

const unitDisplay = (text) => ({ parts: [{ text, power: 1 }], factor: 1, offset: 0 })

function applyBinary (node, scope) {
  const op = node.op
  const a = evaluate(node.left, scope)

  if (op === '^') {
    const b = evaluate(node.right, scope)
    if (!isScalar(b)) fail('exponent must be a plain number')
    const exp = b.value
    if (!isScalar(a)) {
      if (!R.isInteger(exp)) fail('a unit can only be raised to a whole power')
      const n = Number(R.toNumber(exp))
      const d = a.display
      const scaled = d
        ? { parts: d.parts.map((p) => ({ ...p, power: p.power * n })), factor: Math.pow(d.factor, n), offset: 0 }
        : null
      return qty(R.pow(a.value, exp), dimPow(a.dim, n), scaled)
    }
    return scalar(R.pow(a.value, exp))
  }

  const b = evaluate(node.right, scope)

  switch (op) {
    case '+':
    case '-': {
      // `50 + 20%` is fifty plus a fifth of fifty, as on a till.
      if (b.percent && isScalar(b)) {
        const delta = R.mul(a.value, b.value)
        return { ...a, value: op === '+' ? R.add(a.value, delta) : R.sub(a.value, delta) }
      }
      if (!dimEqual(a.dim, b.dim)) {
        fail(`cannot add ${describeDim(a)} to ${describeDim(b)}`)
      }
      const value = op === '+' ? R.add(a.value, b.value) : R.sub(a.value, b.value)
      return qty(value, a.dim, pickDisplay(value, a.display, b.display))
    }

    case '*': {
      // `100 degC` is an absolute reading, so the offset applies here rather
      // than being carried around as if °C were just a scale.
      const offsetSide = a.bareUnit && a.display?.offset ? a : b.bareUnit && b.display?.offset ? b : null
      const other = offsetSide === a ? b : a
      if (offsetSide && isScalar(other)) {
        const base = R.add(R.mul(other.value, R.inexact(offsetSide.display.factor)),
          R.inexact(offsetSide.display.offset))
        return qty(base, offsetSide.dim, offsetSide.display)
      }
      return qty(R.mul(a.value, b.value), dimMul(a.dim, b.dim), mergeDisplay(a, b, '*'))
    }

    case '/':
      if (R.isZero(b.value)) fail('division by zero')
      return qty(R.div(a.value, b.value), dimMul(a.dim, b.dim, -1), mergeDisplay(a, b, '/'))

    case 'mod': {
      if (R.isZero(b.value)) fail('division by zero')
      const x = R.toNumber(a.value)
      const y = R.toNumber(b.value)
      const r = x - y * Math.floor(x / y)
      return qty(R.fromDecimalString(String(r)), a.dim, a.display)
    }

    case '//': {
      if (R.isZero(b.value)) fail('division by zero')
      const v = Math.floor(R.toNumber(a.value) / R.toNumber(b.value))
      return qty(R.exact(BigInt(v)), dimMul(a.dim, b.dim, -1))
    }

    default:
      fail(`unknown operator ${op}`)
  }
}

/**
 * Keep the units the user wrote, as a list of symbol/exponent pairs.
 *
 * Tracking exponents rather than a joined string is what lets `3 m * 4 m` come
 * back as m² instead of m·m, and `m/s^2` keep its square.
 */
function combineParts (a, b, sign) {
  const out = a.parts.map((p) => ({ ...p }))
  for (const p of b.parts) {
    const existing = out.find((q) => q.text === p.text)
    if (existing) existing.power += sign * p.power
    else out.push({ ...p, power: sign * p.power })
  }
  const kept = out.filter((p) => p.power !== 0)
  if (!kept.length) return null
  // An offset only means anything for a lone absolute temperature; the moment
  // it is combined with something else it is a scale factor like any other.
  return { parts: kept, factor: a.factor * Math.pow(b.factor, sign), offset: 0 }
}

const EMPTY_DISPLAY = { parts: [], factor: 1, offset: 0 }

function mergeDisplay (a, b, op) {
  const sign = op === '/' ? -1 : 1
  const ad = a.display
  const bd = b.display
  if (ad && bd) return combineParts(ad, bd, sign)
  if (ad) return isScalar(b) ? ad : null
  if (bd) return isScalar(a) ? combineParts(EMPTY_DISPLAY, bd, sign) : null
  return null
}

/**
 * Which of two units should the sum be shown in?
 *
 * Whichever puts the number in a range you would read aloud: 750 m beats
 * 0.75 km, and 2.3 m beats 230 cm. This is roughly the instinct Qalculate
 * applies when it picks a prefix.
 */
function pickDisplay (value, a, b) {
  if (!a) return b
  if (!b) return a
  const score = (d) => {
    const shown = Math.abs(R.toNumber(value) / d.factor)
    if (shown === 0) return 0
    if (shown >= 1 && shown < 1000) return 0
    return Math.abs(Math.log10(shown) - 1)
  }
  return score(b) < score(a) ? b : a
}

const describeDim = (q) => (dimIsEmpty(q.dim) ? 'a plain number' : dimToString(q.dim))

function factorial (v) {
  if (!R.isInteger(v) || R.isNeg(v)) {
    const x = R.toNumber(v)
    if (x < 0 || !Number.isFinite(x)) fail('factorial needs a whole number')
    return R.inexact(gammaFn(x + 1))
  }
  const n = R.toNumber(v)
  if (n > 5000) return R.inexact(Infinity)
  let out = 1n
  for (let i = 2n; i <= BigInt(n); i++) out *= i
  return R.exact(out)
}

const LANCZOS = [
  676.5203681218851, -1259.1392167224028, 771.32342877765313,
  -176.61502916214059, 12.507343278686905, -0.13857109526572012,
  9.9843695780195716e-6, 1.5056327351493116e-7
]

function gammaFn (z) {
  if (z < 0.5) return Math.PI / (Math.sin(Math.PI * z) * gammaFn(1 - z))
  z -= 1
  let x = 0.99999999999980993
  for (let i = 0; i < LANCZOS.length; i++) x += LANCZOS[i] / (z + i + 1)
  const t = z + LANCZOS.length - 0.5
  return Math.sqrt(2 * Math.PI) * Math.pow(t, z + 0.5) * Math.exp(-t) * x
}

/**
 * Radians for a trig argument.
 *
 * An explicit angle converts on its own terms, so `sin 30deg` is right whatever
 * the setting. A bare number follows the default angle unit — radians, as qalc
 * does, unless the sheet has been switched to degrees.
 */
function angleInRadians (q, options) {
  if (isScalar(q)) {
    const x = R.toNumber(q.value)
    return options?.angleUnit === 'deg' ? (x * Math.PI) / 180 : x
  }
  if (dimEqual(q.dim, { A: 1 })) return R.toNumber(q.value)
  fail(`${describeDim(q)} is not an angle`)
}

function applyFunction (node, scope) {
  // scope carries __options so evaluation stays a pure function of its inputs
  const name = node.name
  const args = node.args.map((a) => evaluate(a, scope))
  const arity = FUNCTIONS[name]
  if (arity > 0 && args.length !== arity) {
    fail(`${name}() takes ${arity} argument${arity === 1 ? '' : 's'}`)
  }
  const nums = args.map((a) => R.toNumber(a.value))
  const plain = (fn) => {
    if (!isScalar(args[0])) fail(`${name}() needs a plain number`)
    return scalar(R.inexact(fn(nums[0])))
  }

  switch (name) {
    case 'sqrt': {
      if (isScalar(args[0])) return scalar(R.sqrt(args[0].value))
      const half = R.exact(1n, 2n)
      const dim = {}
      for (const [k, v] of Object.entries(args[0].dim)) {
        if (v % 2 !== 0) fail('cannot take the square root of those units')
        dim[k] = v / 2
      }
      void half
      return qty(R.sqrt(args[0].value), dim)
    }
    case 'cbrt': return plain(Math.cbrt)
    case 'abs':
      return { ...args[0], value: R.isNeg(args[0].value) ? R.neg(args[0].value) : args[0].value }
    case 'sign': return scalar(R.exact(BigInt(Math.sign(nums[0]))))
    case 'exp': return plain(Math.exp)
    case 'ln': return plain(Math.log)
    case 'log10':
    case 'lg': return plain(Math.log10)
    case 'log2': return plain(Math.log2)
    case 'log': {
      if (args.length === 2) {
        const r = Math.log(nums[0]) / Math.log(nums[1])
        const rounded = Math.round(r)
        // log(8, 2) is 3, and should say so rather than 2.9999999999999996.
        if (Math.abs(r - rounded) < 1e-12) return scalar(R.exact(BigInt(rounded)))
        return scalar(R.inexact(r))
      }
      return plain(Math.log10)
    }

    case 'sin':
    case 'cos':
    case 'tan': {
      const rad = angleInRadians(args[0], scope.__options)
      const exactValue = exactTrig(name, rad)
      if (exactValue) return scalar(exactValue)
      if (exactValue === null) {
        const fn = { sin: Math.sin, cos: Math.cos, tan: Math.tan }[name]
        return scalar(R.inexact(fn(rad)))
      }
      fail(`${name} is undefined there`)
      break
    }
    case 'asin':
    case 'acos':
    case 'atan': {
      const fn = { asin: Math.asin, acos: Math.acos, atan: Math.atan }[name]
      return scalar(R.inexact(fn(nums[0])))
    }
    case 'atan2':
      return scalar(R.inexact(Math.atan2(nums[0], nums[1])))

    case 'sinh': return plain(Math.sinh)
    case 'cosh': return plain(Math.cosh)
    case 'tanh': return plain(Math.tanh)
    case 'asinh': return plain(Math.asinh)
    case 'acosh': return plain(Math.acosh)
    case 'atanh': return plain(Math.atanh)

    case 'floor':
    case 'ceil':
    case 'round':
    case 'trunc': {
      // Math.round sends -2.5 to -2; qalc rounds halves away from zero.
      const halfAway = (x) => Math.sign(x) * Math.round(Math.abs(x))
      const fn = { floor: Math.floor, ceil: Math.ceil, round: halfAway, trunc: Math.trunc }[name]
      return { ...args[0], value: R.exact(BigInt(fn(nums[0]))) }
    }

    case 'fac':
    case 'factorial': return scalar(factorial(args[0].value))
    case 'gamma': return scalar(R.inexact(gammaFn(nums[0])))

    case 'min': return args.reduce((m, q) => (R.cmp(q.value, m.value) < 0 ? q : m))
    case 'max': return args.reduce((m, q) => (R.cmp(q.value, m.value) > 0 ? q : m))
    case 'hypot': return scalar(R.inexact(Math.hypot(...nums)))
    case 'sum': return args.reduce((s, q) => qty(R.add(s.value, q.value), q.dim, q.display))
    case 'mean':
    case 'average': {
      const total = args.reduce((s, q) => R.add(s, q.value), R.ZERO)
      return qty(R.div(total, R.exact(BigInt(args.length))), args[0].dim, args[0].display)
    }
    case 'gcd': return scalar(R.exact(nums.map((n) => BigInt(Math.round(Math.abs(n)))).reduce(bigGcd)))
    case 'lcm': return scalar(R.exact(nums.map((n) => BigInt(Math.round(Math.abs(n)))).reduce(bigLcm)))

    case 'root': {
      const n = R.toNumber(args[1].value)
      if (n === 2) return scalar(R.sqrt(args[0].value))
      return scalar(R.pow(args[0].value, R.exact(1n, BigInt(n))))
    }
    case 'pow': return scalar(R.pow(args[0].value, args[1].value))
    case 'mod':
    case 'rem': {
      const r = nums[0] - nums[1] * Math.floor(nums[0] / nums[1])
      return qty(R.fromDecimalString(String(r)), args[0].dim, args[0].display)
    }
    case 'ncr':
    case 'comb': return scalar(chooseExact(nums[0], nums[1]))
    case 'npr':
    case 'perm': {
      const r = R.div(factorial(R.exact(BigInt(nums[0]))), factorial(R.exact(BigInt(nums[0] - nums[1]))))
      return scalar(r)
    }
    default:
      fail(`unknown function ${name}`)
  }
}

const bigGcd = (a, b) => { while (b) { [a, b] = [b, a % b] } return a }
const bigLcm = (a, b) => (a * b) / bigGcd(a, b)

function chooseExact (n, k) {
  if (k < 0 || k > n) return R.ZERO
  let out = 1n
  const N = BigInt(Math.round(n))
  const K = BigInt(Math.round(Math.min(k, n - k)))
  for (let i = 0n; i < K; i++) out = (out * (N - i)) / (i + 1n)
  return R.exact(out)
}

/* ---------------------------------------------------------- conversions -- */

function applyConversion (node, scope) {
  const value = evaluate(node.from, scope)
  const target = node.to

  if (target.kind === 'toFraction') return { ...value, forceFraction: true }
  if (target.kind === 'toDecimal') return { ...value, forceDecimal: true }
  if (target.kind === 'toSci') return { ...value, forceSci: true }
  if (target.kind === 'toBase') return { ...value, base: target.base }

  const unit = evaluate(target.node, scope)
  if (!dimEqual(value.dim, unit.dim)) {
    fail(`cannot convert ${describeDim(value)} to ${describeDim(unit)}`)
  }

  // The value is already in base units, so converting is purely a matter of
  // relabelling — the formatter divides by the new unit's factor.
  return qty(value.value, unit.dim, explicitDisplay(unit.display))
}

/** Mark a display as user-requested, so the formatter shows exactly that. */
const explicitDisplay = (d) => (d ? { ...d, explicit: true } : d)

/* ------------------------------------------------------------ formatter -- */

const SUPERSCRIPT = { '-': '⁻', 0: '⁰', 1: '¹', 2: '²', 3: '³', 4: '⁴', 5: '⁵', 6: '⁶', 7: '⁷', 8: '⁸', 9: '⁹' }
const superscript = (n) => String(n).split('').map((c) => SUPERSCRIPT[c] ?? c).join('')

const PRECISION = 10

/** Round to `PRECISION` significant digits and drop trailing zeroes. */
function formatDecimal (x, precision = PRECISION) {
  if (!Number.isFinite(x)) return x > 0 ? '∞' : x < 0 ? '-∞' : 'undefined'
  if (x === 0) return '0'
  const mag = Math.floor(Math.log10(Math.abs(x)))
  if (mag >= precision || mag < -precision + 1) {
    const mantissa = Number((x / 10 ** mag).toPrecision(precision))
    return `${trimZeroes(String(mantissa))}e${mag}`
  }
  const fixed = Math.max(0, Math.min(100, precision - 1 - mag))
  return trimZeroes(x.toFixed(fixed))
}

const trimZeroes = (s) => (s.includes('.') ? s.replace(/0+$/, '').replace(/\.$/, '') : s)

function renderParts (parts) {
  const num = parts.filter((p) => p.power > 0)
  const den = parts.filter((p) => p.power < 0)
  const one = (p, power) => (power === 1 ? p.text : `${p.text}${superscript(power)}`)
  const top = num.map((p) => one(p, p.power)).join('·') || '1'
  if (!den.length) return top
  return `${top}/${den.map((p) => one(p, -p.power)).join('·')}`
}

function unitSuffix (q) {
  if (dimIsEmpty(q.dim)) return ''
  const parts = q.display?.parts

  // A product of units that happens to be a named one is better said by its
  // name: volts times amps is watts, newtons times metres is joules.
  if (!q.display?.explicit && (!parts || parts.length > 1)) {
    for (const p of PREFERRED) {
      if (dimEqual(q.dim, p.dim)) return p.names[0] === 'ohm' ? 'Ω' : p.names[0]
    }
  }
  if (parts) return renderParts(parts)
  return dimToString(q.dim).replace(/\^(-?\d+)/g, (_, n) => superscript(n))
}

/**
 * Render a result the way qalc does: the exact form, then the decimal, joined
 * by `=` when nothing is lost and `≈` when the decimal is a rounding.
 */
/** Convert the stored base value into the unit it will be shown in. */
function displayValue (q) {
  const d = q.display
  if (!d) return q.value
  const shifted = d.offset ? R.sub(q.value, R.inexact(d.offset)) : q.value
  return d.factor === 1 ? shifted : R.div(shifted, R.inexact(d.factor))
}

function formatResult (q) {
  const suffix = unitSuffix(q)
  const withUnit = (s) => (suffix ? `${s} ${suffix}` : s)
  q = { ...q, value: displayValue(q) }

  if (q.base) {
    const n = Math.round(R.toNumber(q.value))
    const prefix = { 16: '0x', 2: '0b', 8: '0o' }[q.base] || ''
    return { forms: [prefix + Math.abs(n).toString(q.base).toUpperCase()], approximate: false }
  }

  const value = q.value

  if (q.forceFraction && !value.exact) {
    const r = R.rationalise(R.toNumber(value))
    if (r) return { forms: [withUnit(`${r.n}/${r.d}`), withUnit(formatDecimal(R.toNumber(value)))], approximate: true }
  }

  if (value.exact) {
    const isInt = value.d === 1n
    const decimal = formatDecimal(R.toNumber(value), q.forceSci ? PRECISION : PRECISION)
    if (isInt) return { forms: [withUnit(decimal)], approximate: false }

    const fraction = `${value.n}/${value.d}`
    const terminates = R.terminates(value)
    // A fraction is only worth showing next to the decimal when it is tidy;
    // 8171/10000 tells you nothing that 0.8171 does not.
    const tidy = value.d <= 1000n && !q.forceDecimal
    if (terminates) {
      if (tidy && value.d !== 1n && value.d % 10n !== 0n) {
        return { forms: [withUnit(fraction), withUnit(decimal)], approximate: false }
      }
      return { forms: [withUnit(decimal)], approximate: false }
    }
    return { forms: [withUnit(fraction), withUnit(decimal)], approximate: true, exactCount: 1 }
  }

  const x = R.toNumber(value)
  return { forms: [withUnit(formatDecimal(x))], approximate: true }
}

/* --------------------------------------------------------------- public -- */

/**
 * Evaluate one line.
 *
 * @param {string} input
 * @param {object} scope   variable name -> quantity (mutated by assignments)
 * @returns {{ok: boolean, forms?: string[], text?: string, value?: number,
 *            approximate?: boolean, assigned?: string, error?: string}}
 */
export function calculate (input, scope = {}, options = null) {
  if (options) scope = { ...scope, __options: options }
  const source = String(input ?? '').trim()
  if (!source) return { ok: false, empty: true }

  try {
    // `name = expression` defines a variable, but `==` is a comparison and
    // `x = 1` inside a larger expression is not an assignment.
    const assign = /^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=(?!=)\s*(.+)$/.exec(source)
    let name = null
    let body = source
    if (assign && !isFunction(assign[1].toLowerCase()) && !lookupUnit(assign[1]) && !Object.hasOwn(CONSTANTS, assign[1])) {
      name = assign[1]
      body = assign[2]
    }

    const tokens = tokenize(body)
    const tree = parse(tokens, scope)
    const result = evaluate(tree, scope)
    if (name) scope[name] = result

    const formatted = formatResult(result)
    return {
      ok: true,
      assigned: name,
      forms: formatted.forms,
      text: formatted.forms.join(formatted.approximate && formatted.forms.length > 1 ? ' ≈ ' : ' = '),
      approximate: formatted.approximate,
      value: R.toNumber(result.value),
      dimensionless: isScalar(result),
      quantity: result
    }
  } catch (err) {
    return {
      ok: false,
      error: err instanceof QalcError ? err.message : (err.message || String(err)),
      partial: err instanceof QalcError ? err.partial : false
    }
  }
}

/**
 * Evaluate a multi-line sheet, carrying named values and `ans` forward.
 *
 * @returns {Array<{source: string, kind: 'blank'|'value'|'assign'|'error',
 *                  display?: string, forms?: string[], approximate?: boolean,
 *                  assigned?: string, error?: string}>}
 */
export function calculateSheet (source, options = {}) {
  const scope = { __options: options }
  const rows = []
  let last = null

  for (const raw of String(source ?? '').split('\n')) {
    const line = raw.replace(/\/\/.*$/, '').replace(/#.*$/, '').trim()
    if (!line) {
      rows.push({ source: raw, kind: 'blank' })
      continue
    }
    if (last) scope.ans = last

    const r = calculate(line, scope)
    if (!r.ok) {
      rows.push({ source: raw, kind: 'error', error: r.error })
      continue
    }
    // `ans` is the quantity just produced, named or not.
    last = r.quantity ?? last
    rows.push({
      source: raw,
      kind: r.assigned ? 'assign' : 'value',
      assigned: r.assigned,
      display: r.text,
      forms: r.forms,
      approximate: r.approximate
    })
  }
  return rows
}

/**
 * Parse `f(x)` once and return a fast sampler.
 *
 * The grapher calls this hundreds of times per redraw, so the expression is
 * tokenised and parsed a single time and only the evaluation repeats.
 */
export function compileFunction (expression, variable = 'x', options = {}) {
  const body = String(expression)
    .replace(/^\s*[a-zA-Z]\s*\(\s*[a-zA-Z]\s*\)\s*=\s*/, '')
    .replace(/^\s*y\s*=\s*/, '')
    .trim()
  if (!body) throw new QalcError('empty expression')

  const tree = parse(tokenize(body), {})
  const sample = (v) => {
    const scope = { __options: options, [variable]: scalar(R.inexact(v)) }
    const r = evaluate(tree, scope)
    if (!isScalar(r)) throw new QalcError('a plotted value cannot have units')
    return R.toNumber(r.value)
  }

  // Probe once so a bad expression is reported rather than silently drawing
  // nothing; NaN from a genuine domain gap is fine and must not throw here.
  sample(1)

  return (v) => {
    try {
      return sample(v)
    } catch {
      return NaN
    }
  }
}

export { QalcError }
