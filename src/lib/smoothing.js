/**
 * Pen stabilisation.
 *
 * A pointer reports a jittery sequence of positions — hand tremor, mouse
 * quantisation, a trackpad's own filtering. Drawing them verbatim gives wobbly
 * handwriting. So the nib chases the cursor instead of being the cursor: each
 * sample pulls it a fraction of the remaining distance, which damps small
 * jitter far more than it damps intentional movement.
 *
 * The cost is lag — the nib trails behind the pointer, more so at higher
 * strengths — which is why the stroke has to be flushed when the pen lifts.
 */

/** Fraction of the gap the nib closes per sample. 1 is no smoothing at all. */
export const SMOOTHING_LEVELS = {
  off: 1,
  light: 0.55,
  medium: 0.32,
  strong: 0.18
}

export const SMOOTHING_OPTIONS = [
  { id: 'off', label: 'Off', hint: 'Follow the pointer exactly' },
  { id: 'light', label: 'Light', hint: 'Takes the edge off shaky lines' },
  { id: 'medium', label: 'Medium', hint: 'Good for handwriting' },
  { id: 'strong', label: 'Strong', hint: 'Very smooth, noticeably laggy' }
]

export const alphaFor = (level) => SMOOTHING_LEVELS[level] ?? SMOOTHING_LEVELS.light

/**
 * A nib that chases a target point.
 *
 * @param {{x:number,y:number}} start  where the stroke begins
 * @param {string} level               key of SMOOTHING_LEVELS
 */
export function createStabiliser (start, level) {
  const alpha = alphaFor(level)
  let x = start.x
  let y = start.y

  return {
    get alpha () { return alpha },
    get point () { return { x, y } },

    /** Advance towards `target` and return the nib's new position. */
    push (target) {
      x += (target.x - x) * alpha
      y += (target.y - y) * alpha
      return { x, y }
    },

    /**
     * Close the remaining gap when the pen lifts, so the stroke ends where the
     * hand actually stopped rather than wherever the lag left it. Returns the
     * catch-up points to append.
     */
    flush (target, tolerance = 0.4) {
      const tail = []
      for (let i = 0; i < 32; i++) {
        if (Math.hypot(target.x - x, target.y - y) <= tolerance) break
        x += (target.x - x) * alpha
        y += (target.y - y) * alpha
        tail.push([x, y])
      }
      return tail
    }
  }
}
