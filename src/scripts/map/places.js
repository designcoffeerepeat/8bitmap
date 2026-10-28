// More hand-built landmarks: the places people head to for events (stadiums, arenas, concert halls,
// museums, piers), plus City Hall, the airports and a few sights that help find your way around.
// Each one clears the generic buildings within `clear` tiles of its spot (like LANDMARKS in geo.js),
// is drawn by its `model` below and gets a name label once the map is zoomed in.
// `top` is the roof height above the ground where event pins on its tiles sit.

const GROUND_H = 0.35;
// Manhattan's street grid runs about 29 degrees off east-west. With rot = GRID a model's
// x axis runs along the streets and its z axis along the avenues.
const GRID = 0.5;

export const PLACES = [
  // ---- Lower Manhattan
  { id: 'cityhall', name: 'City Hall', lat: 40.7128, lng: -74.0060, clear: 0.5, top: 0.6, model: 'cityhall' },
  { id: 'castleclinton', name: 'Castle Clinton', lat: 40.7034, lng: -74.0168, clear: 0, top: 0.3, model: 'fort' },
  { id: 'whitehall', name: 'Staten Island Ferry', lat: 40.7012, lng: -74.0130, clear: 0.5, top: 0.6, model: 'terminal' },
  { id: 'seaport', name: 'Pier 17 / Seaport', lat: 40.7055, lng: -74.0015, clear: 0, top: 0.8, model: 'pier17' },
  { id: 'wsq', name: 'Washington Sq Arch', lat: 40.7312, lng: -73.9971, clear: 0, top: 0.1, model: 'arch' },
  { id: 'flatiron', name: 'Flatiron', lat: 40.7411, lng: -73.9897, clear: 0, model: 'flatiron' },
  { id: 'littleisland', name: 'Little Island', lat: 40.7421, lng: -74.0105, clear: 0, top: 0.6, model: 'littleisland' },
  // ---- Midtown and uptown
  { id: 'vessel', name: 'Hudson Yards / Vessel', lat: 40.7538, lng: -74.0021, clear: 1, top: 0.2, model: 'vessel' },
  // the High Line, a park on an old rail viaduct from Gansevoort St up to 34th St; it clears a
  // one-tile strip along its path
  { id: 'highline', name: 'High Line', lat: 40.7470, lng: -74.0050, model: 'highline', path: [
    [40.7397, -74.0083], [40.7420, -74.0077], [40.7462, -74.0056], [40.7503, -74.0034], [40.7527, -74.0024],
    [40.7535, -74.0047], [40.7545, -74.0070], [40.7570, -74.0060],
  ] },
  { id: 'javits', name: 'Javits Center', lat: 40.7577, lng: -74.0030, clear: 1, top: 1.2, model: 'javits' },
  { id: 'intrepid', name: 'Intrepid Museum', lat: 40.7646, lng: -74.0005, clear: 0, top: 0.7, model: 'carrier' },
  { id: 'grandcentral', name: 'Grand Central', lat: 40.7527, lng: -73.9772, clear: 0.5, top: 1, model: 'grandcentral' },
  { id: 'lincoln', name: 'Lincoln Center', lat: 40.7725, lng: -73.9835, clear: 1, top: 0.15, model: 'lincoln' },
  { id: 'met', name: 'The Met', lat: 40.7794, lng: -73.9632, clear: 0.5, top: 1, model: 'met' },
  { id: 'guggenheim', name: 'Guggenheim', lat: 40.7830, lng: -73.9590, clear: 0, model: 'guggenheim' },
  { id: 'apollo', name: 'Apollo Theater', lat: 40.8100, lng: -73.9500, clear: 0, top: 0.9, model: 'apollo' },
  // ---- Brooklyn
  { id: 'bkmuseum', name: 'Brooklyn Museum', lat: 40.6712, lng: -73.9636, clear: 0.5, top: 1, model: 'museum' },
  { id: 'cyclone', name: 'Cyclone / Luna Park', lat: 40.5762, lng: -73.9750, clear: 0.5, top: 0.15, model: 'cyclone' },
  // ---- Queens
  { id: 'ashe', name: 'US Open / Arthur Ashe', lat: 40.7499, lng: -73.8467, clear: 1, top: 0.15, model: 'tennis' },
  { id: 'foresthills', name: 'Forest Hills Stadium', lat: 40.7195, lng: -73.8476, clear: 0.5, top: 0.15, model: 'horseshoe' },
  { id: 'ubs', name: 'UBS Arena', lat: 40.7117, lng: -73.7258, clear: 0.5, top: 1.2, model: 'arena' },
  // ---- Bronx
  { id: 'nybg', name: 'NY Botanical Garden', lat: 40.8636, lng: -73.8792, clear: 0, top: 0.15, model: 'conservatory' },
  // ---- Staten Island
  { id: 'stgeorge', name: 'St. George Ferry', lat: 40.6437, lng: -74.0727, clear: 0.5, top: 0.6, model: 'terminal' },
  { id: 'siballpark', name: 'Staten Island Ballpark', lat: 40.6457, lng: -74.0768, clear: 0.5, top: 0.15, model: 'ballpark' },
  { id: 'ellis', name: 'Ellis Island', lat: 40.6992, lng: -74.0396, clear: 0, top: 0.9, model: 'ellis' },
  // ---- New Jersey
  { id: 'metlife', name: 'MetLife Stadium', lat: 40.8135, lng: -74.0745, clear: 3, top: 0.15, model: 'bowl' },
  { id: 'prudential', name: 'Prudential Center', lat: 40.7334, lng: -74.1711, clear: 0.5, top: 1.2, model: 'arena' },
  { id: 'redbull', name: 'Sports Illustrated Stadium', lat: 40.7368, lng: -74.1503, clear: 1, top: 0.15, model: 'soccer' },
  // ---- Airports
  // airports are drawn at scale x across and y up, since the terminals are huge
  { id: 'jfk', name: 'JFK Airport', lat: 40.6440, lng: -73.7830, model: 'jfk', scale: [2.6, 1.3] },
  { id: 'lga', name: 'LaGuardia Airport', lat: 40.7740, lng: -73.8720, model: 'lga', scale: [1.8, 1.2] },
  { id: 'ewr', name: 'Newark Airport', lat: 40.6900, lng: -74.1770, model: 'ewr', scale: [2, 1.2] },
];

