/**
 * Exact rational arithmetic, with a float fallback.
 *
 * This is what lets the calculator answer the way Qalculate does — `1/2 = 0.5`
 * but `1/3 ≈ 0.3333333333`. The difference is not precision, it is whether the
 * exact value has a terminating decimal at all, and you can only know that if
 * you have kept the fraction rather than the double.
 *
 * A value is either exact (a BigInt fraction) or inexact (a plain number, once
 * something irrational has happened to it).
 */

const abs = (a) => (a < 0n ? -a : a)

function gcd (a, b) {
  a = abs(a); b = abs(b)
  while (b) { const t = a % b; a = b; b = t }
  return a
}

/** @returns {{exact: true, n: bigint, d: bigint}} in lowest terms, d > 0 */
export function exact (n, d = 1n) {
  n = BigInt(n); d = BigInt(d)
  if (d === 0n) throw new Error('division by zero')
  if (d < 0n) { n = -n; d = -d }
  const g = gcd(n, d) || 1n
  return { exact: true, n: n / g, d: d / g }
}

export const inexact = (v) => ({ exact: false, v: Number(v) })

export const ZERO = exact(0n)
export const ONE = exact(1n)

export const isZero = (a) => (a.exact ? a.n === 0n : a.v === 0)
export const isInteger = (a) => a.exact && a.d === 1n
export const isNeg = (a) => (a.exact ? a.n < 0n : a.v < 0)

export function toNumber (a) {
  if (!a.exact) return a.v
  if (a.d === 1n) return Number(a.n)
  // Divide as BigInt first so huge numerators do not overflow to Infinity
  // before the division has a chance to bring them back into range.
  const whole = a.n / a.d
  const rem = a.n - whole * a.d
  return Number(whole) + Number(rem) / Number(a.d)
}

/** Parse a decimal literal without going through a double. */
export function fromDecimalString (text) {
  const m = /^(\d*)(?:\.(\d*))?(?:[eE]([+-]?\d+))?$/.exec(text)
  if (!m) return inexact(Number(text))
  const [, intPart = '', fracPart = '', expPart] = m
  let n = BigInt((intPart || '0') + fracPart)
  let d = 10n ** BigInt(fracPart.length)
  const e = expPart ? Number(expPart) : 0
  if (e > 0) n *= 10n ** BigInt(e)
  else if (e < 0) d *= 10n ** BigInt(-e)
  return exact(n, d)
}

const bothExact = (a, b) => a.exact && b.exact

export const add = (a, b) =>
  bothExact(a, b) ? exact(a.n * b.d + b.n * a.d, a.d * b.d) : inexact(toNumber(a) + toNumber(b))

export const sub = (a, b) =>
  bothExact(a, b) ? exact(a.n * b.d - b.n * a.d, a.d * b.d) : inexact(toNumber(a) - toNumber(b))

export const mul = (a, b) =>
  bothExact(a, b) ? exact(a.n * b.n, a.d * b.d) : inexact(toNumber(a) * toNumber(b))

export function div (a, b) {
  if (isZero(b)) throw new Error('division by zero')
  return bothExact(a, b) ? exact(a.n * b.d, a.d * b.n) : inexact(toNumber(a) / toNumber(b))
}

export const neg = (a) => (a.exact ? { exact: true, n: -a.n, d: a.d } : inexact(-a.v))

export function cmp (a, b) {
  if (bothExact(a, b)) {
    const l = a.n * b.d
    const r = b.n * a.d
    return l < r ? -1 : l > r ? 1 : 0
  }
  const l = toNumber(a); const r = toNumber(b)
  return l < r ? -1 : l > r ? 1 : 0
}

export const equals = (a, b) => cmp(a, b) === 0

/** Integer nth root of a BigInt, or null when it is not perfect. */
function exactRoot (value, n) {
  if (value < 0n) return null
  if (value === 0n || value === 1n) return value
  let lo = 1n
  let hi = value
  while (lo <= hi) {
    const mid = (lo + hi) / 2n
    const p = mid ** n
    if (p === value) return mid
    if (p < value) lo = mid + 1n
    else hi = mid - 1n
  }
  return null
}

export function pow (a, b) {
  // Integer exponents keep everything exact, which is most of what people type.
  if (a.exact && isInteger(b)) {
    const e = b.n
    if (e >= 0n) {
      if (e > 4096n) return inexact(Math.pow(toNumber(a), toNumber(b)))
      return exact(a.n ** e, a.d ** e)
    }
    if (isZero(a)) throw new Error('division by zero')
    const p = -e
    if (p > 4096n) return inexact(Math.pow(toNumber(a), toNumber(b)))
    return exact(a.d ** p, a.n ** p)
  }
  // A rational power can still be exact if both roots come out whole:
  // 8^(2/3) is 4, and saying so beats 3.999999999999999.
  if (a.exact && b.exact && b.d <= 64n && a.n >= 0n) {
    const rootN = exactRoot(a.n, b.d)
    const rootD = exactRoot(a.d, b.d)
    if (rootN !== null && rootD !== null) {
      return pow(exact(rootN, rootD), exact(b.n))
    }
  }
  return inexact(Math.pow(toNumber(a), toNumber(b)))
}

/** Exact square root when the operand is a perfect square, else a float. */
export function sqrt (a) {
  if (a.exact && a.n >= 0n) {
    const rn = exactRoot(a.n, 2n)
    const rd = exactRoot(a.d, 2n)
    if (rn !== null && rd !== null) return exact(rn, rd)
  }
  const v = toNumber(a)
  if (v < 0) throw new Error('square root of a negative number')
  return inexact(Math.sqrt(v))
}

/**
 * Does this value have a terminating decimal expansion?
 *
 * True exactly when the reduced denominator is built only from 2s and 5s. This
 * is the whole basis of `=` versus `≈` in the output: 1/2 is 0.5 and nothing is
 * lost, while 1/3 can only ever be shown rounded.
 */
export function terminates (a) {
  if (!a.exact) return false
  let d = a.d
  while (d % 2n === 0n) d /= 2n
  while (d % 5n === 0n) d /= 5n
  return d === 1n
}

/** Best rational approximation of a float, for `to fraction`. */
export function rationalise (x, maxDenominator = 1000000n) {
  if (!Number.isFinite(x)) return null
  const sign = x < 0 ? -1n : 1n
  let v = Math.abs(x)
  let [h0, h1, k0, k1] = [0n, 1n, 1n, 0n]
  for (let i = 0; i < 40; i++) {
    const a = BigInt(Math.floor(v))
    const h2 = a * h1 + h0
    const k2 = a * k1 + k0
    if (k2 > maxDenominator) break
    ;[h0, h1, k0, k1] = [h1, h2, k1, k2]
    const frac = v - Math.floor(v)
    if (frac < 1e-12) break
    v = 1 / frac
  }
  if (k1 === 0n) return null
  const candidate = exact(sign * h1, k1)
  return Math.abs(toNumber(candidate) - x) < 1e-9 * Math.max(1, Math.abs(x)) ? candidate : null
}
