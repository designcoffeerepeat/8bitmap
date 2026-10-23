// NYC geography, simplified into a tile grid.
// Everything on the map (land, parks, bridges, buildings, event pins) goes
// through latLngToCell / latLngToWorld so real event coordinates line up
// with the voxel city.

import LAND from './land.json';

// Land and borough shapes come from tools/build_land.py, which also sets the map's edges.
export const BOUNDS = LAND.bounds;
export const CELL = LAND.cell; // ~133m x ~135m per tile

export const COLS = LAND.cols;
export const ROWS = LAND.rows.length;

export const T = { WATER: 0, LAND: 1, PARK: 2, AIRPORT: 3, BRIDGE: 4, BEACH: 5 };

// land.json letters to areas. Brooklyn and Queens share Long Island's look, as before.
const AREA_CODES = {
  m: 'manhattan', x: 'bronx', k: 'li', q: 'li', s: 'si', n: 'nj', w: 'suburb', l: 'suburb',
};

// Polygons below are [lat, lng] pairs, roughly traced from real maps.
const ISLANDS = [
  // Randall's & Wards Island
  [[40.8020, -73.9280], [40.8010, -73.9150], [40.7870, -73.9130], [40.7830, -73.9250]],
  // Governors Island
  [[40.6940, -74.0160], [40.6920, -74.0110], [40.6870, -74.0130], [40.6840, -74.0230], [40.6875, -74.0255]],
  // Liberty Island
  [[40.6905, -74.0460], [40.6905, -74.0430], [40.6880, -74.0430], [40.6880, -74.0460]],
  // Ellis Island
  [[40.7005, -74.0405], [40.7005, -74.0380], [40.6985, -74.0380], [40.6985, -74.0405]],
];

const PARKS = [
  // Central Park
  [[40.7681, -73.9817], [40.7644, -73.9730], [40.7969, -73.9496], [40.8006, -73.9580]],
  // Prospect Park
  [[40.6720, -73.9700], [40.6630, -73.9620], [40.6530, -73.9730], [40.6600, -73.9800]],
  // Randall's Island park
  [[40.8010, -73.9270], [40.8000, -73.9160], [40.7880, -73.9145], [40.7845, -73.9240]],
  // Governors Island
  [[40.6935, -74.0160], [40.6915, -74.0115], [40.6870, -74.0135], [40.6845, -74.0225], [40.6875, -74.0245]],
  // Liberty State Park (NJ)
  [[40.7050, -74.0450], [40.6950, -74.0400], [40.6900, -74.0550], [40.7000, -74.0620]],
  // Bronx Zoo + Botanical Garden
  [[40.8640, -73.8800], [40.8620, -73.8690], [40.8440, -73.8710], [40.8460, -73.8820]],
  // Fort Tryon + Inwood Hill
  [[40.8720, -73.9290], [40.8720, -73.9220], [40.8600, -73.9290], [40.8600, -73.9330]],
  // Brooklyn Bridge Park
  [[40.7040, -73.9960], [40.7020, -73.9945], [40.6950, -73.9990], [40.6960, -74.0010]],
  // McCarren Park
  [[40.7230, -73.9540], [40.7230, -73.9480], [40.7190, -73.9480], [40.7190, -73.9540]],
  // Astoria Park
  [[40.7820, -73.9250], [40.7800, -73.9200], [40.7740, -73.9240], [40.7760, -73.9290]],
  // Van Cortlandt Park
  [[40.9040, -73.8990], [40.9040, -73.8780], [40.8850, -73.8800], [40.8820, -73.8960]],
  // Pelham Bay Park
  [[40.8800, -73.8250], [40.8830, -73.8000], [40.8650, -73.7900], [40.8500, -73.8100], [40.8560, -73.8300]],
  // Flushing Meadows Corona Park
  [[40.7560, -73.8470], [40.7560, -73.8380], [40.7280, -73.8320], [40.7280, -73.8420]],
  // Forest Park
  [[40.7050, -73.8700], [40.7030, -73.8350], [40.6940, -73.8370], [40.6960, -73.8650]],
  // Cunningham Park
  [[40.7400, -73.7800], [40.7400, -73.7640], [40.7280, -73.7660], [40.7280, -73.7820]],
  // Alley Pond Park
  [[40.7620, -73.7500], [40.7600, -73.7380], [40.7350, -73.7380], [40.7360, -73.7480]],
  // Marine Park
  [[40.6080, -73.9300], [40.6050, -73.9150], [40.5900, -73.9180], [40.5920, -73.9300]],
  // Dyker Beach Park
  [[40.6170, -74.0230], [40.6150, -74.0130], [40.6070, -74.0150], [40.6080, -74.0250]],
  // Fort Tilden and Jacob Riis Park
  [[40.5680, -73.8950], [40.5730, -73.8650], [40.5640, -73.8640], [40.5580, -73.8950]],
  // Staten Island Greenbelt
  [[40.6050, -74.1500], [40.6000, -74.1150], [40.5780, -74.1200], [40.5700, -74.1450]],
  // Freshkills Park
  [[40.5950, -74.2000], [40.5950, -74.1700], [40.5650, -74.1700], [40.5700, -74.2000]],
  // Great Kills Park
  [[40.5530, -74.1350], [40.5500, -74.1180], [40.5360, -74.1230], [40.5420, -74.1400]],
  // Conference House Park
  [[40.5060, -74.2560], [40.5060, -74.2470], [40.4980, -74.2470], [40.4990, -74.2560]],
];

