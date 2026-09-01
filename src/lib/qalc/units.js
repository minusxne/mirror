/**
 * Units, prefixes and dimensional analysis.
 *
 * Every unit reduces to a vector of base dimensions plus a scale factor, so
 * `100 km/h` and `62.1 mph` are the same quantity and adding metres to inches
 * is a question the engine can answer rather than refuse.
 *
 * Angle is carried as a dimension even though it is strictly dimensionless.
 * That is what makes `sin 30deg` mean thirty degrees rather than thirty
 * radians, which is the single most useful thing Qalculate does with units.
 */

/** length, mass, time, current, temperature, amount, luminosity, angle, data */
export const BASE = ['L', 'M', 'T', 'I', 'K', 'N', 'J', 'A', 'B']

export const dimOf = (spec = {}) => {
  const d = {}
  for (const k of BASE) if (spec[k]) d[k] = spec[k]
  return d
}

export const dimEqual = (a, b) => {
  for (const k of BASE) if ((a[k] || 0) !== (b[k] || 0)) return false
  return true
}

export const dimIsEmpty = (d) => BASE.every((k) => !d[k])

export const dimMul = (a, b, sign = 1) => {
  const out = {}
  for (const k of BASE) {
    const v = (a[k] || 0) + sign * (b[k] || 0)
    if (v) out[k] = v
  }
  return out
}

export const dimPow = (a, n) => {
  const out = {}
  for (const k of BASE) if (a[k]) out[k] = a[k] * n
  return out
}

export function dimToString (d) {
  const num = []
  const den = []
  const SYMBOL = { L: 'm', M: 'kg', T: 's', I: 'A', K: 'K', N: 'mol', J: 'cd', A: 'rad', B: 'bit' }
  for (const k of BASE) {
    const e = d[k] || 0
    if (e > 0) num.push(e === 1 ? SYMBOL[k] : `${SYMBOL[k]}^${e}`)
    else if (e < 0) den.push(-e === 1 ? SYMBOL[k] : `${SYMBOL[k]}^${-e}`)
  }
  if (!num.length && !den.length) return ''
  const n = num.join('·') || '1'
  return den.length ? `${n}/${den.join('·')}` : n
}

/* ------------------------------------------------------------- prefixes -- */

export const PREFIXES = {
  Q: 1e30, R: 1e27, Y: 1e24, Z: 1e21, E: 1e18, P: 1e15, T: 1e12, G: 1e9, M: 1e6,
  k: 1e3, h: 1e2, da: 1e1,
  d: 1e-1, c: 1e-2, m: 1e-3, µ: 1e-6, u: 1e-6, μ: 1e-6, n: 1e-9, p: 1e-12,
  f: 1e-15, a: 1e-18, z: 1e-21, y: 1e-24, r: 1e-27, q: 1e-30
}

export const BINARY_PREFIXES = {
  Ki: 1024, Mi: 1024 ** 2, Gi: 1024 ** 3, Ti: 1024 ** 4, Pi: 1024 ** 5, Ei: 1024 ** 6
}

/* ---------------------------------------------------------------- units -- */

/**
 * factor  how many base units one of these is
 * offset  only for absolute temperatures, applied on its own
 * prefix  whether SI prefixes may be attached
 */
const U = (symbol, dim, factor, extra = {}) => ({ symbol, dim: dimOf(dim), factor, ...extra })

export const UNITS = {}
const define = (names, unit) => {
  for (const n of [].concat(names)) UNITS[n] = unit
}

/* --- angle (radian is the base) ------------------------------------------ */
define(['rad', 'radian', 'radians'], U('rad', { A: 1 }, 1, { prefix: true }))
define(['deg', 'degree', 'degrees', '°'], U('°', { A: 1 }, Math.PI / 180))
define(['grad', 'gradian', 'gradians', 'gon'], U('gon', { A: 1 }, Math.PI / 200))
define(['turn', 'turns', 'rev'], U('turn', { A: 1 }, 2 * Math.PI))
define(['arcmin', 'arcminute'], U('′', { A: 1 }, Math.PI / 10800))
define(['arcsec', 'arcsecond'], U('″', { A: 1 }, Math.PI / 648000))

