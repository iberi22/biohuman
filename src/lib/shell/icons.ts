/*
 * Iconos de la app en un solo sitio, todos con la misma rejilla (24x24), el
 * mismo grosor de trazo y el mismo remate (los fija Icon.svelte). Sustituyen a
 * los emojis, que cambian de estilo segun el sistema operativo y no siguen el
 * color del tema. Trazos basados en Lucide (licencia ISC), reducidos a <path>.
 *
 * Vive en un .ts y no en el <script module> del componente para que las
 * paginas .astro puedan importar el tipo IconName sin pasar por Svelte.
 */
export const ICONS = {
  home: [
    'M15 21v-8a1 1 0 0 0-1-1h-4a1 1 0 0 0-1 1v8',
    'M3 10a2 2 0 0 1 .709-1.528l7-5.999a2 2 0 0 1 2.582 0l7 5.999A2 2 0 0 1 21 10v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z',
  ],
  table: ['M3 8h18', 'M5 8v12', 'M19 8v12', 'M5 14h14', 'M8 4h8'],
  clipboard: [
    'M9 2h6a1 1 0 0 1 1 1v2a1 1 0 0 1-1 1H9a1 1 0 0 1-1-1V3a1 1 0 0 1 1-1z',
    'M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2',
    'M12 11h4',
    'M12 16h4',
    'M8 11h.01',
    'M8 16h.01',
  ],
  chef: [
    'M17 21a1 1 0 0 0 1-1v-5.35c0-.457.316-.844.727-1.041a4 4 0 0 0-2.134-7.589 5 5 0 0 0-9.186 0 4 4 0 0 0-2.134 7.588c.411.198.727.585.727 1.041V20a1 1 0 0 0 1 1Z',
    'M6 17h12',
  ],
  package: [
    'M11 21.73a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73z',
    'M12 22V12',
    'm3.3 7 8.7 5 8.7-5',
    'm7.5 4.27 9 5.15',
  ],
  utensils: [
    'M3 2v7c0 1.1.9 2 2 2h4a2 2 0 0 0 2-2V2',
    'M7 2v20',
    'M21 15V2a5 5 0 0 0-5 5v6c0 1.1.9 2 2 2h3Zm0 0v7',
  ],
  book: [
    'M12 7v14',
    'M3 18a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1h5a4 4 0 0 1 4 4 4 4 0 0 1 4-4h5a1 1 0 0 1 1 1v13a1 1 0 0 1-1 1h-6a3 3 0 0 0-3 3 3 3 0 0 0-3-3z',
  ],
  receipt: [
    'M4 2v20l2-1 2 1 2-1 2 1 2-1 2 1 2-1 2 1V2l-2 1-2-1-2 1-2-1-2 1-2-1-2 1Z',
    'M16 8h-6a2 2 0 1 0 0 4h4a2 2 0 1 1 0 4H8',
    'M12 17.5v-11',
  ],
  device: ['M7 2h10a2 2 0 0 1 2 2v16a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2z', 'M12 18h.01'],
  wifi: [
    'M12 20h.01',
    'M2 8.82a15 15 0 0 1 20 0',
    'M5 12.859a10 10 0 0 1 14 0',
    'M8.5 16.429a5 5 0 0 1 7 0',
  ],
  qr: [
    'M4 3h3a1 1 0 0 1 1 1v3a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1z',
    'M17 3h3a1 1 0 0 1 1 1v3a1 1 0 0 1-1 1h-3a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1z',
    'M4 16h3a1 1 0 0 1 1 1v3a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1v-3a1 1 0 0 1 1-1z',
    'M21 16h-3a2 2 0 0 0-2 2v3',
    'M21 21v.01',
    'M12 7v3a2 2 0 0 1-2 2H7',
    'M3 12h.01',
    'M12 3h.01',
    'M12 16v.01',
    'M16 12h1',
    'M21 12v.01',
    'M12 21v-1',
  ],
  login: ['M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4', 'm10 17 5-5-5-5', 'M15 12H3'],
  chart: ['M3 3v16a2 2 0 0 0 2 2h16', 'M18 17V9', 'M13 17V5', 'M8 17v-3'],
  transfer: ['m21 16-4 4-4-4', 'M17 20V4', 'm3 8 4-4 4 4', 'M7 4v16'],
  settings: [
    'M9.671 4.136a2.34 2.34 0 0 1 4.659 0 2.34 2.34 0 0 0 3.319 1.915 2.34 2.34 0 0 1 2.33 4.033 2.34 2.34 0 0 0 0 3.831 2.34 2.34 0 0 1-2.33 4.033 2.34 2.34 0 0 0-3.319 1.915 2.34 2.34 0 0 1-4.659 0 2.34 2.34 0 0 0-3.32-1.915 2.34 2.34 0 0 1-2.33-4.033 2.34 2.34 0 0 0 0-3.831A2.34 2.34 0 0 1 6.35 6.051a2.34 2.34 0 0 0 3.319-1.915',
    'M15 12a3 3 0 1 1-6 0 3 3 0 0 1 6 0',
  ],
  heart: ['M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.76 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4.05 3 5.5l7 7Z'],
  menu: ['M4 6h16', 'M4 12h16', 'M4 18h16'],
  close: ['M18 6 6 18', 'm6 6 12 12'],

  // --- Icons for the bottom bar with a central action (ported from openGym) ---
  //
  // Same 24x24 grid, same stroke weight and same terminals as the rest of the set.
  // openGym's `rect` elements (calendar, dumbbell) are converted to paths with arcs
  // so Icon.svelte — which only draws <path> — can render them; coordinates are
  // rounded to one decimal, matching the convention above.
  house: ['M3.5 10.7 12 3.8l8.5 6.9M5.9 9.4V19a1.4 1.4 0 0 0 1.4 1.4h9.4A1.4 1.4 0 0 0 18.1 19V9.4'],
  calendar: [
    'M6.6 5.2H17.4A3.2 3.2 0 0 1 20.6 8.4V17.4A3.2 3.2 0 0 1 17.4 20.6H6.6A3.2 3.2 0 0 1 3.4 17.4V8.4A3.2 3.2 0 0 1 6.6 5.2Z',
    'M8.2 3.4v3.4M15.8 3.4v3.4M3.4 10.2h17.2',
  ],
  dumbbell: [
    'M7.2 7.9H7.8A1.3 1.3 0 0 1 9.1 9.2V14.8A1.3 1.3 0 0 1 7.8 16.1H7.2A1.3 1.3 0 0 1 5.9 14.8V9.2A1.3 1.3 0 0 1 7.2 7.9Z',
    'M16.2 7.9H16.8A1.3 1.3 0 0 1 18.1 9.2V14.8A1.3 1.3 0 0 1 16.8 16.1H16.2A1.3 1.3 0 0 1 14.9 14.8V9.2A1.3 1.3 0 0 1 16.2 7.9Z',
    'M9.1 12h5.8M3.6 9.9v4.2M20.4 9.9v4.2',
  ],
  play: ['M8.4 5.6 18 12l-9.6 6.4Z'],
  list: ['M8.4 6.6h11.2M8.4 12h11.2M8.4 17.4h11.2M4.6 6.6h.01M4.6 12h.01M4.6 17.4h.01'],
} as const satisfies Record<string, readonly string[]>;

export type IconName = keyof typeof ICONS;