const AIRPORTS = [
  // LaGuardia
  [[40.7860, -73.8880], [40.7860, -73.8580], [40.7700, -73.8580], [40.7660, -73.8720], [40.7700, -73.8880]],
  // JFK
  [[40.6650, -73.8150], [40.6650, -73.7700], [40.6320, -73.7450], [40.6200, -73.7700], [40.6300, -73.8000], [40.6450, -73.8250]],
  // Floyd Bennett Field
  [[40.5990, -73.8990], [40.5960, -73.8830], [40.5810, -73.8850], [40.5820, -73.9000]],
  // Newark (NJ)
  [[40.7050, -74.1850], [40.7050, -74.1600], [40.6750, -74.1650], [40.6750, -74.1850]],
];

// Bands along the ocean beaches; land tiles in a band near the water become sand.
const BEACHES = [
  // Coney Island, Brighton Beach, Manhattan Beach
  [[40.5800, -74.0120], [40.5800, -73.9350], [40.5650, -73.9350], [40.5650, -74.0120]],
  // The Rockaways
  [[40.5620, -73.9450], [40.6010, -73.7400], [40.5850, -73.7400], [40.5460, -73.9450]],
  // Staten Island's South Beach and Midland Beach
  [[40.6000, -74.0600], [40.5900, -74.0550], [40.5550, -74.1050], [40.5650, -74.1120]],
];

// Roosevelt Island is thin, so it is drawn as a line of tiles.
const THIN_ISLANDS = [
  [[40.7530, -73.9605], [40.7620, -73.9530], [40.7720, -73.9440]],
];

export const BRIDGES = [
  { name: 'Brooklyn Bridge', from: [40.7095, -74.0010], to: [40.7020, -73.9920], towers: true },
  { name: 'Manhattan Bridge', from: [40.7140, -73.9935], to: [40.7020, -73.9860], towers: true },
  { name: 'Williamsburg Bridge', from: [40.7155, -73.9790], to: [40.7120, -73.9640], towers: true },
  { name: 'Queensboro Bridge', from: [40.7590, -73.9600], to: [40.7530, -73.9440], towers: false },
  { name: 'George Washington Bridge', from: [40.8517, -73.9460], to: [40.8535, -73.9670], towers: true },
  { name: 'RFK Bridge', from: [40.8000, -73.9300], to: [40.7800, -73.9250], towers: false },
  { name: 'Verrazzano-Narrows Bridge', from: [40.6030, -74.0580], to: [40.6115, -74.0300], towers: true },
  { name: 'Bayonne Bridge', from: [40.6390, -74.1440], to: [40.6450, -74.1385], towers: false },
  { name: 'Goethals Bridge', from: [40.6340, -74.1960], to: [40.6385, -74.2050], towers: false },
  { name: 'Outerbridge Crossing', from: [40.5250, -74.2440], to: [40.5285, -74.2570], towers: false },
  { name: 'Throgs Neck Bridge', from: [40.8080, -73.7930], to: [40.7900, -73.7950], towers: true },
  { name: 'Whitestone Bridge', from: [40.8080, -73.8290], to: [40.7920, -73.8300], towers: true },
  { name: 'Marine Parkway Bridge', from: [40.5830, -73.8850], to: [40.5700, -73.8840], towers: false },
  { name: 'Cross Bay Bridge', from: [40.5960, -73.8195], to: [40.5850, -73.8160], towers: false },
];