/* --- length -------------------------------------------------------------- */
define(['m', 'metre', 'metres', 'meter', 'meters'], U('m', { L: 1 }, 1, { prefix: true }))
define(['in', 'inch', 'inches', '"'], U('in', { L: 1 }, 0.0254))
define(['ft', 'foot', 'feet', "'"], U('ft', { L: 1 }, 0.3048))
define(['yd', 'yard', 'yards'], U('yd', { L: 1 }, 0.9144))
define(['mi', 'mile', 'miles'], U('mi', { L: 1 }, 1609.344))
define(['nmi', 'nauticalmile'], U('nmi', { L: 1 }, 1852))
define(['au'], U('au', { L: 1 }, 149597870700))
define(['ly', 'lightyear', 'lightyears'], U('ly', { L: 1 }, 9460730472580800))
define(['pc', 'parsec'], U('pc', { L: 1 }, 3.0856775814913673e16, { prefix: true }))
define(['angstrom', 'Å'], U('Å', { L: 1 }, 1e-10))

/* --- mass ---------------------------------------------------------------- */
define(['g', 'gram', 'grams', 'gramme'], U('g', { M: 1 }, 0.001, { prefix: true }))
define(['t', 'tonne', 'tonnes', 'ton'], U('t', { M: 1 }, 1000, { prefix: true }))
define(['lb', 'lbs', 'pound', 'pounds'], U('lb', { M: 1 }, 0.45359237))
define(['oz', 'ounce', 'ounces'], U('oz', { M: 1 }, 0.028349523125))
define(['st', 'stone'], U('st', { M: 1 }, 6.35029318))
define(['u', 'amu', 'dalton'], U('u', { M: 1 }, 1.66053906892e-27))

/* --- time ---------------------------------------------------------------- */
define(['s', 'sec', 'secs', 'second', 'seconds'], U('s', { T: 1 }, 1, { prefix: true }))
define(['min', 'minute', 'minutes'], U('min', { T: 1 }, 60))
define(['h', 'hr', 'hrs', 'hour', 'hours'], U('h', { T: 1 }, 3600))
define(['d', 'day', 'days'], U('d', { T: 1 }, 86400))
define(['wk', 'week', 'weeks'], U('wk', { T: 1 }, 604800))
define(['yr', 'year', 'years'], U('yr', { T: 1 }, 31556952))
define(['month', 'months'], U('month', { T: 1 }, 2629746))

/* --- electric / thermodynamic base --------------------------------------- */
define(['A', 'amp', 'ampere', 'amperes'], U('A', { I: 1 }, 1, { prefix: true }))
define(['K', 'kelvin'], U('K', { K: 1 }, 1, { prefix: true }))
define(['mol', 'mole', 'moles'], U('mol', { N: 1 }, 1, { prefix: true }))
define(['cd', 'candela'], U('cd', { J: 1 }, 1, { prefix: true }))

/* --- absolute temperatures need an offset, so they stand apart ----------- */
define(['degC', '°C', 'celsius', 'centigrade'], U('°C', { K: 1 }, 1, { offset: 273.15 }))
define(['degF', '°F', 'fahrenheit'], U('°F', { K: 1 }, 5 / 9, { offset: 459.67 * (5 / 9) }))
define(['degR', 'rankine'], U('°R', { K: 1 }, 5 / 9))

