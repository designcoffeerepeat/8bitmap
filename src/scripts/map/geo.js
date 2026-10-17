// NYC geography, simplified into a tile grid.
// Everything on the map (land, parks, bridges, buildings, event pins) goes
// through latLngToCell / latLngToWorld so real event coordinates line up
// with the voxel city.

export const BOUNDS = { west: -74.07, east: -73.86, south: 40.64, north: 40.88 };
export const CELL = { lat: 0.0012, lng: 0.0016 }; // ~133m x ~135m per tile

export const COLS = Math.round((BOUNDS.east - BOUNDS.west) / CELL.lng);
export const ROWS = Math.round((BOUNDS.north - BOUNDS.south) / CELL.lat);

export const T = { WATER: 0, LAND: 1, PARK: 2, AIRPORT: 3, BRIDGE: 4, BEACH: 5 };

// Polygons are [lat, lng] pairs, roughly traced from real shorelines.
const MANHATTAN = [
  [40.7003, -74.0153], [40.7090, -74.0185], [40.7180, -74.0160], [40.7300, -74.0125],
  [40.7470, -74.0100], [40.7620, -74.0010], [40.7740, -73.9930], [40.7820, -73.9880],
  [40.7980, -73.9770], [40.8180, -73.9620], [40.8330, -73.9500], [40.8510, -73.9470],
  [40.8650, -73.9300], [40.8780, -73.9260], [40.8770, -73.9180], [40.8740, -73.9100],
  [40.8700, -73.9110], [40.8650, -73.9150], [40.8500, -73.9270], [40.8350, -73.9330],
  [40.8290, -73.9340], [40.8150, -73.9340], [40.8020, -73.9300], [40.7950, -73.9330],
  [40.7840, -73.9430], [40.7710, -73.9480], [40.7580, -73.9580], [40.7480, -73.9680],
  [40.7440, -73.9710], [40.7350, -73.9740], [40.7290, -73.9730], [40.7200, -73.9740],
  [40.7110, -73.9780], [40.7080, -73.9990], [40.7050, -74.0020], [40.7010, -74.0100],
];

const BRONX = [
  [40.8800, -73.9150], [40.8720, -73.9030], [40.8620, -73.9080], [40.8480, -73.9190],
  [40.8330, -73.9250], [40.8180, -73.9270], [40.8070, -73.9250], [40.8030, -73.9180],
  [40.8000, -73.9100], [40.8050, -73.8950], [40.8050, -73.8800], [40.8100, -73.8700],
  [40.8150, -73.8600], [40.8800, -73.8600],
];

// Brooklyn + Queens (western Long Island), cropped at the map edge.
const LONG_ISLAND = [
  [40.7780, -73.8600], [40.7830, -73.8800], [40.7800, -73.9000], [40.7820, -73.9160],
  [40.7760, -73.9300], [40.7660, -73.9360], [40.7550, -73.9480], [40.7460, -73.9580],
  [40.7380, -73.9610], [40.7300, -73.9620], [40.7200, -73.9640], [40.7100, -73.9700],
  [40.7040, -73.9780], [40.7020, -73.9880], [40.7000, -73.9960], [40.6930, -74.0010],
  [40.6850, -74.0050], [40.6780, -74.0170], [40.6730, -74.0190], [40.6650, -74.0120],
  [40.6550, -74.0200], [40.6450, -74.0270], [40.6400, -74.0300], [40.6400, -73.8600],
];

const NEW_JERSEY = [
  [40.8800, -74.0700], [40.8800, -73.9350], [40.8650, -73.9520], [40.8500, -73.9660],
  [40.8300, -73.9800], [40.8100, -73.9950], [40.7900, -74.0080], [40.7700, -74.0170],
  [40.7550, -74.0230], [40.7450, -74.0240], [40.7350, -74.0270], [40.7250, -74.0310],
  [40.7150, -74.0340], [40.7080, -74.0360], [40.7000, -74.0400], [40.6900, -74.0480],
  [40.6800, -74.0500], [40.6700, -74.0600], [40.6600, -74.0700], [40.6400, -74.0700],
];

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
];

const AIRPORTS = [
  // LaGuardia
  [[40.7860, -73.8850], [40.7860, -73.8600], [40.7680, -73.8600], [40.7700, -73.8850]],
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
];

const BOROUGH_BASE = { manhattan: 3, bronx: 1.4, li: 1.2, nj: 1.2, island: 0 };

export function buildCity() {
  const n = COLS * ROWS;
  const type = new Uint8Array(n);
  const area = new Array(n).fill(null);
  const height = new Float32Array(n); // building height in levels, 0 = no building
  const street = new Uint8Array(n); // 1 = road tile in the street grid

  for (let row = 0; row < ROWS; row++) {
    for (let col = 0; col < COLS; col++) {
      const [lat, lng] = cellCenter(col, row);
      const i = row * COLS + col;
      if (pointInPoly(lat, lng, MANHATTAN)) { type[i] = T.LAND; area[i] = 'manhattan'; }
      else if (pointInPoly(lat, lng, BRONX)) { type[i] = T.LAND; area[i] = 'bronx'; }
      else if (pointInPoly(lat, lng, LONG_ISLAND)) { type[i] = T.LAND; area[i] = 'li'; }
      else if (pointInPoly(lat, lng, NEW_JERSEY)) { type[i] = T.LAND; area[i] = 'nj'; }
      else if (ISLANDS.some((p) => pointInPoly(lat, lng, p))) { type[i] = T.LAND; area[i] = 'island'; }
      if (type[i] === T.LAND) {
        if (PARKS.some((p) => pointInPoly(lat, lng, p))) type[i] = T.PARK;
        else if (AIRPORTS.some((p) => pointInPoly(lat, lng, p))) type[i] = T.AIRPORT;
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
export const LANDMARKS = [
  { id: 'wtc', name: 'One World Trade', lat: 40.7127, lng: -74.0134 },
  { id: 'esb', name: 'Empire State', lat: 40.7484, lng: -73.9857 },
  { id: 'chrysler', name: 'Chrysler Building', lat: 40.7516, lng: -73.9755 },
  { id: 'liberty', name: 'Statue of Liberty', lat: 40.6892, lng: -74.0445 },
  { id: 'yankee', name: 'Yankee Stadium', lat: 40.8296, lng: -73.9262 },
  { id: 'unisphere', name: 'Barclays Center', lat: 40.6826, lng: -73.9754 },
];

export const LABELS = [
  { text: 'MIDTOWN', lat: 40.7560, lng: -73.9860 },
  { text: 'DOWNTOWN', lat: 40.7140, lng: -74.0060 },
  { text: 'HARLEM', lat: 40.8110, lng: -73.9460 },
  { text: 'BROOKLYN', lat: 40.6780, lng: -73.9500 },
  { text: 'QUEENS', lat: 40.7550, lng: -73.9050 },
  { text: 'THE BRONX', lat: 40.8450, lng: -73.8950 },
  { text: 'JERSEY CITY', lat: 40.7250, lng: -74.0550 },
  { text: 'HUDSON RIVER', lat: 40.7900, lng: -74.0010, water: true },
  { text: 'EAST RIVER', lat: 40.7270, lng: -73.9680, water: true },
  { text: 'UPPER BAY', lat: 40.6650, lng: -74.0420, water: true },
];
