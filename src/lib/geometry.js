/** Small geometry helpers shared by the canvas, selection and tools. */

export const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v))

export function boundsOf (items) {
  if (!items.length) return null
  let minX = Infinity; let minY = Infinity; let maxX = -Infinity; let maxY = -Infinity
  for (const it of items) {
    minX = Math.min(minX, it.x)
    minY = Math.min(minY, it.y)
    maxX = Math.max(maxX, it.x + it.w)
    maxY = Math.max(maxY, it.y + it.h)
  }
  return { x: minX, y: minY, w: maxX - minX, h: maxY - minY }
}

export const rectsIntersect = (a, b) =>
  a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y

export function normalizeRect (x1, y1, x2, y2) {
  return {
    x: Math.min(x1, x2),
    y: Math.min(y1, y2),
    w: Math.abs(x2 - x1),
    h: Math.abs(y2 - y1)
  }
}

/**
 * Ramer–Douglas–Peucker. Freehand strokes arrive with far more points than they
 * need; dropping the redundant ones keeps the database small and the SVG fast.
 */
export function simplifyPath (points, tolerance = 0.7) {
  if (points.length < 3) return points

  const sqTolerance = tolerance * tolerance
  const sqSegDist = (p, a, b) => {
    let [x, y] = a
    let dx = b[0] - x
    let dy = b[1] - y
    if (dx !== 0 || dy !== 0) {
      const t = ((p[0] - x) * dx + (p[1] - y) * dy) / (dx * dx + dy * dy)
      if (t > 1) { x = b[0]; y = b[1] } else if (t > 0) { x += dx * t; y += dy * t }
    }
    dx = p[0] - x
    dy = p[1] - y
    return dx * dx + dy * dy
  }

  const simplify = (pts, first, last, out) => {
    let maxSq = sqTolerance
    let index = -1
    for (let i = first + 1; i < last; i++) {
      const sq = sqSegDist(pts[i], pts[first], pts[last])
      if (sq > maxSq) { index = i; maxSq = sq }
    }
    if (index === -1) return
    if (index - first > 1) simplify(pts, first, index, out)
    out.push(pts[index])
    if (last - index > 1) simplify(pts, index, last, out)
  }

  const out = [points[0]]
  simplify(points, 0, points.length - 1, out)
  out.push(points[points.length - 1])
  return out
}

/** Catmull-Rom → cubic Bézier, so pen strokes read as curves rather than chains. */
export function smoothPathD (points) {
  if (!points.length) return ''
  if (points.length === 1) {
    const [x, y] = points[0]
    return `M ${r(x)} ${r(y)} l 0.01 0`
  }
  if (points.length === 2) {
    return `M ${r(points[0][0])} ${r(points[0][1])} L ${r(points[1][0])} ${r(points[1][1])}`
  }

  let d = `M ${r(points[0][0])} ${r(points[0][1])}`
  for (let i = 0; i < points.length - 1; i++) {
    const p0 = points[i - 1] || points[i]
    const p1 = points[i]
    const p2 = points[i + 1]
    const p3 = points[i + 2] || p2
    const c1x = p1[0] + (p2[0] - p0[0]) / 6
    const c1y = p1[1] + (p2[1] - p0[1]) / 6
    const c2x = p2[0] - (p3[0] - p1[0]) / 6
    const c2y = p2[1] - (p3[1] - p1[1]) / 6
    d += ` C ${r(c1x)} ${r(c1y)}, ${r(c2x)} ${r(c2y)}, ${r(p2[0])} ${r(p2[1])}`
  }
  return d
}

const r = (n) => Math.round(n * 100) / 100

export function pointsBounds (points, padding = 0) {
  let minX = Infinity; let minY = Infinity; let maxX = -Infinity; let maxY = -Infinity
  for (const [x, y] of points) {
    minX = Math.min(minX, x); minY = Math.min(minY, y)
    maxX = Math.max(maxX, x); maxY = Math.max(maxY, y)
  }
  return {
    x: minX - padding,
    y: minY - padding,
    w: maxX - minX + padding * 2,
    h: maxY - minY + padding * 2
  }
}