/* --- derived ------------------------------------------------------------- */
define(['Hz', 'hertz'], U('Hz', { T: -1 }, 1, { prefix: true }))
define(['N', 'newton', 'newtons'], U('N', { M: 1, L: 1, T: -2 }, 1, { prefix: true }))
define(['Pa', 'pascal'], U('Pa', { M: 1, L: -1, T: -2 }, 1, { prefix: true }))
define(['bar'], U('bar', { M: 1, L: -1, T: -2 }, 1e5, { prefix: true }))
define(['atm', 'atmosphere'], U('atm', { M: 1, L: -1, T: -2 }, 101325))
define(['psi'], U('psi', { M: 1, L: -1, T: -2 }, 6894.757293168))
define(['mmHg', 'torr'], U('mmHg', { M: 1, L: -1, T: -2 }, 133.322387415))
define(['J', 'joule', 'joules'], U('J', { M: 1, L: 2, T: -2 }, 1, { prefix: true }))
define(['cal', 'calorie', 'calories'], U('cal', { M: 1, L: 2, T: -2 }, 4.184, { prefix: true }))
define(['eV', 'electronvolt'], U('eV', { M: 1, L: 2, T: -2 }, 1.602176634e-19, { prefix: true }))
define(['Wh'], U('Wh', { M: 1, L: 2, T: -2 }, 3600, { prefix: true }))
define(['BTU', 'btu'], U('BTU', { M: 1, L: 2, T: -2 }, 1055.05585262))
define(['W', 'watt', 'watts'], U('W', { M: 1, L: 2, T: -3 }, 1, { prefix: true }))
define(['hp', 'horsepower'], U('hp', { M: 1, L: 2, T: -3 }, 745.6998715822702))
define(['C', 'coulomb'], U('C', { I: 1, T: 1 }, 1, { prefix: true }))
define(['V', 'volt', 'volts'], U('V', { M: 1, L: 2, T: -3, I: -1 }, 1, { prefix: true }))
define(['ohm', 'Ω'], U('Ω', { M: 1, L: 2, T: -3, I: -2 }, 1, { prefix: true }))
define(['F', 'farad'], U('F', { M: -1, L: -2, T: 4, I: 2 }, 1, { prefix: true }))
define(['H', 'henry'], U('H', { M: 1, L: 2, T: -2, I: -2 }, 1, { prefix: true }))
define(['Wb', 'weber'], U('Wb', { M: 1, L: 2, T: -2, I: -1 }, 1, { prefix: true }))
define(['T', 'tesla'], U('T', { M: 1, T: -2, I: -1 }, 1, { prefix: true }))
define(['S', 'siemens'], U('S', { M: -1, L: -2, T: 3, I: 2 }, 1, { prefix: true }))
define(['lm', 'lumen'], U('lm', { J: 1 }, 1, { prefix: true }))
define(['lx', 'lux'], U('lx', { J: 1, L: -2 }, 1, { prefix: true }))
define(['Bq', 'becquerel'], U('Bq', { T: -1 }, 1, { prefix: true }))
define(['Gy', 'gray'], U('Gy', { L: 2, T: -2 }, 1, { prefix: true }))
define(['Sv', 'sievert'], U('Sv', { L: 2, T: -2 }, 1, { prefix: true }))

/* --- area and volume ----------------------------------------------------- */
define(['ha', 'hectare'], U('ha', { L: 2 }, 1e4))
define(['acre', 'acres'], U('acre', { L: 2 }, 4046.8564224))
define(['L', 'l', 'litre', 'litres', 'liter', 'liters'], U('L', { L: 3 }, 0.001, { prefix: true }))
define(['gal', 'gallon', 'gallons'], U('gal', { L: 3 }, 0.003785411784))
define(['pt', 'pint', 'pints'], U('pt', { L: 3 }, 0.000473176473))
define(['qt', 'quart', 'quarts'], U('qt', { L: 3 }, 0.000946352946))
define(['cup', 'cups'], U('cup', { L: 3 }, 0.0002365882365))
define(['tbsp'], U('tbsp', { L: 3 }, 1.4786764781e-5))
define(['tsp'], U('tsp', { L: 3 }, 4.92892159375e-6))
define(['floz'], U('fl oz', { L: 3 }, 2.95735295625e-5))

/* --- data ---------------------------------------------------------------- */
define(['bit', 'bits', 'b'], U('bit', { B: 1 }, 1, { prefix: true, binaryPrefix: true }))
define(['B', 'byte', 'bytes'], U('B', { B: 1 }, 8, { prefix: true, binaryPrefix: true }))

