/** Sensible starting geometry and content for each kind of item. */

export const AUTO_SIZED_TYPES = new Set(['text', 'math'])

/**
 * @param {string} type   item type
 * @param {{x:number,y:number}} at   world point of the click
 * @param {object} style  current toolbar style
 */
export function createDefaults (type, at, style) {
  const base = { type, x: at.x, y: at.y, w: 0, h: 0, data: {} }

  switch (type) {
    case 'sticky':
      return {
        ...base,
        x: at.x - 110,
        y: at.y - 110,
        w: 220,
        h: 220,
        data: {
          text: '',
          fill: style.fill,
          color: '#1f2933',
          align: 'left',
          justCreated: true
        }
      }

    case 'text':
      return {
        ...base,
        w: 120,
        h: 30,
        data: {
          text: '',
          color: style.color,
          fontSize: style.fontSize,
          justCreated: true
        }
      }

    case 'math':
      return {
        ...base,
        w: 160,
        h: 48,
        data: {
          latex: '',
          color: style.color,
          fontSize: style.fontSize,
          display: true,
          justCreated: true
        }
      }

    case 'calc':
      return {
        ...base,
        w: 300,
        h: 200,
        data: {
          source: '',
          degrees: false
        }
      }

    case 'plot':
      return {
        ...base,
        w: 380,
        h: 300,
        data: {
          expressions: ['x^2'],
          xmin: -10,
          xmax: 10,
          ymin: -6,
          ymax: 6,
          degrees: false
        }
      }

    case 'image':
      return { ...base, w: 320, h: 240, data: { src: '' } }

    case 'path':
      return {
        ...base,
        data: {
          points: [],
          color: style.color,
          strokeWidth: style.strokeWidth,
          opacity: 1
        }
      }

    case 'line':
    case 'arrow':
      return {
        ...base,
        data: {
          points: [[0, 0], [0, 0]],
          color: style.color,
          strokeWidth: style.strokeWidth,
          dash: style.dash
        }
      }

    case 'rect':
    case 'ellipse':
    case 'diamond':
      return {
        ...base,
        data: {
          color: style.color,
          fill: style.shapeFill,
          strokeWidth: style.strokeWidth,
          dash: style.dash
        }
      }

    default:
      return base
  }
}

/** The highlighter is a pen with a wide, translucent, multiply-blended stroke. */
export function markerData (style) {
  return {
    points: [],
    color: style.color,
    strokeWidth: Math.max(14, style.strokeWidth * 5),
    opacity: 0.42,
    blend: 'multiply'
  }
}