// Names for the existing landmarks in geo.js (LANDMARKS) and big parks, shown with the places.
export const MORE_LABELS = [
  { name: 'Yankee Stadium', lat: 40.8296, lng: -73.9262 },
  { name: 'Citi Field', lat: 40.7571, lng: -73.8458 },
  { name: 'Barclays Center', lat: 40.6826, lng: -73.9754 },
  { name: 'Madison Square Garden', lat: 40.7505, lng: -73.9935 },
  { name: 'Statue of Liberty', lat: 40.6892, lng: -74.0445 },
  { name: 'Unisphere', lat: 40.7465, lng: -73.8449 },
  { name: 'Wonder Wheel', lat: 40.5741, lng: -73.9781 },
  { name: 'Battery Park', lat: 40.7033, lng: -74.0155 },
  { name: 'Governors Island', lat: 40.6895, lng: -74.0168 },
];

export const PARK_LABELS = [
  { name: 'Central Park', lat: 40.7812, lng: -73.9665 },
  { name: 'Prospect Park', lat: 40.6602, lng: -73.9690 },
  { name: 'Flushing Meadows', lat: 40.7400, lng: -73.8405 },
  { name: 'Pelham Bay Park', lat: 40.8650, lng: -73.8100 },
  { name: 'Van Cortlandt Park', lat: 40.8970, lng: -73.8850 },
  { name: 'Bronx Park', lat: 40.8560, lng: -73.8770 },
  { name: 'Forest Park', lat: 40.7020, lng: -73.8550 },
  { name: 'Marine Park', lat: 40.5990, lng: -73.9230 },
  { name: 'Freshkills Park', lat: 40.5800, lng: -74.1850 },
  { name: 'Greenbelt', lat: 40.5900, lng: -74.1350 },
  { name: 'Liberty State Park', lat: 40.7000, lng: -74.0530 },
  { name: 'Randall\'s Island', lat: 40.7930, lng: -73.9210 },
  { name: 'Riis Beach', lat: 40.5660, lng: -73.8750 },
  { name: 'Alley Pond Park', lat: 40.7480, lng: -73.7440 },
];

