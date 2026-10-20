// One palette for the whole city, taken from a three colour isometric NYC poster:
// light blue water, cobalt shadow faces, bright orange fronts, warm cream ground and roofs,
// all drawn with navy ink lines.
const COBALT = '#0a3a8c';
const ORANGE = '#f35507';
const CREAM = '#f0e8d7';
const NAVY = '#112c62';

export const PALETTE = {
  cobalt: COBALT,
  orange: ORANGE,
  cream: CREAM,
  navy: NAVY,
  sky: '#9fe6fa',
  water: ['#aeeeff', '#b8f1ff'],
  waterShore: '#94def5',
  waterGlint: '#ffffff',
  land: { manhattan: CREAM, bronx: '#ece3d0', li: '#eee5d3', nj: '#e9dfcb', island: CREAM },
  landSide: '#1d4796',
  sand: '#f5efe2',
  park: ['#e6dcc4', '#e1d6bc'],
  tree: ['#fbf7ee', '#f5efe2', '#ffffff'],
  airport: '#ddd3bf',
  runway: NAVY,
  bridge: CREAM,
  bridgeTower: ORANGE,
  // the colour of each building's lit side face, grouped by how tall the tile is;
  // roofs are always cream and the other side is always cobalt
  street: '#e2d7c1',
  low: [ORANGE, ORANGE, ORANGE, CREAM, ORANGE],
  mid: [ORANGE, ORANGE, ORANGE, CREAM],
  high: [ORANGE, ORANGE, CREAM, ORANGE],
  glass: COBALT,
  liberty: COBALT,
  pinHi: CREAM,
};

export const CATEGORY_COLORS = {
  music: '#ff5c8a',
  art: '#b98cff',
  food: '#ffb347',
  comedy: '#ffe14d',
  sports: '#4dd2ff',
  nightlife: '#ff7b4d',
  community: '#6ee07a',
  film: '#ffffff',
};