/* --- speed --------------------------------------------------------------- */
define(['mph'], U('mph', { L: 1, T: -1 }, 0.44704))
define(['kph', 'kmh'], U('km/h', { L: 1, T: -1 }, 1 / 3.6))
define(['knot', 'knots', 'kn'], U('kn', { L: 1, T: -1 }, 1852 / 3600))

/* ------------------------------------------------------------- constants -- */

/** Physical and mathematical constants, as quantities. */
export const CONSTANTS = {
  pi: { value: Math.PI, dim: {}, exactName: 'pi' },
  π: { value: Math.PI, dim: {}, exactName: 'pi' },
  e: { value: Math.E, dim: {}, exactName: 'e' },
  tau: { value: Math.PI * 2, dim: {} },
  phi: { value: (1 + Math.sqrt(5)) / 2, dim: {} },
  c: { value: 299792458, dim: dimOf({ L: 1, T: -1 }), symbol: 'm/s' },
  g0: { value: 9.80665, dim: dimOf({ L: 1, T: -2 }), symbol: 'm/s^2' },
  G: { value: 6.6743e-11, dim: dimOf({ L: 3, M: -1, T: -2 }) },
  h: { value: 6.62607015e-34, dim: dimOf({ M: 1, L: 2, T: -1 }) },
  hbar: { value: 1.054571817e-34, dim: dimOf({ M: 1, L: 2, T: -1 }) },
  k_B: { value: 1.380649e-23, dim: dimOf({ M: 1, L: 2, T: -2, K: -1 }) },
  N_A: { value: 6.02214076e23, dim: dimOf({ N: -1 }) },
  R: { value: 8.31446261815324, dim: dimOf({ M: 1, L: 2, T: -2, K: -1, N: -1 }) },
  e_charge: { value: 1.602176634e-19, dim: dimOf({ I: 1, T: 1 }) },
  m_e: { value: 9.1093837015e-31, dim: dimOf({ M: 1 }) },
  m_p: { value: 1.67262192369e-27, dim: dimOf({ M: 1 }) }
}

/**
 * Resolve a written unit name, peeling off a prefix if that is the only way it
 * makes sense. `mm` is a milli-metre; `min` is a minute and not a milli-inch,
 * which is why the unprefixed table is always consulted first.
 */
export function lookupUnit (name) {
  if (UNITS[name]) return { unit: UNITS[name], factor: 1, prefix: '' }

  for (const [p, mult] of Object.entries(BINARY_PREFIXES)) {
    if (name.startsWith(p)) {
      const rest = name.slice(p.length)
      const unit = UNITS[rest]
      if (unit?.binaryPrefix) return { unit, factor: mult, prefix: p }
    }
  }

  // Longest prefix first, so `da` is tried before `d`.
  const prefixes = Object.keys(PREFIXES).sort((a, b) => b.length - a.length)
  for (const p of prefixes) {
    if (!name.startsWith(p) || name.length === p.length) continue
    const rest = name.slice(p.length)
    const unit = UNITS[rest]
    if (unit?.prefix) return { unit, factor: PREFIXES[p], prefix: p }
  }
  return null
}

export const isUnitName = (name) => !!lookupUnit(name)

/**
 * Units to reach for when a result has no unit of its own to display in.
 * Ordered so the most idiomatic reading of a dimension comes first.
 */
export const PREFERRED = [
  { names: ['Hz'], dim: dimOf({ T: -1 }) },
  { names: ['N'], dim: dimOf({ M: 1, L: 1, T: -2 }) },
  { names: ['Pa'], dim: dimOf({ M: 1, L: -1, T: -2 }) },
  { names: ['J'], dim: dimOf({ M: 1, L: 2, T: -2 }) },
  { names: ['W'], dim: dimOf({ M: 1, L: 2, T: -3 }) },
  { names: ['V'], dim: dimOf({ M: 1, L: 2, T: -3, I: -1 }) },
  { names: ['ohm'], dim: dimOf({ M: 1, L: 2, T: -3, I: -2 }) },
  { names: ['C'], dim: dimOf({ I: 1, T: 1 }) },
  { names: ['F'], dim: dimOf({ M: -1, L: -2, T: 4, I: 2 }) }
]