// Highway names, along each road where it is easy to see.
export const ROAD_LABELS = [
  { name: 'FDR Dr', lat: 40.7600, lng: -73.9575 },
  { name: 'West Side Hwy', lat: 40.7380, lng: -74.0110 },
  { name: 'Henry Hudson Pkwy', lat: 40.8350, lng: -73.9520 },
  { name: 'Harlem River Dr', lat: 40.8240, lng: -73.9320 },
  { name: 'BQE', lat: 40.6990, lng: -73.9580 },
  { name: 'Gowanus Expy', lat: 40.6600, lng: -74.0050 },
  { name: 'LIE', lat: 40.7380, lng: -73.8700 },
  { name: 'Grand Central Pkwy', lat: 40.7240, lng: -73.8100 },
  { name: 'Van Wyck Expy', lat: 40.6950, lng: -73.8170 },
  { name: 'Belt Pkwy', lat: 40.6120, lng: -74.0330 },
  { name: 'Belt Pkwy', lat: 40.6510, lng: -73.8650 },
  { name: 'Cross Bronx Expy', lat: 40.8400, lng: -73.8850 },
  { name: 'Major Deegan Expy', lat: 40.8550, lng: -73.9200 },
  { name: 'Bruckner Expy', lat: 40.8160, lng: -73.8850 },
  { name: 'Staten Island Expy', lat: 40.6080, lng: -74.1250 },
  { name: 'Cross Island Pkwy', lat: 40.7700, lng: -73.7730 },
  { name: 'Jackie Robinson Pkwy', lat: 40.6890, lng: -73.8700 },
  { name: 'Hutchinson River Pkwy', lat: 40.8550, lng: -73.8330 },
];

// ---------------------------------------------------------------------------
// models: each pushes boxes [x, y, z, width, height, depth, colour, turn] onto parts

// a point dx, dz from the centre p in the model's own axes turned by rot (the way three.js turns a mesh)
function off(p, rot, dx, dz) {
  const c = Math.cos(rot);
  const s = Math.sin(rot);
  return [p.x + dx * c + dz * s, p.z - dx * s + dz * c];
}

function box(parts, p, rot, dx, y, dz, sx, sy, sz, hex) {
  const [x, z] = off(p, rot, dx, dz);
  parts.push([x, y, z, sx, sy, sz, hex, rot]);
}

// a round wall of n blocks, radius r, from height y up h; skip leaves an opening (in blocks) facing +x
function ring(parts, p, r, n, y, h, thick, hex, skip = 0, rot = 0) {
  for (let k = 0; k < n; k++) {
    if (skip && (k < skip / 2 || k >= n - skip / 2)) continue;
    const a = (k / n) * Math.PI * 2 + rot;
    const w = ((Math.PI * 2 * r) / n) * 1.05;
    parts.push([p.x + Math.cos(a) * r, y, p.z - Math.sin(a) * r, thick, h, w, hex, a]);
  }
}

// a filled pixel circle (or ellipse with rz) of strips
function disc(parts, p, r, y, h, hex, rz = r) {
  const n = Math.max(3, Math.round(rz * 4));
  for (let k = -n + 0.5; k < n; k++) {
    const dz = (k / n) * rz;
    const w = 2 * r * Math.sqrt(Math.max(0, 1 - (dz / rz) ** 2));
    if (w > 0.05) parts.push([p.x, y, p.z + dz, w, h, (rz / n) + 0.01, hex, 0]);
  }
}

function plane(parts, p, rot, dx, dz, heading) {
  // a parked jet: fuselage, wings and tail, nose along its own x axis
  const [x, z] = off(p, rot, dx, dz);
  const q = { x, z };
  const r = rot + heading;
  const y = GROUND_H;
  box(parts, q, r, 0, y + 0.08, 0, 0.9, 0.16, 0.16, '#f4f6fb');
  box(parts, q, r, 0.05, y + 0.12, 0, 0.22, 0.04, 0.9, '#dfe5f0');
  box(parts, q, r, -0.38, y + 0.2, 0, 0.14, 0.24, 0.05, '#4f6bff');
  box(parts, q, r, -0.38, y + 0.18, 0, 0.12, 0.03, 0.34, '#dfe5f0');
}

function stands(parts, p, rot, w, d, h, field, stand, roof) {
  box(parts, p, rot, 0, GROUND_H, 0, w - 0.3, 0.12, d - 0.3, field);
  for (const [dx, dz, sx, sz] of [[0, -d / 2, w, 0.35], [0, d / 2, w, 0.35], [-w / 2, 0, 0.35, d], [w / 2, 0, 0.35, d]]) {
    box(parts, p, rot, dx, GROUND_H, dz, sx, h, sz, stand);
    if (roof) box(parts, p, rot, dx * 1.02, GROUND_H + h, dz * 1.02, sx * 1.02, 0.1, sz * 1.02, roof);
  }
}

