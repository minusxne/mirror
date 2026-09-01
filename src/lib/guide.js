/**
 * Content for the in-app guide.
 *
 * Kept as data rather than markup so the dialog stays a thin renderer, and so
 * the tool list here can be checked against the real toolbar.
 */

export const TOOL_GUIDE = [
  {
    id: 'select',
    title: 'Select',
    key: 'V',
    blurb: 'Pick things up, move them, resize them, and choose several at once.',
    steps: [
      'Click anything to select it.',
      'Drag from empty canvas to sweep a box over several things at once.',
      'Drag a selected item to move it — hold Shift to keep it on one axis.',
      'Drag a corner handle to resize. Shift keeps the proportions, Alt resizes around the middle.',
      'Shift-click to add something to the selection, or take it out again.'
    ],
    tips: [
      'Resizing text or a formula scales its type size rather than stretching it.',
      'Arrow keys nudge by one, Shift+arrow by ten.',
      'Right-click for duplicate, layer order, and zoom-to-selection.'
    ]
  },
  {
    id: 'hand',
    title: 'Pan',
    key: 'H',
    blurb: 'Move around the board without touching anything on it.',
    steps: [
      'Drag anywhere to slide the canvas.',
      'You rarely need this tool: holding Space, or dragging with the middle mouse button, pans from whatever tool you are already using.'
    ],
    tips: [
      'Scroll to pan up and down, Shift+scroll to pan sideways.',
      'Ctrl+scroll zooms towards the cursor.',
      'Turn on right-drag panning in Settings if you prefer that.',
      'Settings can also hide the bars until you reach for them, giving the whole window over to the canvas.'
    ]
  },
  {
    id: 'pen',
    title: 'Pen',
    key: 'P',
    blurb: 'Freehand drawing and handwriting.',
    steps: [
      'Drag to draw. Let go to finish the stroke.',
      'Pick a colour and thickness in the panel beside the toolbar.',
      'Set Smoothing to steady a shaky hand — Medium suits handwriting.'
    ],
    tips: [
      'Strokes are simplified when you lift the pen, so long sessions stay fast.',
      'Smoothing makes the nib chase the cursor, so the line lags slightly. Strong lags most.',
      'The brush eraser can rub out part of a stroke without deleting the whole thing.'
    ]
  },
  {
    id: 'marker',
    title: 'Highlighter',
    key: 'M',
    blurb: 'A wide translucent stroke that multiplies over whatever is beneath it.',
    steps: [
      'Drag across the thing you want to mark.',
      'Choose a highlighter colour in the panel — they are tuned to stay readable over text.'
    ],
    tips: [
      'It blends rather than covers, so words underneath stay legible.',
      'Send a highlight behind something with [ if it lands on top of a note.'
    ]
  },
  {
    id: 'eraser',
    title: 'Eraser',
    key: 'E',
    blurb: 'Two ways to remove things: whole objects, or just the ink you paint over.',
    steps: [
      'Object mode: touch anything — a note, a shape, a whole stroke — and it goes.',
      'Brush mode: paint over ink and only the part under the brush disappears.',
      'Switch modes in the panel, or tap E again while the eraser is already selected.',
      'Set the brush size in the panel; the ring on screen shows exactly what will go.'
    ],
    tips: [
      'Erasing through the middle of a line splits it into two lines.',
      'The brush only affects pen and highlighter ink. Notes, shapes and formulas are objects — use Object mode for those.',
      'A whole sweep is a single undo, however many strokes it touched.'
    ]
  },
  {
    id: 'sticky',
    title: 'Sticky note',
    key: 'N',
    blurb: 'A coloured note that holds a paragraph of text.',
    steps: [
      'Click anywhere to drop a note and start typing.',
      'Double-click an existing note to edit it again.',
      'Pick a colour in the panel before or after you make it.'
    ],
    tips: [
      'Text shrinks as a note fills up, and the note grows if it runs out of room.',
      'Press Escape to finish typing without clicking away.'
    ]
  },
  {
    id: 'text',
    title: 'Text',
    key: 'T',
    blurb: 'Plain text with no box around it, for labels and headings.',
    steps: [
      'Click where you want it and type.',
      'Double-click empty canvas with the Select tool to do the same thing without switching.',
      'Change size and colour in the panel.'
    ],
    tips: [
      'The block grows to fit what you type and wraps at a sensible width.',
      'Pasting text from elsewhere drops it straight onto the board.'
    ]
  },
  {
    id: 'math',
    title: 'Formula',
    key: 'F',
    blurb: 'Properly typeset maths, written in LaTeX and rendered as you type.',
    steps: [
      'Click to place a formula; an editor opens underneath it.',
      'Type LaTeX — the rendered result updates live above the box.',
      'Press Escape, or click away, to finish. Double-click to edit it again.'
    ],
    tips: [
      'Fractions \\frac{a}{b}, roots \\sqrt{x}, sums \\sum, integrals \\int, Greek \\alpha \\beta.',
      'Shorthands are built in: \\R \\N \\Z \\Q \\C for the number sets, \\dd for an upright d.',
      'Mistakes are shown in red rather than blanking the formula, so you can see what broke.'
    ]
  },
  {
    id: 'calc',
    title: 'Calculator',
    key: 'C',
    blurb: 'A running sheet of working, where every line shows its own result.',
    steps: [
      'Click to place one, then type a line at a time.',
      'Name values with = and reuse them further down: r = 4, then pi r^2.',
      'ans refers to the line above. Lines starting with # are notes.'
    ],
    tips: [
      'Multiplication can be left out: 2pi, 3(x+1) and 2r all work.',
      'Percentages behave like a till: 150 + 10% is 165, but 200 * 10% is 20.',
      'Toggle DEG/RAD on the note itself for trigonometry.',
      'Functions: sqrt cbrt root abs exp ln log log2 sin cos tan asin acos atan sinh cosh tanh floor ceil round min max hypot gcd lcm ncr npr sum mean fact.'
    ]
  },
  {
    id: 'plot',
    title: 'Graph',
    key: 'G',
    blurb: 'Plot one or more curves of y = f(x).',
    steps: [
      'Click to place a graph — it starts with y = x².',
      'Double-click it to edit the expression, add more curves, or zoom the axes.',
      'Anything the calculator understands can be plotted.'
    ],
    tips: [
      'Curves break at asymptotes rather than drawing a false vertical line — try tan(x) or 1/x.',
      'Several curves at once are colour-coded and listed on the graph.'
    ]
  },
  {
    id: 'rect',
    title: 'Shapes',
    key: 'R O D',
    blurb: 'Rectangle, ellipse and diamond, for boxing things out and drawing diagrams.',
    steps: [
      'Drag from one corner to the other. Hold Shift for a perfect square or circle.',
      'Click without dragging to drop one at a default size.',
      'Choose outline colour, fill and line style in the panel.'
    ],
    tips: [
      'R rectangle, O ellipse, D diamond.',
      'An unfilled shape is still selectable from anywhere inside it.',
      'The tool returns to Select once the shape is drawn, so you can move it straight away.'
    ]
  },
  {
    id: 'line',
    title: 'Line and arrow',
    key: 'L A',
    blurb: 'Straight connectors, with or without a head.',
    steps: [
      'Drag from where it starts to where it ends.',
      'Hold Shift to snap the angle to 15° steps.'
    ],
    tips: [
      'The arrowhead scales with the line thickness.',
      'Dashed and dotted styles are in the panel.'
    ]
  },
  {
    id: 'image',
    title: 'Images',
    key: '',
    blurb: 'Photographs of a page, a diagram from a slide, a screenshot.',
    steps: [
      'Paste with Ctrl+V, or drop a file onto the board.',
      'Or use the picture button at the bottom of the toolbar.',
      'Drag a corner to resize — the proportions are kept.'
    ],
    tips: [
      'Images are stored inside the board file, so syncing to another machine never leaves them behind.',
      'Keep them under 8 MB each so the database stays quick to copy.'
    ]
  }
]

