<script setup>
const props = defineProps({
  name: { type: String, default: 'dot' },
  size: { type: [Number, String], default: 18 },
})

const paths = {
  dashboard: ['M4 4h7v7H4z', 'M13 4h7v4h-7z', 'M13 10h7v10h-7z', 'M4 13h7v7H4z'],
  calendar: ['M4 6h16v15H4z', 'M8 3v6', 'M16 3v6', 'M4 10h16'],
  bed: ['M3 18V8', 'M3 12h18v6', 'M7 12V9h5v3', 'M12 12V9h5v3', 'M3 18v2', 'M21 18v2'],
  file: ['M6 3h8l4 4v14H6z', 'M14 3v5h5', 'M9 13h6', 'M9 17h5'],
  monitor: ['M3 4h18v12H3z', 'M8 20h8', 'M12 16v4'],
  users: ['M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8z', 'M2 21v-2a5 5 0 0 1 5-5h4a5 5 0 0 1 5 5v2', 'M17 11a3 3 0 1 0 0-6', 'M22 21v-2a4 4 0 0 0-4-4'],
  spark: ['M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8z', 'M19 16l.8 2.2L22 19l-2.2.8L19 22l-.8-2.2L16 19l2.2-.8z'],
  approval: ['M9 11l3 3L22 4', 'M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11'],
  check: ['M20 6L9 17l-5-5'],
  book: ['M4 4h7a3 3 0 0 1 3 3v13a3 3 0 0 0-3-3H4z', 'M20 4h-3a3 3 0 0 0-3 3v13a3 3 0 0 1 3-3h3z'],
  settings: ['M12 15.5a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7z', 'M19.4 15a1.7 1.7 0 0 0 .3 1.9l.1.1-2.8 2.8-.1-.1a1.7 1.7 0 0 0-1.9-.3 1.7 1.7 0 0 0-1 1.6v.2h-4V21a1.7 1.7 0 0 0-1-1.6 1.7 1.7 0 0 0-1.9.3l-.1.1L4.2 17l.1-.1a1.7 1.7 0 0 0 .3-1.9A1.7 1.7 0 0 0 3 14H2.8v-4H3a1.7 1.7 0 0 0 1.6-1 1.7 1.7 0 0 0-.3-1.9L4.2 7 7 4.2l.1.1A1.7 1.7 0 0 0 9 4.6 1.7 1.7 0 0 0 10 3V2.8h4V3a1.7 1.7 0 0 0 1 1.6 1.7 1.7 0 0 0 1.9-.3l.1-.1L19.8 7l-.1.1a1.7 1.7 0 0 0-.3 1.9 1.7 1.7 0 0 0 1.6 1h.2v4H21a1.7 1.7 0 0 0-1.6 1z'],
  bell: ['M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9', 'M10 21h4'],
  search: ['M11 18a7 7 0 1 0 0-14 7 7 0 0 0 0 14z', 'M21 21l-4.3-4.3'],
  logout: ['M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4', 'M16 17l5-5-5-5', 'M21 12H9'],
  chevron: ['M9 18l6-6-6-6'],
  chevronDown: ['M6 9l6 6 6-6'],
  plus: ['M12 5v14', 'M5 12h14'],
  refresh: ['M20 11a8 8 0 0 0-14.9-4L3 9', 'M3 4v5h5', 'M4 13a8 8 0 0 0 14.9 4L21 15', 'M21 20v-5h-5'],
  close: ['M6 6l12 12', 'M18 6L6 18'],
  alert: ['M12 3l9 17H3z', 'M12 9v5', 'M12 18h.01'],
  arrow: ['M5 12h14', 'M13 6l6 6-6 6'],
  user: ['M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8z', 'M4 21v-2a6 6 0 0 1 6-6h4a6 6 0 0 1 6 6v2'],
  shield: ['M12 3l8 3v6c0 5-4 8-8 9-4-1-8-4-8-9V6z', 'M9 12l2 2 4-4'],
  clock: ['M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18z', 'M12 7v5l3 2'],
  wrench: ['M14 6a4 4 0 0 0-5 5l-6 6 2 2 6-6a4 4 0 0 0 5-5l-2 2-2-2z'],
  play: ['M8 5l11 7-11 7z'],
  download: ['M12 3v12', 'M7 10l5 5 5-5', 'M4 21h16'],
  trash: ['M4 7h16', 'M9 7V4h6v3', 'M6 7l1 14h10l1-14', 'M10 11v6', 'M14 11v6'],
  edit: ['M4 20h4L20 8l-4-4L4 16z', 'M14 6l4 4'],
  send: ['M22 2L11 13', 'M22 2l-7 20-4-9-9-4z'],
  menu: ['M3 6h18', 'M3 12h18', 'M3 18h18'],
  dot: ['M12 12h.01'],
  box: ['M3 7l9-4 9 4-9 4z', 'M3 7v10l9 4 9-4V7', 'M12 11v10'],
  database: ['M12 7c4.4 0 8-1.3 8-3s-3.6-3-8-3-8 1.3-8 3 3.6 3 8 3z', 'M4 4v7c0 1.7 3.6 3 8 3s8-1.3 8-3V4', 'M4 11v7c0 1.7 3.6 3 8 3s8-1.3 8-3v-7'],
  stethoscope: ['M6 3v5a4 4 0 0 0 8 0V3', 'M6 5H4', 'M14 5h2', 'M10 12v2a5 5 0 0 0 10 0v-2', 'M20 10a2 2 0 1 0 0 4 2 2 0 0 0 0-4z'],
  filter: ['M3 5h18', 'M6 12h12', 'M10 19h4'],
}

const list = paths[props.name] || paths.dot
</script>

<template>
  <svg :width="size" :height="size" viewBox="0 0 24 24" fill="none" stroke="currentColor"
       stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
    <path v-for="(d, i) in list" :key="i" :d="d" />
  </svg>
</template>