// Simple seeded RNG so the city looks the same on every load.
export function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function latLngToCell(lat, lng) {
  return {
    col: (lng - BOUNDS.west) / CELL.lng,
    row: (BOUNDS.north - lat) / CELL.lat,
  };
}

// World space: 1 unit per tile, x grows east, z grows south, centred on the grid.
export function latLngToWorld(lat, lng) {
  const { col, row } = latLngToCell(lat, lng);
  return { x: col - COLS / 2, z: row - ROWS / 2 };
}

export function inBounds(lat, lng) {
  return lat >= BOUNDS.south && lat <= BOUNDS.north && lng >= BOUNDS.west && lng <= BOUNDS.east;
}

function cellCenter(col, row) {
  return [BOUNDS.north - (row + 0.5) * CELL.lat, BOUNDS.west + (col + 0.5) * CELL.lng];
}

function pointInPoly(lat, lng, poly) {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [yi, xi] = poly[i];
    const [yj, xj] = poly[j];
    if ((yi > lat) !== (yj > lat) && lng < ((xj - xi) * (lat - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

// Bounding boxes first, since every tile is tested against every polygon.
const boxes = new Map();
function inAny(lat, lng, polys) {
  for (const p of polys) {
    let b = boxes.get(p);
    if (!b) {
      b = [Math.min(...p.map((q) => q[0])), Math.max(...p.map((q) => q[0])), Math.min(...p.map((q) => q[1])), Math.max(...p.map((q) => q[1]))];
      boxes.set(p, b);
    }
    if (lat >= b[0] && lat <= b[1] && lng >= b[2] && lng <= b[3] && pointInPoly(lat, lng, p)) return true;
  }
  return false;
}

function walkLine(a, b, fn) {
  const p = latLngToCell(a[0], a[1]);
  const q = latLngToCell(b[0], b[1]);
  const steps = Math.ceil(Math.hypot(q.col - p.col, q.row - p.row) * 2) + 1;
  for (let s = 0; s <= steps; s++) {
    const t = s / steps;
    fn(Math.floor(p.col + (q.col - p.col) * t), Math.floor(p.row + (q.row - p.row) * t));
  }
}

function gauss(lat, lng, cLat, cLng, sigma) {
  const dy = (lat - cLat) / sigma;
  const dx = ((lng - cLng) * 0.76) / sigma; // cos(40.7deg) corrects lng distance
  return Math.exp(-(dx * dx + dy * dy) / 2);
}

// Skyline peaks: [lat, lng, sigma in degrees, extra height in levels]
const PEAKS = [
  [40.7550, -73.9820, 0.0120, 11], // Midtown
  [40.7075, -74.0100, 0.0055, 12], // Financial District
  [40.7540, -74.0010, 0.0030, 7],  // Hudson Yards
  [40.7420, -73.9890, 0.0060, 4],  // Flatiron / Chelsea
  [40.7750, -73.9600, 0.0100, 3],  // Upper East Side
  [40.7850, -73.9750, 0.0080, 3],  // Upper West Side
  [40.6930, -73.9850, 0.0050, 7],  // Downtown Brooklyn
  [40.7470, -73.9440, 0.0040, 6],  // Long Island City
  [40.7170, -74.0350, 0.0045, 8],  // Jersey City Exchange Place
  [40.7200, -73.9580, 0.0060, 2],  // Williamsburg waterfront
  [40.7590, -73.8300, 0.0040, 3],  // Downtown Flushing
  [40.7020, -73.8000, 0.0040, 2],  // Jamaica
  [40.8520, -73.9000, 0.0150, 1],  // West Bronx apartment blocks
  [40.5780, -73.9600, 0.0040, 2],  // Brighton Beach and Coney Island towers
  [40.6430, -74.0780, 0.0030, 2],  // St. George
  [40.7340, -74.1700, 0.0060, 4],  // Downtown Newark
];

// Base heights: the outer boroughs and suburbs are mostly low-rise houses.
const BOROUGH_BASE = { manhattan: 3, bronx: 1.4, li: 1.2, nj: 1.2, si: 0.9, suburb: 0.8, island: 0 };

export function buildCity() {
  const n = COLS * ROWS;
  const type = new Uint8Array(n);
  const area = new Array(n).fill(null);
  const height = new Float32Array(n); // building height in levels, 0 = no building
  const street = new Uint8Array(n); // 1 = road tile in the street grid
  const codes = LAND.rows.flatMap((line) => [...line.matchAll(/(\d+)(.)/g)].flatMap(([, k, c]) => Array(+k).fill(c)));

  for (let row = 0; row < ROWS; row++) {
    for (let col = 0; col < COLS; col++) {
      const [lat, lng] = cellCenter(col, row);
      const i = row * COLS + col;
      if (codes[i] !== '.') { type[i] = T.LAND; area[i] = AREA_CODES[codes[i]]; }
      if (inAny(lat, lng, ISLANDS)) { type[i] = T.LAND; area[i] = 'island'; }
      if (type[i] === T.LAND) {
        if (inAny(lat, lng, PARKS)) type[i] = T.PARK;
        else if (inAny(lat, lng, AIRPORTS)) type[i] = T.AIRPORT;
      }
    }
  }

  for (const line of THIN_ISLANDS) {
    for (let k = 0; k < line.length - 1; k++) {
      walkLine(line[k], line[k + 1], (c, r) => {
        if (c < 0 || r < 0 || c >= COLS || r >= ROWS) return;
        const i = r * COLS + c;
        type[i] = T.LAND; area[i] = 'island';
      });
    }
  }

  // Sandy edge on land tiles that touch water, like an old overworld map.
  const isWater = (c, r) => c < 0 || r < 0 || c >= COLS || r >= ROWS || type[r * COLS + c] === T.WATER;
  const shore = new Uint8Array(n);
  for (let row = 0; row < ROWS; row++) {
    for (let col = 0; col < COLS; col++) {
      const i = row * COLS + col;
      if (type[i] === T.WATER) {
        shore[i] = (!isWater(col + 1, row) || !isWater(col - 1, row) || !isWater(col, row + 1) || !isWater(col, row - 1)) ? 1 : 0;
      }
    }
  }

  // Beach bands: land within two tiles of open water turns to sand.
  const nearWater = (c, r) => {
    for (let dr = -2; dr <= 2; dr++) for (let dc = -2; dc <= 2; dc++) if (isWater(c + dc, r + dr)) return true;
    return false;
  };
  for (let row = 0; row < ROWS; row++) {
    for (let col = 0; col < COLS; col++) {
      const i = row * COLS + col;
      if (type[i] !== T.LAND) continue;
      const [lat, lng] = cellCenter(col, row);
      if (inAny(lat, lng, BEACHES) && nearWater(col, row)) type[i] = T.BEACH;
    }
  }

  const rand = rng(1904);
  for (let row = 0; row < ROWS; row++) {
    for (let col = 0; col < COLS; col++) {
      const i = row * COLS + col;
      if (type[i] !== T.LAND) continue;
      const [lat, lng] = cellCenter(col, row);
      let h = BOROUGH_BASE[area[i]] + rand() * 1.6;
      for (const [pLat, pLng, s, amp] of PEAKS) h += amp * gauss(lat, lng, pLat, pLng, s);
      const r = rand();
      if (area[i] === 'manhattan' && r < 0.05) h *= 1.6; // the odd tower
      if (area[i] !== 'manhattan' && r < 0.12) h = 0; // low-rise gaps and lots
      // past Jersey City and the city line the suburbs are just a light scatter of houses
      if ((area[i] === 'suburb' || (area[i] === 'nj' && lng < -74.09)) && r < 0.6) h = 0;
      if (area[i] === 'island') h = r < 0.3 ? 1 : 0;
      height[i] = h < 0.6 ? 0 : Math.round(h * 2) / 2;
      // a loose street grid: avenues and major cross streets stay open
      const isStreet = area[i] === 'manhattan' ? col % 3 === 0 || row % 5 === 0 : col % 4 === 0 || row % 4 === 0;
      if (isStreet && area[i] !== 'island') { street[i] = 1; height[i] = 0; }
    }
  }

  // Bridges sit on top of the water tiles they cross.
  const bridgeCells = [];
  for (const b of BRIDGES) {
    walkLine(b.from, b.to, (c, r) => {
      if (c < 0 || r < 0 || c >= COLS || r >= ROWS) return;
      const i = r * COLS + c;
      if (type[i] === T.WATER) { type[i] = T.BRIDGE; bridgeCells.push(i); }
    });
  }

  return { type, area, height, street, shore, bridgeCells };
}

// Landmarks get their own hand-built meshes in the renderer.
// `clear` empties the tiles within that many tiles of the centre for a bigger model;
// `low` caps the buildings within that many tiles so a short landmark still shows.
export const LANDMARKS = [
  { id: 'wtc', name: 'One World Trade', lat: 40.7127, lng: -74.0134 },
  { id: 'esb', name: 'Empire State', lat: 40.7484, lng: -73.9857 },
  { id: 'msg', name: 'Madison Square Garden', lat: 40.7505, lng: -73.9935, clear: 1, low: 4.5 },
  // Times Square: the tiles along Broadway and 7th Ave from 42nd to 48th St are left open for the
  // plaza in src/scripts/times-square.js
  { id: 'tsq', name: 'Times Square', lat: 40.7552, lng: -73.9870, to: [40.7597, -73.9848], clear: 1 },
  { id: 'chrysler', name: 'Chrysler Building', lat: 40.7516, lng: -73.9755 },
  { id: 'liberty', name: 'Statue of Liberty', lat: 40.6892, lng: -74.0445 },
  { id: 'yankee', name: 'Yankee Stadium', lat: 40.8296, lng: -73.9262 },
  { id: 'unisphere', name: 'Barclays Center', lat: 40.6826, lng: -73.9754 },
  { id: 'citi', name: 'Citi Field', lat: 40.7571, lng: -73.8458 },
  { id: 'globe', name: 'Unisphere', lat: 40.7465, lng: -73.8449 },
  { id: 'parachute', name: 'Parachute Jump', lat: 40.5741, lng: -73.9853 },
  { id: 'wheel', name: 'Wonder Wheel', lat: 40.5741, lng: -73.9781 },
];

// The tiles a landmark clears of generic buildings: within clear + 0.5 tiles of its spot,
// or of the line to l.to when it has one.
export function clearedTiles(l) {
  const a = latLngToCell(l.lat, l.lng);
  const b = l.to ? latLngToCell(l.to[0], l.to[1]) : a;
  const r = l.clear ?? 0;
  const tiles = [];
  const c0 = Math.floor(Math.min(a.col, b.col) - r - 1);
  const c1 = Math.ceil(Math.max(a.col, b.col) + r + 1);
  const w0 = Math.floor(Math.min(a.row, b.row) - r - 1);
  const w1 = Math.ceil(Math.max(a.row, b.row) + r + 1);
  const len2 = (b.col - a.col) ** 2 + (b.row - a.row) ** 2;
  for (let w = w0; w <= w1; w++) {
    for (let c = c0; c <= c1; c++) {
      const x = c + 0.5;
      const y = w + 0.5;
      const t = len2 ? Math.max(0, Math.min(1, ((x - a.col) * (b.col - a.col) + (y - a.row) * (b.row - a.row)) / len2)) : 0;
      if (Math.hypot(x - a.col - t * (b.col - a.col), y - a.row - t * (b.row - a.row)) <= r + 0.5) tiles.push({ col: c, row: w });
    }
  }
  return tiles;
}

export const LABELS = [
  { text: 'MIDTOWN', lat: 40.7515, lng: -73.9790 },
  { text: 'DOWNTOWN', lat: 40.7140, lng: -74.0060 },
  { text: 'HARLEM', lat: 40.8110, lng: -73.9460 },
  { text: 'BROOKLYN', lat: 40.6780, lng: -73.9500 },
  { text: 'QUEENS', lat: 40.7550, lng: -73.9050 },
  { text: 'THE BRONX', lat: 40.8450, lng: -73.8950 },
  { text: 'JERSEY CITY', lat: 40.7250, lng: -74.0550 },
  { text: 'STATEN ISLAND', lat: 40.5850, lng: -74.1450 },
  { text: 'CONEY ISLAND', lat: 40.5790, lng: -73.9800 },
  { text: 'THE ROCKAWAYS', lat: 40.5760, lng: -73.8350 },
  { text: 'FLUSHING', lat: 40.7620, lng: -73.8250 },
  { text: 'JAMAICA', lat: 40.7020, lng: -73.7950 },
  { text: 'HUDSON RIVER', lat: 40.7900, lng: -74.0010, water: true },
  { text: 'EAST RIVER', lat: 40.7270, lng: -73.9680, water: true },
  { text: 'UPPER BAY', lat: 40.6650, lng: -74.0420, water: true },
  { text: 'LOWER BAY', lat: 40.5450, lng: -74.0250, water: true },
  { text: 'JAMAICA BAY', lat: 40.6150, lng: -73.8650, water: true },
  { text: 'ATLANTIC OCEAN', lat: 40.5250, lng: -73.8600, water: true },
  { text: 'NEWARK BAY', lat: 40.6750, lng: -74.1400, water: true },
];