export const SHORTCUT_GROUPS = [
  {
    group: 'Tools',
    keys: [
      ['V', 'Select'],
      ['H', 'Pan'],
      ['P', 'Pen'],
      ['M', 'Highlighter'],
      ['E', 'Eraser — press again to swap object / brush'],
      ['N', 'Sticky note'],
      ['T', 'Text'],
      ['F', 'Formula (LaTeX)'],
      ['C', 'Calculator'],
      ['G', 'Graph'],
      ['R / O / D', 'Rectangle / ellipse / diamond'],
      ['L / A', 'Line / arrow']
    ]
  },
  {
    group: 'Getting around',
    keys: [
      ['Scroll', 'Pan up and down'],
      ['Shift + scroll', 'Pan sideways'],
      ['Ctrl + scroll', 'Zoom to cursor'],
      ['Space + drag', 'Pan from any tool'],
      ['Middle-drag', 'Pan'],
      ['Ctrl + 0', 'Zoom to 100%'],
      ['Ctrl + 1', 'Fit everything on screen'],
      ['Ctrl + 2', 'Zoom to selection'],
      ['Ctrl + B', 'Open the board browser'],
      ['+ / −', 'Zoom in / out']
    ]
  },
  {
    group: 'Editing',
    keys: [
      ['Double-click', 'Edit an item, or make text on empty canvas'],
      ['Shift + drag', 'Constrain to one axis'],
      ['Shift + resize', 'Keep proportions'],
      ['Alt + resize', 'Resize around the centre'],
      ['Shift + click', 'Add to / remove from the selection'],
      ['Ctrl + A', 'Select everything'],
      ['Ctrl + D', 'Duplicate'],
      ['Ctrl + C / X / V', 'Copy / cut / paste'],
      ['Delete', 'Delete the selection'],
      ['Arrow keys', 'Nudge by 1 (Shift for 10)'],
      ['[ / ]', 'Send to back / bring to front'],
      ['Ctrl + Z', 'Undo'],
      ['Ctrl + Shift + Z', 'Redo'],
      ['Ctrl + S', 'Force a save now'],
      ['Esc', 'Finish editing / clear the selection']
    ]
  }
]
