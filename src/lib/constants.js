export const INK_COLORS = [
  { name: 'Ink', value: '#1f2933' },
  { name: 'Red', value: '#e5484d' },
  { name: 'Orange', value: '#f76b15' },
  { name: 'Amber', value: '#ffb224' },
  { name: 'Green', value: '#30a46c' },
  { name: 'Teal', value: '#12a594' },
  { name: 'Blue', value: '#0091ff' },
  { name: 'Indigo', value: '#3e63dd' },
  { name: 'Violet', value: '#8e4ec6' },
  { name: 'Pink', value: '#e93d82' },
  { name: 'Grey', value: '#8b8d98' },
  { name: 'White', value: '#ffffff' }
]

export const NOTE_COLORS = [
  { name: 'Yellow', value: '#fff3a3' },
  { name: 'Lime', value: '#d4f5a6' },
  { name: 'Mint', value: '#b8f2e6' },
  { name: 'Sky', value: '#bfe3ff' },
  { name: 'Lilac', value: '#dcd0ff' },
  { name: 'Rose', value: '#ffd1e0' },
  { name: 'Peach', value: '#ffd9b8' },
  { name: 'Paper', value: '#ffffff' }
]

export const HIGHLIGHTER_COLORS = [
  { name: 'Yellow', value: '#ffe066' },
  { name: 'Green', value: '#8ce99a' },
  { name: 'Cyan', value: '#66d9e8' },
  { name: 'Pink', value: '#faa2c1' },
  { name: 'Orange', value: '#ffc078' },
  { name: 'Violet', value: '#d0bfff' }
]

export const FONT_SIZES = [12, 14, 16, 20, 24, 32, 40, 56, 72]
export const STROKE_WIDTHS = [1, 2, 3, 5, 8, 14]

/**
 * The toolbar. `key` is the single-key shortcut; `creates` marks tools that
 * make something when you click or drag on the canvas.
 */
export const TOOLS = [
  { id: 'select', label: 'Select', key: 'v', icon: 'cursor', hint: 'Move, resize and multi-select' },
  { id: 'hand', label: 'Pan', key: 'h', icon: 'hand', hint: 'Drag the canvas around' },
  { id: 'pen', label: 'Pen', key: 'p', icon: 'pen', creates: true, hint: 'Freehand drawing' },
  { id: 'marker', label: 'Highlighter', key: 'm', icon: 'marker', creates: true, hint: 'Translucent wide stroke' },
  { id: 'eraser', label: 'Eraser', key: 'e', icon: 'eraser', hint: 'Drag over things to remove them' },
  { id: 'sticky', label: 'Sticky note', key: 'n', icon: 'sticky', creates: true, hint: 'Click to drop a note' },
  { id: 'text', label: 'Text', key: 't', icon: 'text', creates: true, hint: 'Click to start typing' },
  { id: 'math', label: 'Formula', key: 'f', icon: 'sigma', creates: true, hint: 'LaTeX rendered with KaTeX' },
  { id: 'calc', label: 'Calculator', key: 'c', icon: 'calc', creates: true, hint: 'Multi-line working with variables' },
  { id: 'plot', label: 'Graph', key: 'g', icon: 'graph', creates: true, hint: 'Plot y = f(x)' },
  { id: 'rect', label: 'Rectangle', key: 'r', icon: 'rect', creates: true, shape: true },
  { id: 'ellipse', label: 'Ellipse', key: 'o', icon: 'ellipse', creates: true, shape: true },
  { id: 'diamond', label: 'Diamond', key: 'd', icon: 'diamond', creates: true, shape: true },
  { id: 'line', label: 'Line', key: 'l', icon: 'line', creates: true, shape: true },
  { id: 'arrow', label: 'Arrow', key: 'a', icon: 'arrow', creates: true, shape: true }
]

export const VECTOR_TYPES = new Set(['path', 'line', 'arrow', 'rect', 'ellipse', 'diamond'])
export const HTML_TYPES = new Set(['sticky', 'text', 'math', 'calc', 'plot', 'image'])

export const MIN_ZOOM = 0.05
export const MAX_ZOOM = 8
