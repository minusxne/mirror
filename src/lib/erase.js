/**
 * Brush erasing — rubbing out part of a stroke rather than deleting it whole.
 *
 * A pen stroke is a polyline. Erasing across the middle of one has to split it
 * into two strokes; erasing across a loop can produce several. So the operation
 * takes a stroke and the segment the brush swept this frame, and returns the
 * runs of the stroke that survive.
 */

/** Squared distance from point p to segment ab. Squared to avoid a sqrt per point. */
function sqDistToSegment (px, py, ax, ay, bx, by) {
  let x = ax
  let y = ay
  const dx = bx - ax
  const dy = by - ay
  if (dx !== 0 || dy !== 0) {
    const t = ((px - ax) * dx + (py - ay) * dy) / (dx * dx + dy * dy)
    if (t > 1) {
      x = bx
      y = by
    } else if (t > 0) {
      x += dx * t
      y += dy * t
    }
  }
  const ex = px - x
  const ey = py - y
  return ex * ex + ey * ey
}

/**
 * Add points along any segment longer than `maxStep`.
 *
 * Strokes are stored simplified — a straight run can be two points metres
 * apart. Without this the brush could only cut at existing vertices, so erasing
 * the middle of a long straight line would do nothing or take the whole thing.
 */
function resample (points, maxStep) {
  const out = []
  for (let i = 0; i < points.length; i++) {
    const [x, y] = points[i]
    out.push([x, y])
    const next = points[i + 1]
    if (!next) break
    const dist = Math.hypot(next[0] - x, next[1] - y)
    if (dist <= maxStep) continue
    const steps = Math.min(400, Math.ceil(dist / maxStep))
    for (let s = 1; s < steps; s++) {
      const t = s / steps
      out.push([x + (next[0] - x) * t, y + (next[1] - y) * t])
    }
  }
  return out
}

/**
 * Erase the part of `item` covered by the brush sweeping from `from` to `to`
 * (both in world coordinates).
 *
 * @returns {null | Array<Array<[number, number]>>}
 *   `null`   the brush did not touch this stroke — leave it alone
 *   `[]`     the whole stroke was rubbed out
 *   `[...]`  the surviving runs, in the item's own coordinate space
 */
export function eraseFromStroke (item, from, to, radius) {
  const points = item.data?.points
  if (!Array.isArray(points) || points.length < 2) return null

  // The brush should clear the ink it passes over, and ink extends half a
  // stroke width either side of the centre line the points describe.
  const reach = radius + (item.data.strokeWidth || 2) / 2

  // Cheap rejection first: most strokes on a busy board are nowhere near.
  const minX = Math.min(from.x, to.x) - reach
  const maxX = Math.max(from.x, to.x) + reach
  const minY = Math.min(from.y, to.y) - reach
  const maxY = Math.max(from.y, to.y) + reach
  if (
    item.x > maxX || item.x + item.w < minX ||
    item.y > maxY || item.y + item.h < minY
  ) return null

  // Work in the item's local space so only the brush needs converting.
  const ax = from.x - item.x
  const ay = from.y - item.y
  const bx = to.x - item.x
  const by = to.y - item.y
  const reachSq = reach * reach

  const dense = resample(points, Math.max(1, radius / 2))

  const runs = []
  let current = []
  let touched = false

  for (const [px, py] of dense) {
    if (sqDistToSegment(px, py, ax, ay, bx, by) <= reachSq) {
      touched = true
      if (current.length > 1) runs.push(current)
      current = []
    } else {
      current.push([px, py])
    }
  }
  if (current.length > 1) runs.push(current)

  if (!touched) return null
  return runs
}

/** Bounding box of a run, used to re-origin each surviving piece. */
export function runBounds (points) {
  let minX = Infinity
  let minY = Infinity
  let maxX = -Infinity
  let maxY = -Infinity
  for (const [x, y] of points) {
    if (x < minX) minX = x
    if (x > maxX) maxX = x
    if (y < minY) minY = y
    if (y > maxY) maxY = y
  }
  return { x: minX, y: minY, w: maxX - minX, h: maxY - minY }
}