const MODELS = {
  cityhall(parts, p) {
    const rot = 0.2;
    box(parts, p, rot, 0, GROUND_H, 0, 1.5, 0.55, 0.6, '#f1ede3'); // wings
    box(parts, p, rot, -0.65, GROUND_H, 0.2, 0.3, 0.55, 0.5, '#e8e2d4');
    box(parts, p, rot, 0.65, GROUND_H, 0.2, 0.3, 0.55, 0.5, '#e8e2d4');
    box(parts, p, rot, 0, GROUND_H + 0.55, 0, 1.5, 0.06, 0.6, '#cfc8b8');
    box(parts, p, rot, 0, GROUND_H + 0.6, 0, 0.3, 0.3, 0.3, '#f7f4ec'); // cupola
    box(parts, p, rot, 0, GROUND_H + 0.9, 0, 0.18, 0.2, 0.18, '#7fa6c9');
    box(parts, p, rot, 0, GROUND_H + 1.1, 0, 0.04, 0.2, 0.04, '#ffd23f');
  },
  fort(parts, p) {
    ring(parts, p, 0.45, 12, GROUND_H, 0.3, 0.14, '#b77a5a');
    disc(parts, p, 0.35, GROUND_H, 0.05, '#7c9a6a');
  },
  terminal(parts, p) {
    const rot = 0.6;
    box(parts, p, rot, 0, 0, 0, 1.4, GROUND_H + 0.45, 0.9, '#d6dbe6');
    box(parts, p, rot, 0, GROUND_H + 0.45, 0, 1.2, 0.12, 0.75, '#ff8a1f');
    box(parts, p, rot, 0.75, 0, 0, 0.3, GROUND_H, 1, '#8c8fa3'); // slip
  },
  pier17(parts, p) {
    const rot = GRID + 0.1;
    box(parts, p, rot, 0, 0, 0, 1.6, GROUND_H, 1.1, '#a99a86'); // the pier deck
    box(parts, p, rot, 0, GROUND_H, 0, 1.2, 0.5, 0.8, '#9fcdea'); // glass box
    box(parts, p, rot, 0, GROUND_H + 0.5, 0, 1.3, 0.08, 0.9, '#5bbd5b'); // rooftop venue lawn
    box(parts, p, rot, 0.4, GROUND_H + 0.58, 0, 0.35, 0.2, 0.4, '#f2f2f2'); // stage
    // the tall ship Wavertree moored beside it
    const [x, z] = off(p, rot, -1.1, 0.9);
    const s = { x, z };
    box(parts, s, rot, 0, 0, 0, 1.3, 0.3, 0.28, '#3a2d2a');
    for (const m of [-0.4, 0, 0.4]) {
      box(parts, s, rot, m, 0.3, 0, 0.05, 1.3, 0.05, '#6b4b3a');
      box(parts, s, rot, m, 0.9, 0, 0.04, 0.04, 0.5, '#6b4b3a');
    }
  },
  arch(parts, p) {
    const rot = GRID;
    box(parts, p, rot, 0, GROUND_H, 0, 0.9, 0.06, 0.9, '#c9c2b2'); // the square's paving
    box(parts, p, rot, -0.18, GROUND_H, 0, 0.12, 0.6, 0.18, '#f4f1ea');
    box(parts, p, rot, 0.18, GROUND_H, 0, 0.12, 0.6, 0.18, '#f4f1ea');
    box(parts, p, rot, 0, GROUND_H + 0.6, 0, 0.5, 0.2, 0.18, '#f4f1ea');
    disc(parts, { x: off(p, rot, 0, 0.32)[0], z: off(p, rot, 0, 0.32)[1] }, 0.12, GROUND_H, 0.08, '#9fe3ff'); // fountain
  },
  flatiron(parts, p) {
    // a wedge: blocks narrowing to the point at 23rd St
    const rot = GRID + 0.35;
    for (let k = 0; k < 5; k++) box(parts, p, rot, 0, GROUND_H, -0.4 + k * 0.17, 0.75 - k * 0.15, 3.2, 0.18, '#e3d6bd');
    box(parts, p, rot, 0, GROUND_H + 3.2, 0, 0.8, 0.12, 0.85, '#cdbf9f');
  },
  littleisland(parts, p) {
    // tulip pots standing in the Hudson, a green park on top
    for (let k = 0; k < 9; k++) {
      const [x, z] = off(p, 0, ((k % 3) - 1) * 0.35, (Math.floor(k / 3) - 1) * 0.35);
      parts.push([x, 0, z, 0.14, 0.35 + (k % 2) * 0.1, 0.14, '#cfc8bc', 0]);
    }
    disc(parts, p, 0.6, 0.45, 0.15, '#cfc8bc');
    disc(parts, p, 0.55, 0.6, 0.06, '#5bbd5b');
    box(parts, p, 0, 0.25, 0.66, -0.2, 0.2, 0.2, 0.2, '#2f8f4e');
    box(parts, p, 0, -0.2, 0.66, 0.15, 0.18, 0.24, 0.18, '#3aa35a');
  },
  vessel(parts, p) {
    // a copper honeycomb that widens as it climbs, on the Hudson Yards plaza
    disc(parts, p, 1, GROUND_H, 0.06, '#c9c2b2');
    for (let k = 0; k < 8; k++) {
      const s = 0.4 + k * 0.1;
      parts.push([p.x, GROUND_H + 0.06 + k * 0.22, p.z, s, 0.22, s, k % 2 ? '#d8844f' : '#b8693f', (k % 2) * 0.785]);
    }
  },
  highline(parts, p, pl, toWorld) {
    // a green deck on a rusty viaduct, with planting along it
    const pts = pl.path.map(([lat, lng]) => toWorld(lat, lng));
    const y = GROUND_H + 0.55;
    for (let k = 0; k < pts.length - 1; k++) {
      const a = pts[k];
      const b = pts[k + 1];
      const len = Math.hypot(b.x - a.x, b.z - a.z);
      const rot = Math.atan2(-(b.z - a.z), b.x - a.x);
      const mid = { x: (a.x + b.x) / 2, z: (a.z + b.z) / 2 };
      box(parts, mid, rot, 0, y, 0, len + 0.3, 0.12, 0.42, '#6d5a4e');
      box(parts, mid, rot, 0, y + 0.12, 0, len + 0.3, 0.04, 0.32, '#7ec26a');
      for (let t = -len / 2; t <= len / 2; t += 0.8) {
        box(parts, mid, rot, t, GROUND_H, 0, 0.1, 0.55, 0.36, '#5a4a40');
        box(parts, mid, rot, t + 0.4, y + 0.16, 0.08, 0.14, 0.14, 0.14, '#2f8f4e');
      }
    }
  },
  javits(parts, p) {
    const rot = GRID;
    box(parts, p, rot, 0, GROUND_H, 0, 1.2, 1.1, 3, '#8fb8e8');
    for (let k = -1.3; k <= 1.31; k += 0.65) box(parts, p, rot, 0, GROUND_H + 1.1, k, 1.25, 0.12, 0.08, '#c5d6f2');
    box(parts, p, rot, 0, GROUND_H + 1.1, 0, 1.0, 0.08, 2.8, '#7fa38c'); // green roof
  },
  carrier(parts, p) {
    const rot = GRID;
    box(parts, p, rot, -0.2, 0, 0, 2.2, 0.55, 0.55, '#7c808f');
    box(parts, p, rot, -0.2, 0.55, 0, 2.4, 0.08, 0.7, '#5a5d72'); // flight deck
    box(parts, p, rot, 0, 0.63, 0.25, 0.25, 0.45, 0.14, '#7c808f'); // island
    box(parts, p, rot, -0.8, 0.63, -0.1, 0.3, 0.06, 0.08, '#e8eef9'); // a plane on deck
    box(parts, p, rot, -0.8, 0.63, -0.1, 0.08, 0.06, 0.26, '#e8eef9');
    box(parts, p, rot, 1.1, 0, 0, 0.6, GROUND_H, 0.9, '#a99a86'); // Pier 86
  },
  grandcentral(parts, p) {
    const rot = GRID;
    box(parts, p, rot, 0, GROUND_H, 0, 1.4, 0.8, 0.9, '#e3d6bd');
    box(parts, p, rot, 0, GROUND_H + 0.8, 0, 1.2, 0.18, 0.7, '#7fa38c'); // copper roof
    box(parts, p, rot, 0, GROUND_H + 0.4, 0.47, 0.25, 0.25, 0.04, '#ffd23f'); // the clock
  },
  lincoln(parts, p) {
    const rot = GRID;
    box(parts, p, rot, 0, GROUND_H, 0, 2.2, 0.08, 1.8, '#d8d3c8'); // plaza
    disc(parts, p, 0.22, GROUND_H + 0.08, 0.08, '#9fe3ff'); // the fountain
    box(parts, p, rot, 0, GROUND_H, -0.65, 0.9, 1.1, 0.5, '#f1ede3'); // the Met Opera
    for (let k = -3; k <= 3; k++) box(parts, p, rot, k * 0.12, GROUND_H, -0.39, 0.05, 1.0, 0.04, '#ffd23f'); // its arches lit up
    box(parts, p, rot, -0.75, GROUND_H, 0.2, 0.5, 0.8, 0.8, '#e6e2db'); // David Geffen Hall
    box(parts, p, rot, 0.75, GROUND_H, 0.2, 0.5, 0.8, 0.8, '#e6e2db'); // David H. Koch Theater
  },
  met(parts, p) {
    const rot = GRID;
    box(parts, p, rot, 0, GROUND_H, 0, 0.9, 0.7, 2.2, '#ebe1cc');
    box(parts, p, rot, 0.5, GROUND_H, 0, 0.12, 0.5, 0.8, '#f4ecdc'); // Fifth Ave facade
    for (let k = -3; k <= 3; k++) box(parts, p, rot, 0.57, GROUND_H, k * 0.11, 0.04, 0.5, 0.04, '#cfc4ad');
    box(parts, p, rot, -0.1, GROUND_H + 0.7, 0.6, 0.5, 0.08, 0.6, '#9fcdea'); // glass roof
  },
  guggenheim(parts, p) {
    // the white spiral: rings widening as they go up
    for (let k = 0; k < 4; k++) disc(parts, p, 0.32 + k * 0.06, GROUND_H + k * 0.22, 0.2, k % 2 ? '#f7f5ef' : '#e8e4da');
    disc(parts, p, 0.3, GROUND_H + 0.88, 0.06, '#9fcdea');
  },
  apollo(parts, p) {
    const rot = GRID;
    box(parts, p, rot, 0, GROUND_H, 0, 0.6, 0.9, 0.6, '#c45a4a');
    box(parts, p, rot, 0, GROUND_H + 0.45, 0.33, 0.08, 0.35, 0.08, '#ff5c8a'); // the vertical sign
    box(parts, p, rot, 0, GROUND_H + 0.3, 0.36, 0.5, 0.1, 0.1, '#ffd23f'); // marquee
  },
  museum(parts, p) {
    box(parts, p, 0, 0, GROUND_H, 0, 1.6, 0.7, 0.9, '#ebe1cc');
    box(parts, p, 0, 0, GROUND_H + 0.7, 0, 0.5, 0.25, 0.5, '#d8cfbd'); // dome base
    disc(parts, { x: p.x, z: p.z }, 0.2, GROUND_H + 0.95, 0.12, '#cfc4ad');
    for (let k = -3; k <= 3; k++) box(parts, p, 0, k * 0.12, GROUND_H, 0.47, 0.05, 0.6, 0.05, '#f4ecdc'); // columns
  },
  cyclone(parts, p) {
    // the wooden coaster: a white lattice of humps, a red train on top
    const rot = 0.3;
    const hump = [0.4, 1.2, 0.7, 0.9, 0.5, 0.75, 0.4];
    hump.forEach((h, k) => {
      for (const side of [-0.3, 0.3]) box(parts, p, rot, -0.75 + k * 0.25, GROUND_H, side, 0.06, h, 0.06, '#f2f2f2');
      box(parts, p, rot, -0.75 + k * 0.25, GROUND_H + h, 0, 0.27, 0.06, 0.66, '#e8e2d4');
    });
    box(parts, p, rot, -0.25, GROUND_H + 1.26, 0.2, 0.25, 0.1, 0.12, '#d94a3a');
  },
  tennis(parts, p) {
    // Arthur Ashe Stadium and the courts around it
    disc(parts, p, 1.0, GROUND_H, 0.1, '#4a6fb5');
    disc(parts, p, 0.45, GROUND_H + 0.1, 0.02, '#4f6bff');
    box(parts, p, 0, 0, GROUND_H + 0.12, 0, 0.36, 0.02, 0.18, '#7ec26a'); // court surround
    ring(parts, p, 0.8, 24, GROUND_H, 0.6, 0.35, '#e8e8ee');
    ring(parts, p, 0.98, 24, GROUND_H + 0.6, 0.12, 0.12, '#c9d2e3'); // roof rim
    // Louis Armstrong Stadium to the south and outer courts
    const la = { x: p.x + 0.4, z: p.z + 1.4 };
    disc(parts, la, 0.4, GROUND_H, 0.05, '#4f6bff');
    ring(parts, la, 0.45, 14, GROUND_H, 0.35, 0.18, '#e8e8ee');
    for (let k = 0; k < 4; k++) box(parts, p, 0, -1.4 + k * 0.4, GROUND_H, 1.3, 0.3, 0.04, 0.5, '#4f6bff');
  },
  horseshoe(parts, p) {
    // Forest Hills Stadium: a concrete horseshoe opening to the stage
    disc(parts, p, 0.55, GROUND_H, 0.08, '#7ec26a');
    ring(parts, p, 0.6, 16, GROUND_H, 0.45, 0.25, '#e6e2db', 5);
    box(parts, p, 0, 0.55, GROUND_H, 0, 0.3, 0.5, 0.7, '#4a4d63'); // the stage
    box(parts, p, 0, 0.55, GROUND_H + 0.5, 0, 0.36, 0.06, 0.8, '#ff5c8a');
  },
  arena(parts, p) {
    disc(parts, p, 0.85, GROUND_H, 0.9, '#5a5d72', 0.7);
    disc(parts, p, 0.75, GROUND_H + 0.9, 0.15, '#9fa3b8', 0.6);
    ring(parts, p, 0.8, 20, GROUND_H + 0.45, 0.12, 0.05, '#4dd2ff');
  },
  conservatory(parts, p) {
    // the Enid A. Haupt Conservatory: a glass house with a dome
    box(parts, p, 0, 0, GROUND_H, 0, 1.4, 0.35, 0.3, '#c5e6f2');
    box(parts, p, 0, -0.55, GROUND_H, 0.35, 0.3, 0.35, 0.5, '#c5e6f2');
    box(parts, p, 0, 0.55, GROUND_H, 0.35, 0.3, 0.35, 0.5, '#c5e6f2');
    disc(parts, p, 0.3, GROUND_H + 0.35, 0.2, '#d9f1f8');
    disc(parts, p, 0.18, GROUND_H + 0.55, 0.12, '#e8f7fb');
  },
  ballpark(parts, p) {
    const rot = 0.785;
    box(parts, p, rot, 0, GROUND_H, 0, 1.2, 0.08, 1.2, '#5bbd5b');
    box(parts, p, rot, -0.25, GROUND_H + 0.08, -0.25, 0.45, 0.02, 0.45, '#c98f5a'); // infield
    box(parts, p, rot, -0.25, GROUND_H + 0.1, -0.25, 0.25, 0.02, 0.25, '#5bbd5b');
    box(parts, p, rot, -0.65, GROUND_H, 0, 0.2, 0.4, 1.2, '#e8e8ee'); // stands behind home
    box(parts, p, rot, 0, GROUND_H, -0.65, 1.2, 0.4, 0.2, '#e8e8ee');
  },
  ellis(parts, p) {
    box(parts, p, 0, 0, GROUND_H, 0, 1.0, 0.55, 0.5, '#b8624a');
    box(parts, p, 0, 0, GROUND_H + 0.55, 0, 1.0, 0.12, 0.5, '#e3d6bd');
    for (const dx of [-0.45, 0.45]) for (const dz of [-0.2, 0.2]) {
      box(parts, p, 0, dx, GROUND_H + 0.55, dz, 0.1, 0.35, 0.1, '#e3d6bd');
      box(parts, p, 0, dx, GROUND_H + 0.9, dz, 0.06, 0.1, 0.06, '#7fa38c');
    }
  },
  bowl(parts, p) {
    // MetLife Stadium: a big silver bowl around a football field, in its sea of parking
    box(parts, p, 0.3, 0, GROUND_H, 0, 6.5, 0.03, 6, '#a8a9b3');
    for (let k = -2.5; k <= 2.5; k += 1) box(parts, p, 0.3, k, GROUND_H + 0.03, 0, 0.05, 0.01, 5.6, '#e8e8ee');
    stands(parts, p, 0.3, 3.0, 2.2, 0.9, '#5bbd5b', '#c9ccd6', '#8c8fa3');
    box(parts, p, 0.3, 0, GROUND_H + 0.12, 0, 1.6, 0.02, 0.05, '#ffffff');
  },
  soccer(parts, p) {
    stands(parts, p, 0.2, 1.8, 1.3, 0.6, '#5bbd5b', '#c9ccd6', '#d94a3a');
  },
  jfk(parts, p) {
    // terminals in a ring around the middle, the control tower and planes at the gates
    const terms = [[-0.9, -0.2, 1.2, 0.5], [1.1, 0.4, 1.4, 0.5], [0.3, -1.2, 1.0, 0.45], [-1.7, 0.9, 0.9, 0.45], [1.6, -1.0, 0.8, 0.4]];
    for (const [dx, dz, w, d] of terms) {
      box(parts, p, 0.5, dx, GROUND_H, dz, w, 0.4, d, '#c5d6f2');
      box(parts, p, 0.5, dx, GROUND_H + 0.4, dz, w, 0.06, d, '#8fb8e8');
    }
    box(parts, p, 0, 0, GROUND_H, 0.4, 0.2, 1.4, 0.2, '#e8eef9'); // tower
    box(parts, p, 0, 0, GROUND_H + 1.4, 0.4, 0.4, 0.22, 0.4, '#4a6fb5');
    box(parts, p, 0, 0, GROUND_H + 1.62, 0.4, 0.3, 0.06, 0.3, '#e8eef9');
    plane(parts, p, 0.5, -0.9, 0.5, 1.57);
    plane(parts, p, 0.5, 1.1, -0.3, -1.57);
    plane(parts, p, 0.5, 0.3, -0.5, 0);
  },
  lga(parts, p) {
    const terms = [[0, 0, 1.6, 0.6], [1.8, 0.6, 1.2, 0.5]];
    for (const [dx, dz, w, d] of terms) {
      box(parts, p, 0.2, dx, GROUND_H, dz, w, 0.45, d, '#c5d6f2');
      box(parts, p, 0.2, dx, GROUND_H + 0.45, dz, w * 0.9, 0.1, d * 0.6, '#ffffff');
    }
    box(parts, p, 0, -1.0, GROUND_H, -0.5, 0.18, 1.2, 0.18, '#e8eef9');
    box(parts, p, 0, -1.0, GROUND_H + 1.2, -0.5, 0.36, 0.2, 0.36, '#4a6fb5');
    plane(parts, p, 0.2, 0.2, -0.75, 1.57);
    plane(parts, p, 0.2, 1.9, -0.2, 1.57);
  },
  ewr(parts, p) {
    for (const [dx, dz] of [[0, -0.9], [0, 0], [0, 0.9]]) box(parts, p, 0.35, dx, GROUND_H, dz, 0.7, 0.4, 0.6, '#c5d6f2');
    box(parts, p, 0, 0.9, GROUND_H, -0.3, 0.18, 1.1, 0.18, '#e8eef9');
    box(parts, p, 0, 0.9, GROUND_H + 1.1, -0.3, 0.34, 0.2, 0.34, '#4a6fb5');
    plane(parts, p, 0.35, -0.7, 0.4, 0);
  },
};

// Boxes for every place; latLngToWorld turns a place's spot into world space.
export function buildPlaceParts(latLngToWorld) {
  const parts = [];
  for (const pl of PLACES) {
    const model = MODELS[pl.model];
    if (!model) continue;
    const p = latLngToWorld(pl.lat, pl.lng);
    const from = parts.length;
    model(parts, p, pl, latLngToWorld);
    if (pl.scale) {
      const [k, ky] = pl.scale;
      for (let i = from; i < parts.length; i++) {
        const b = parts[i];
        b[0] = p.x + (b[0] - p.x) * k;
        b[2] = p.z + (b[2] - p.z) * k;
        b[1] = b[1] <= GROUND_H ? b[1] : GROUND_H + (b[1] - GROUND_H) * ky;
        b[3] *= k; b[4] *= ky; b[5] *= k;
      }
    }
  }
  return parts;
}

// The tiles the High Line and other paths keep clear, as clearedTiles() areas (see geo.js).
export function pathAreas(pl) {
  return pl.path.slice(1).map(([lat, lng], k) => ({ lat: pl.path[k][0], lng: pl.path[k][1], to: [lat, lng], clear: 0 }));
}
