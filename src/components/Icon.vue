<script setup>
defineProps({
  name: { type: String, required: true },
  size: { type: [Number, String], default: 20 }
})

// Single-path icons on a 24x24 grid, stroked. Inline so the app has no icon
// font or network request — it works with the laptop completely offline.
const PATHS = {
  cursor: 'M5 3l14 8-6 1.5L10 19z',
  hand: 'M8 13V5.5a1.5 1.5 0 013 0V11m0-1.5a1.5 1.5 0 013 0V12m0-1a1.5 1.5 0 013 0v4a5 5 0 01-5 5h-1.5a5 5 0 01-4.2-2.3L6 15.5c-.6-1 .1-2.3 1.2-2.3.5 0 .9.2 1.2.6L9 15',
  pen: 'M4 20l1-4L16.5 4.5a2.1 2.1 0 013 3L8 19l-4 1zM14.5 6.5l3 3',
  marker: 'M6 20h5m-6.5-3.5l7-11a2 2 0 013 0l1.5 1.5a2 2 0 010 3l-7 11H4.5z',
  eraser: 'M8 20h11M4.7 16.3l6-6a2 2 0 013 0l4 4a2 2 0 010 3l-3 3H8zM9.5 12.5l5 5',
  sticky: 'M5 4h14v10l-5 5H5zM19 14h-5v5',
  text: 'M6 6h12M12 6v13M9 19h6',
  sigma: 'M17 5H7l6 7-6 7h10',
  calc: 'M6 3h12v18H6zM9 7h6M9 11h1m3 0h1m-4 3h1m3 0h1m-4 3h5',
  graph: 'M4 20V4M4 20h16M7 16l3.5-5 3 3L20 7',
  rect: 'M4 6h16v12H4z',
  ellipse: 'M12 6c4.4 0 8 2.7 8 6s-3.6 6-8 6-8-2.7-8-6 3.6-6 8-6z',
  diamond: 'M12 3l9 9-9 9-9-9z',
  line: 'M5 19L19 5',
  arrow: 'M5 19L19 5M19 5h-6M19 5v6',
  image: 'M4 5h16v14H4zM4 15l4.5-4.5 4 4L16 11l4 4M15 8.5h.01',
  undo: 'M9 14L4 9l5-5M4 9h9a6 6 0 010 12h-3',
  redo: 'M15 14l5-5-5-5M20 9h-9a6 6 0 000 12h3',
  plus: 'M12 5v14M5 12h14',
  minus: 'M5 12h14',
  fit: 'M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5',
  trash: 'M4 7h16M9 7V5h6v2M6 7l1 13h10l1-13M10 11v6M14 11v6',
  copy: 'M9 9h11v11H9zM5 15V4h11',
  front: 'M12 3l8 5-8 5-8-5zM4 14l8 5 8-5',
  back: 'M12 21l-8-5 8-5 8 5zM20 10l-8-5-8 5',
  help: 'M12 21a9 9 0 100-18 9 9 0 000 18zM9.5 9.5a2.5 2.5 0 115 0c0 1.7-2.5 1.8-2.5 4M12 17.5h.01',
  close: 'M6 6l12 12M18 6L6 18',
  boards: 'M4 5h7v6H4zM13 5h7v14h-7zM4 13h7v6H4z',
  download: 'M12 4v11m0 0l-4-4m4 4l4-4M5 19h14',
  upload: 'M12 20V9m0 0L8 13m4-4l4 4M5 5h14',
  sync: 'M4 12a8 8 0 0113.7-5.7L20 8M20 4v4h-4M20 12a8 8 0 01-13.7 5.7L4 16M4 20v-4h4',
  chevron: 'M6 9l6 6 6-6',
  check: 'M5 12.5l5 5 9-11',
  database: 'M12 3c4.4 0 8 1.3 8 3s-3.6 3-8 3-8-1.3-8-3 3.6-3 8-3zM4 6v12c0 1.7 3.6 3 8 3s8-1.3 8-3V6M4 12c0 1.7 3.6 3 8 3s8-1.3 8-3',
  grid: 'M4 4h16v16H4zM4 10h16M4 15h16M10 4v16M15 4v16',
  keyboard: 'M3 6h18v12H3zM7 10h.01M11 10h.01M15 10h.01M7 14h10',
  settings: 'M12 15a3 3 0 100-6 3 3 0 000 6zM19.4 15a1.6 1.6 0 00.3 1.8l.1.1a2 2 0 11-2.8 2.8l-.1-.1a1.6 1.6 0 00-1.8-.3 1.6 1.6 0 00-1 1.5V21a2 2 0 11-4 0v-.1A1.6 1.6 0 008 19.4a1.6 1.6 0 00-1.8.3l-.1.1a2 2 0 11-2.8-2.8l.1-.1a1.6 1.6 0 00.3-1.8 1.6 1.6 0 00-1.5-1H2a2 2 0 110-4h.1A1.6 1.6 0 004.6 8a1.6 1.6 0 00-.3-1.8l-.1-.1a2 2 0 112.8-2.8l.1.1a1.6 1.6 0 001.8.3H9a1.6 1.6 0 001-1.5V2a2 2 0 114 0v.1a1.6 1.6 0 001 1.5 1.6 1.6 0 001.8-.3l.1-.1a2 2 0 112.8 2.8l-.1.1a1.6 1.6 0 00-.3 1.8V9a1.6 1.6 0 001.5 1H22a2 2 0 110 4h-.1a1.6 1.6 0 00-1.5 1z',
  play: 'M7 4l13 8-13 8z',
  sparkle: 'M12 3l1.9 5.1L19 10l-5.1 1.9L12 17l-1.9-5.1L5 10l5.1-1.9zM18 3.5l.6 1.6 1.6.6-1.6.6L18 8l-.6-1.7-1.6-.6 1.6-.6z'
}
</script>

<template>
  <svg
    :width="size"
    :height="size"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    stroke-width="1.6"
    stroke-linecap="round"
    stroke-linejoin="round"
    aria-hidden="true"
    focusable="false"
  >
    <path :d="PATHS[name] || ''" />
  </svg>
</template>
