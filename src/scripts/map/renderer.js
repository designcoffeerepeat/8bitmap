// three.js voxel renderer for the 8-bit NYC map.
// The scene is drawn into a small canvas and scaled up with nearest-neighbour
// filtering, which is what gives it the chunky pixel look.

import * as THREE from 'three';
import { MapControls } from 'three/addons/controls/MapControls.js';
import {
  COLS, ROWS, T, BRIDGES, LANDMARKS, LABELS, buildCity, latLngToWorld, latLngToCell, rng,
} from './geo.js';
import { PALETTE, CATEGORY_COLORS } from './palette.js';

const GROUND_H = 0.35;
const LEVEL_H = 0.4;
const VIEW_HEIGHT = 70; // world units visible top to bottom at zoom 1
const HOME = { lat: 40.738, lng: -73.975, zoom: 1.15 };
const REDUCED_MOTION = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

const color = (hex) => new THREE.Color(hex);
const pick = (arr, r) => arr[Math.floor(r * arr.length) % arr.length];

export function createMap(container, opts = {}) {
  let pixelSize = opts.pixelSize ?? 2;
  const listeners = { select: [], hover: [] };
  const emit = (name, payload) => listeners[name].forEach((fn) => fn(payload));

  const canvas = document.createElement('canvas');
  canvas.className = 'map-canvas';
  canvas.setAttribute('aria-label', 'Interactive pixel map of New York City');
  container.appendChild(canvas);

  const renderer = new THREE.WebGLRenderer({ canvas, antialias: false, preserveDrawingBuffer: true });
  renderer.setPixelRatio(1);
  renderer.outputColorSpace = THREE.SRGBColorSpace;

  const scene = new THREE.Scene();
  scene.background = color(PALETTE.sky);

  const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, -500, 1000);
  const controls = new MapControls(camera, canvas);
  controls.enableDamping = !REDUCED_MOTION;
  controls.dampingFactor = 0.12;
  controls.screenSpacePanning = false;
  controls.minZoom = 0.7;
  controls.maxZoom = 7;
  controls.minPolarAngle = 0.45;
  controls.maxPolarAngle = 1.1;
  controls.zoomToCursor = true;

  scene.add(new THREE.HemisphereLight(0xffffff, 0x8a7a9a, 1.6));
  const sun = new THREE.DirectionalLight(0xffffff, 1.9);
  sun.position.set(-60, 120, 80);
  scene.add(sun);

  const city = buildCity();
  const world = new THREE.Group();
  scene.add(world);

  // Landmark tiles get hand-built models instead of generic blocks.
  const landmarkCells = new Set();
  for (const l of LANDMARKS) {
    const { col, row } = latLngToCell(l.lat, l.lng);
    landmarkCells.add(Math.floor(row) * COLS + Math.floor(col));
  }

  buildBase(world);
  const waterFrames = buildWater(world, city);
  buildLand(world, city);
  buildBuildings(world, city, landmarkCells);
  buildBridges(world);
  buildLandmarks(world, city);
  const boats = buildBoats(world);
  const labelSprites = buildLabels(world);

  // ---- pins -------------------------------------------------------------
  const pinGroup = new THREE.Group();
  world.add(pinGroup);
  let pins = []; // { sprite, event, baseY, phase }
  let hovered = null;
  let selected = null;
  const pinTextures = new Map();

  function pinTexture(category, state) {
    const key = `${category}:${state}`;
    if (!pinTextures.has(key)) pinTextures.set(key, makePinTexture(CATEGORY_COLORS[category] ?? '#ffffff', state));
    return pinTextures.get(key);
  }

  function setEvents(events) {
    pinGroup.clear();
    pins = [];
    const used = new Map();
    for (const ev of events) {
      const p = latLngToWorld(ev.venue.lat, ev.venue.lng);
      const cellKey = `${Math.floor(p.x)},${Math.floor(p.z)}`;
      const n = used.get(cellKey) ?? 0;
      used.set(cellKey, n + 1);
      // fan out events that land on the same tile
      const ox = n ? Math.cos(n * 2.1) * 0.9 : 0;
      const oz = n ? Math.sin(n * 2.1) * 0.9 : 0;
      const baseY = groundTop(city, ev.venue.lat, ev.venue.lng) + 0.2;
      const mat = new THREE.SpriteMaterial({ map: pinTexture(ev.category, 'idle'), depthTest: false, transparent: true });
      const sprite = new THREE.Sprite(mat);
      sprite.center.set(0.5, 0);
      sprite.position.set(p.x + ox, baseY, p.z + oz);
      sprite.renderOrder = 10;
      sprite.userData.eventId = ev.id;
      pinGroup.add(sprite);
      pins.push({ sprite, event: ev, baseY, phase: Math.random() * Math.PI * 2 });
    }
    refreshPinStates();
    updateSpriteScales();
  }

  function refreshPinStates() {
    for (const pin of pins) {
      const state = pin.event.id === selected ? 'selected' : pin.event.id === hovered ? 'hover' : 'idle';
      pin.sprite.material.map = pinTexture(pin.event.category, state);
      pin.sprite.renderOrder = state === 'idle' ? 10 : 20;
    }
  }

  function setVisible(ids) {
    const set = ids ? new Set(ids) : null;
    for (const pin of pins) pin.sprite.visible = !set || set.has(pin.event.id);
  }

  // ---- sizing ------------------------------------------------------------
  let rw = 1;
  let rh = 1;
  function resize() {
    const w = container.clientWidth || 1;
    const h = container.clientHeight || 1;
    rw = Math.max(1, Math.ceil(w / pixelSize));
    rh = Math.max(1, Math.ceil(h / pixelSize));
    renderer.setSize(rw, rh, false);
    const aspect = w / h;
    camera.left = (-VIEW_HEIGHT * aspect) / 2;
    camera.right = (VIEW_HEIGHT * aspect) / 2;
    camera.top = VIEW_HEIGHT / 2;
    camera.bottom = -VIEW_HEIGHT / 2;
    camera.updateProjectionMatrix();
    updateSpriteScales();
  }

  // Sprites are sized in render pixels so they stay crisp at every zoom.
  function worldPerPixel() {
    return VIEW_HEIGHT / camera.zoom / rh;
  }
  function updateSpriteScales() {
    const wpp = worldPerPixel();
    for (const pin of pins) {
      const img = pin.sprite.material.map.image;
      pin.sprite.scale.set(img.width * wpp, img.height * wpp, 1);
    }
    for (const s of labelSprites) {
      const img = s.material.map.image;
      s.scale.set(img.width * wpp, img.height * wpp, 1);
      s.visible = camera.zoom >= s.userData.minZoom && camera.zoom <= s.userData.maxZoom;
    }
  }

  // ---- camera moves ----------------------------------------------------------
  const camOffset = new THREE.Vector3(-1, 1.25, 1.15).normalize().multiplyScalar(220);
  function home(animate = true) {
    const p = latLngToWorld(HOME.lat, HOME.lng);
    flyTo(new THREE.Vector3(p.x, 0, p.z), HOME.zoom, animate, camOffset.clone());
  }

  let flight = null;
  function flyTo(target, zoom, animate = true, offset = null) {
    const off = offset ?? camera.position.clone().sub(controls.target);
    if (!animate || REDUCED_MOTION) {
      controls.target.copy(target);
      camera.position.copy(target).add(off);
      camera.zoom = zoom;
      camera.updateProjectionMatrix();
      controls.update();
      updateSpriteScales();
      return;
    }
    flight = {
      t: 0,
      fromTarget: controls.target.clone(),
      toTarget: target,
      fromOff: camera.position.clone().sub(controls.target),
      toOff: off,
      fromZoom: camera.zoom,
      toZoom: zoom,
    };
  }

  function focusEvent(id, zoom) {
    const pin = pins.find((p) => p.event.id === id);
    if (!pin) return;
    const target = new THREE.Vector3(pin.sprite.position.x, 0, pin.sprite.position.z);
    flyTo(target, Math.max(camera.zoom, zoom ?? 2.6));
  }

  function select(id) {
    selected = id;
    refreshPinStates();
  }
  function highlight(id) {
    hovered = id;
    refreshPinStates();
  }

  function zoomBy(factor) {
    flyTo(controls.target.clone(), THREE.MathUtils.clamp(camera.zoom * factor, controls.minZoom, controls.maxZoom));
  }
  function rotateBy(rad) {
    const off = camera.position.clone().sub(controls.target);
    off.applyAxisAngle(new THREE.Vector3(0, 1, 0), rad);
    flyTo(controls.target.clone(), camera.zoom, true, off);
  }

  function setPixelSize(n) {
    pixelSize = n;
    resize();
  }

  // ---- pointer ----------------------------------------------------------------
  const raycaster = new THREE.Raycaster();
  const ndc = new THREE.Vector2();
  let downAt = null;

  function pinAt(ev) {
    const rect = canvas.getBoundingClientRect();
    ndc.set(((ev.clientX - rect.left) / rect.width) * 2 - 1, -((ev.clientY - rect.top) / rect.height) * 2 + 1);
    raycaster.setFromCamera(ndc, camera);
    const visible = pins.filter((p) => p.sprite.visible).map((p) => p.sprite);
    const hit = raycaster.intersectObjects(visible, false)[0];
    return hit ? hit.object.userData.eventId : null;
  }

  canvas.addEventListener('pointermove', (ev) => {
    if (ev.pointerType !== 'mouse') return;
    const id = pinAt(ev);
    canvas.style.cursor = id ? 'pointer' : '';
    if (id !== hovered) {
      highlight(id);
      emit('hover', id);
    }
  });
  canvas.addEventListener('pointerdown', (ev) => { downAt = { x: ev.clientX, y: ev.clientY }; });
  canvas.addEventListener('pointerup', (ev) => {
    if (!downAt || Math.hypot(ev.clientX - downAt.x, ev.clientY - downAt.y) > 6) return;
    const id = pinAt(ev);
    if (id) emit('select', id);
    else emit('select', null);
  });

  // keep the camera over the city
  const half = { x: COLS / 2, z: ROWS / 2 };
  controls.addEventListener('change', () => {
    controls.target.x = THREE.MathUtils.clamp(controls.target.x, -half.x, half.x);
    controls.target.z = THREE.MathUtils.clamp(controls.target.z, -half.z, half.z);
    updateSpriteScales();
  });

  // ---- loop -------------------------------------------------------------------
  const clock = new THREE.Clock();
  let waterTick = 0;
  let frame = 0;
  function tick() {
    const dt = Math.min(clock.getDelta(), 0.1);
    const t = clock.elapsedTime;

    if (flight) {
      flight.t = Math.min(1, flight.t + dt / 0.8);
      const e = flight.t < 0.5 ? 4 * flight.t ** 3 : 1 - (-2 * flight.t + 2) ** 3 / 2;
      controls.target.lerpVectors(flight.fromTarget, flight.toTarget, e);
      const off = flight.fromOff.clone().lerp(flight.toOff, e);
      camera.position.copy(controls.target).add(off);
      camera.zoom = THREE.MathUtils.lerp(flight.fromZoom, flight.toZoom, e);
      camera.updateProjectionMatrix();
      updateSpriteScales();
      if (flight.t >= 1) flight = null;
    }
    controls.update();

    if (!REDUCED_MOTION) {
      waterTick += dt;
      if (waterTick > 0.7) {
        waterTick = 0;
        frame = 1 - frame;
        waterFrames.mesh.material.map = waterFrames.textures[frame];
      }
      const wpp = worldPerPixel();
      for (const pin of pins) {
        const lift = pin.event.id === selected || pin.event.id === hovered ? 3 : 1;
        // bob in whole render pixels so the sprite never blurs between pixels
        const bob = Math.round((Math.sin(t * 3 + pin.phase) * 0.5 + 0.5) * 2 * lift);
        pin.sprite.position.y = pin.baseY + bob * wpp;
      }
      for (const b of boats) b.update(t);
    }

    renderer.render(scene, camera);
    requestAnimationFrame(tick);
  }

  new ResizeObserver(resize).observe(container);
  resize();
  home(false);
  requestAnimationFrame(tick);

  return {
    setEvents,
    setVisible,
    focusEvent,
    select,
    highlight,
    zoomBy,
    rotateBy,
    home: () => home(true),
    setPixelSize,
    on(name, fn) { listeners[name].push(fn); },
    get pixelSize() { return pixelSize; },
  };
}

// ---------------------------------------------------------------------------
// scene builders

function groundTop(city, lat, lng) {
  const { col, row } = latLngToCell(lat, lng);
  const c = Math.floor(col);
  const r = Math.floor(row);
  if (c < 0 || r < 0 || c >= COLS || r >= ROWS) return 0.2;
  const i = r * COLS + c;
  if (city.type[i] === T.WATER || city.type[i] === T.BRIDGE) return 0.3;
  return GROUND_H + city.height[i] * LEVEL_H;
}

function cellPos(i) {
  const col = i % COLS;
  const row = Math.floor(i / COLS);
  return { x: col - COLS / 2 + 0.5, z: row - ROWS / 2 + 0.5 };
}

function lambert(opts = {}) {
  return new THREE.MeshLambertMaterial({ flatShading: true, ...opts });
}

function instanced(count, material = lambert()) {
  const geo = new THREE.BoxGeometry(1, 1, 1);
  geo.translate(0, 0.5, 0); // base at y = 0
  const mesh = new THREE.InstancedMesh(geo, material, count);
  mesh.instanceMatrix.setUsage(THREE.StaticDrawUsage);
  return mesh;
}

const _m = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _s = new THREE.Vector3();
const _p = new THREE.Vector3();
function place(mesh, idx, x, y, z, sx, sy, sz, hex, rotY = 0) {
  _q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), rotY);
  _m.compose(_p.set(x, y, z), _q, _s.set(sx, sy, sz));
  mesh.setMatrixAt(idx, _m);
  mesh.setColorAt(idx, color(hex));
}

// A thick slab under the map so the city reads as a diorama.
function buildBase(world) {
  const slab = new THREE.Mesh(new THREE.BoxGeometry(COLS + 2, 4, ROWS + 2), lambert({ color: '#2b335e' }));
  slab.position.y = -2.05;
  world.add(slab);
  const rim = new THREE.Mesh(new THREE.BoxGeometry(COLS + 2.6, 0.6, ROWS + 2.6), lambert({ color: '#151a33' }));
  rim.position.y = -4.2;
  world.add(rim);
}

function buildWater(world, city) {
  const textures = [0, 1].map((frame) => {
    const data = new Uint8Array(COLS * ROWS * 4);
    const c0 = color(PALETTE.water[0]);
    const c1 = color(PALETTE.water[1]);
    const cs = color(PALETTE.waterShore);
    const cw = color('#ffffff');
    const r = rng(77 + frame);
    for (let row = 0; row < ROWS; row++) {
      for (let col = 0; col < COLS; col++) {
        const i = row * COLS + col;
        // DataTexture rows run bottom-up, our grid runs north to south
        const ti = ((ROWS - 1 - row) * COLS + col) * 4;
        let c = (col + row + frame) % 4 === 0 ? c1 : c0;
        if (city.shore[i]) c = (col + row + frame) % 2 ? cs : c1;
        else if (r() < 0.0025) c = cw; // glints
        const lin = c.clone().convertLinearToSRGB();
        data[ti] = lin.r * 255; data[ti + 1] = lin.g * 255; data[ti + 2] = lin.b * 255; data[ti + 3] = 255;
      }
    }
    const tex = new THREE.DataTexture(data, COLS, ROWS);
    tex.magFilter = THREE.NearestFilter;
    tex.minFilter = THREE.NearestFilter;
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.needsUpdate = true;
    return tex;
  });
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(COLS, ROWS), lambert({ map: textures[0] }));
  mesh.rotation.x = -Math.PI / 2;
  mesh.position.y = 0;
  world.add(mesh);
  return { mesh, textures };
}

function buildLand(world, city) {
  const cells = [];
  for (let i = 0; i < city.type.length; i++) {
    const t = city.type[i];
    if (t === T.LAND || t === T.PARK || t === T.AIRPORT) cells.push(i);
  }
  const mesh = instanced(cells.length);
  const r = rng(5);
  cells.forEach((i, k) => {
    const { x, z } = cellPos(i);
    const col = i % COLS;
    const row = Math.floor(i / COLS);
    const t = city.type[i];
    let hex = PALETTE.land[city.area[i]] ?? PALETTE.land.li;
    if (t === T.PARK) hex = (col + row) % 3 === 0 ? PALETTE.park[1] : PALETTE.park[0];
    if (t === T.AIRPORT) hex = (col - row) % 5 === 0 || (col + 2 * row) % 7 === 0 ? PALETTE.runway : PALETTE.airport;
    if (t === T.LAND && city.street[i]) hex = PALETTE.street;
    if (t === T.LAND && touchesWater(city, col, row) && city.height[i] === 0) hex = PALETTE.sand;
    place(mesh, k, x, 0, z, 1, GROUND_H + (r() < 0.04 && t === T.PARK ? 0.1 : 0), 1, hex);
  });
  mesh.instanceColor.needsUpdate = true;
  world.add(mesh);

  // trees
  const parkCells = cells.filter((i) => city.type[i] === T.PARK);
  const treeR = rng(9);
  const trees = parkCells.filter(() => treeR() < 0.5);
  const tm = instanced(trees.length);
  trees.forEach((i, k) => {
    const { x, z } = cellPos(i);
    const s = 0.35 + treeR() * 0.25;
    place(tm, k, x + (treeR() - 0.5) * 0.4, GROUND_H, z + (treeR() - 0.5) * 0.4, s, s * 1.3, s, pick(PALETTE.tree, treeR()));
  });
  tm.instanceColor.needsUpdate = true;
  world.add(tm);
}

function touchesWater(city, col, row) {
  for (const [dc, dr] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
    const c = col + dc;
    const r = row + dr;
    if (c < 0 || r < 0 || c >= COLS || r >= ROWS) continue;
    const t = city.type[r * COLS + c];
    if (t === T.WATER || t === T.BRIDGE) return true;
  }
  return false;
}

function buildBuildings(world, city, landmarkCells) {
  const r = rng(42);
  const boxes = [];
  for (let i = 0; i < city.height.length; i++) {
    const h = city.height[i];
    if (!h || city.type[i] !== T.LAND || landmarkCells.has(i)) continue;
    const { x, z } = cellPos(i);
    const fp = 0.62 + r() * 0.22;
    const jx = (r() - 0.5) * (1 - fp) * 0.8;
    const jz = (r() - 0.5) * (1 - fp) * 0.8;
    const height = h * LEVEL_H;
    const band = h > 8 ? PALETTE.high : h > 4 ? PALETTE.mid : PALETTE.low;
    // neighbouring tiles in the same block share a colour family
    const col = i % COLS;
    const row = Math.floor(i / COLS);
    const blockSeed = rng(Math.floor(col / 3) * 7919 + Math.floor(row / 3) * 104729)();
    const hex = pick(band, r() < 0.6 ? blockSeed : r());
    boxes.push([x + jx, GROUND_H, z + jz, fp, height, fp, hex]);
    // tall towers get a setback and sometimes a mast
    if (h > 7) {
      const fp2 = fp * (0.55 + r() * 0.2);
      const h2 = height * (0.15 + r() * 0.2);
      boxes.push([x + jx, GROUND_H + height, z + jz, fp2, h2, fp2, r() < 0.5 ? hex : PALETTE.glass]);
      if (r() < 0.25) boxes.push([x + jx, GROUND_H + height + h2, z + jz, 0.08, 0.9, 0.08, '#e8eef9']);
    } else if (h > 2 && r() < 0.1) {
      // rooftop water tower, very New York
      boxes.push([x + jx + 0.15, GROUND_H + height, z + jz - 0.1, 0.22, 0.3, 0.22, '#9b6b47']);
    }
  }
  const mesh = instanced(boxes.length);
  boxes.forEach((b, k) => place(mesh, k, b[0], b[1], b[2], b[3], b[4], b[5], b[6]));
  mesh.instanceColor.needsUpdate = true;
  world.add(mesh);
}

function buildBridges(world) {
  const parts = [];
  for (const b of BRIDGES) {
    const a = latLngToWorld(b.from[0], b.from[1]);
    const c = latLngToWorld(b.to[0], b.to[1]);
    const len = Math.hypot(c.x - a.x, c.z - a.z);
    const ang = Math.atan2(-(c.z - a.z), c.x - a.x);
    const mx = (a.x + c.x) / 2;
    const mz = (a.z + c.z) / 2;
    parts.push([mx, 0.75, mz, len, 0.18, 0.55, PALETTE.bridge, ang]);
    if (b.towers) {
      for (const f of [0.28, 0.72]) {
        const tx = a.x + (c.x - a.x) * f;
        const tz = a.z + (c.z - a.z) * f;
        parts.push([tx, 0, tz, 0.3, 2.6, 0.7, PALETTE.bridgeTower, ang]);
      }
    }
  }
  const mesh = instanced(parts.length);
  parts.forEach((p, k) => place(mesh, k, p[0], p[1], p[2], p[3], p[4], p[5], p[6], p[7]));
  mesh.instanceColor.needsUpdate = true;
  world.add(mesh);
}

function buildLandmarks(world, city) {
  const stacks = {
    // [footprint x, height, footprint z, colour], stacked bottom to top
    wtc: [[1.1, 12, 1.1, PALETTE.glass], [0.8, 3, 0.8, '#8fb8e8'], [0.5, 1, 0.5, '#c5d6f2'], [0.08, 4, 0.08, '#e8eef9']],
    esb: [[1.2, 3, 1.2, '#d8cfbd'], [1, 6, 1, '#e3dccd'], [0.75, 1.6, 0.75, '#d8cfbd'], [0.45, 1.2, 0.45, '#efe9dc'], [0.2, 0.8, 0.2, '#d8cfbd'], [0.07, 2.4, 0.07, '#ffffff']],
    chrysler: [[1, 7.5, 1, '#c9d2e3'], [0.75, 1.2, 0.75, '#e8eef9'], [0.55, 0.9, 0.55, '#f4f7fd'], [0.35, 0.7, 0.35, '#e8eef9'], [0.06, 2, 0.06, '#ffffff']],
    liberty: [[1, 0.6, 1, '#c9b48a'], [0.55, 0.9, 0.55, '#bda57a'], [0.35, 1.3, 0.35, PALETTE.liberty], [0.22, 0.4, 0.22, PALETTE.liberty]],
  };
  const parts = [];
  for (const l of LANDMARKS) {
    const p = latLngToWorld(l.lat, l.lng);
    const base = l.id === 'liberty' ? GROUND_H : GROUND_H;
    if (stacks[l.id]) {
      let y = base;
      for (const [sx, h, sz, hex] of stacks[l.id]) {
        parts.push([p.x, y, p.z, sx, h, sz, hex]);
        y += h;
      }
      if (l.id === 'liberty') {
        parts.push([p.x + 0.15, y - 0.4, p.z, 0.08, 0.8, 0.08, PALETTE.liberty]); // raised arm
        parts.push([p.x + 0.15, y + 0.4, p.z, 0.16, 0.2, 0.16, '#ffd23f']); // torch
      }
    } else if (l.id === 'yankee') {
      parts.push([p.x, GROUND_H, p.z, 2.4, 0.15, 2.4, '#5bbd5b']);
      for (const [dx, dz, sx, sz] of [[0, -1.1, 2.6, 0.4], [0, 1.1, 2.6, 0.4], [-1.1, 0, 0.4, 2.6], [1.1, 0, 0.4, 2.6]]) {
        parts.push([p.x + dx, GROUND_H, p.z + dz, sx, 0.9, sz, '#f2f2f2']);
      }
    } else if (l.id === 'unisphere') {
      parts.push([p.x, GROUND_H, p.z, 1.8, 1.1, 1.4, '#8a4b32']);
      parts.push([p.x, GROUND_H + 1.1, p.z, 1.5, 0.12, 1.1, '#6d3a26']);
    }
  }
  const mesh = instanced(parts.length);
  parts.forEach((b, k) => place(mesh, k, b[0], b[1], b[2], b[3], b[4], b[5], b[6]));
  mesh.instanceColor.needsUpdate = true;
  world.add(mesh);
}

function buildBoats(world) {
  const routes = [
    { from: [40.7005, -74.0135], to: [40.6450, -74.0600], hex: '#ff8a1f', size: [0.9, 0.35, 0.45], speed: 0.05 }, // Staten Island Ferry
    { from: [40.7050, -73.9990], to: [40.7600, -73.9550], hex: '#ffffff', size: [0.6, 0.3, 0.3], speed: 0.07 }, // East River ferry
    { from: [40.7800, -74.0060], to: [40.7100, -74.0230], hex: '#f2f2f2', size: [0.7, 0.3, 0.35], speed: 0.04 }, // Hudson
  ];
  return routes.map((rt, idx) => {
    const a = latLngToWorld(rt.from[0], rt.from[1]);
    const b = latLngToWorld(rt.to[0], rt.to[1]);
    const ang = Math.atan2(-(b.z - a.z), b.x - a.x);
    const g = new THREE.Group();
    const hull = new THREE.Mesh(new THREE.BoxGeometry(...rt.size), lambert({ color: rt.hex }));
    hull.position.y = rt.size[1] / 2;
    const cabin = new THREE.Mesh(new THREE.BoxGeometry(rt.size[0] * 0.5, rt.size[1] * 0.8, rt.size[2] * 0.7), lambert({ color: '#ffffff' }));
    cabin.position.y = rt.size[1] * 1.3;
    g.add(hull, cabin);
    g.rotation.y = ang;
    world.add(g);
    const update = (t) => {
      const u = (Math.sin(t * rt.speed * 2 + idx * 2) + 1) / 2;
      g.position.set(a.x + (b.x - a.x) * u, 0.02, a.z + (b.z - a.z) * u);
    };
    update(0);
    return { update };
  });
}

function buildLabels(world) {
  return LABELS.map((l) => {
    const tex = makeLabelTexture(l.text, l.water, l.soon);
    const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, depthTest: false, transparent: true }));
    const p = latLngToWorld(l.lat, l.lng);
    s.position.set(p.x, l.water || l.soon ? 0.5 : 9, p.z);
    s.renderOrder = 5;
    s.userData.minZoom = l.water ? 1.4 : 0;
    s.userData.maxZoom = l.water || l.soon ? 99 : 3.2;
    world.add(s);
    return s;
  });
}

// ---------------------------------------------------------------------------
// pixel-art textures drawn on tiny canvases

function canvasTexture(cv) {
  const tex = new THREE.CanvasTexture(cv);
  tex.magFilter = THREE.NearestFilter;
  tex.minFilter = THREE.NearestFilter;
  tex.generateMipmaps = false;
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

// 13 x 19 map pin, the classic teardrop, with a category-coloured centre.
const PIN = [
  '....XXXXX....',
  '..XXRRRRRXX..',
  '.XRRRRRRRRRX.',
  '.XRRRRRRRRRX.',
  'XRRRRCCCRRRRX',
  'XRRRCCCCCRRRX',
  'XRRRCCCCCRRRX',
  'XRRRCCCCCRRRX',
  'XRRRRCCCRRRRX',
  '.XRRRRRRRRRX.',
  '.XDRRRRRRRDX.',
  '..XDRRRRRDX..',
  '...XDRRRDX...',
  '....XDRDX....',
  '....XDRDX....',
  '.....XDX.....',
  '.....XDX.....',
  '......X......',
  '.............',
];

function makePinTexture(catHex, state) {
  const scale = state === 'idle' ? 1 : 1;
  const pad = 1;
  const w = PIN[0].length + pad * 2;
  const h = PIN.length + pad * 2;
  const cv = document.createElement('canvas');
  cv.width = w * scale;
  cv.height = h * scale;
  const ctx = cv.getContext('2d');
  const body = state === 'selected' ? PALETTE.pinHi : PALETTE.pin;
  const shade = state === 'selected' ? '#c99a00' : PALETTE.pinDark;
  const outline = state === 'idle' ? '#1d2340' : '#ffffff';
  const fills = { X: outline, R: body, D: shade, C: catHex };
  PIN.forEach((line, y) => {
    [...line].forEach((ch, x) => {
      if (!fills[ch]) return;
      ctx.fillStyle = fills[ch];
      ctx.fillRect((x + pad) * scale, (y + pad) * scale, scale, scale);
    });
  });
  if (state !== 'idle') {
    // 1px glow ring around the outline
    const img = ctx.getImageData(0, 0, cv.width, cv.height);
    const out = ctx.createImageData(cv.width, cv.height);
    const a = (x, y) => (x < 0 || y < 0 || x >= cv.width || y >= cv.height ? 0 : img.data[(y * cv.width + x) * 4 + 3]);
    for (let y = 0; y < cv.height; y++) {
      for (let x = 0; x < cv.width; x++) {
        const k = (y * cv.width + x) * 4;
        if (!a(x, y) && (a(x + 1, y) || a(x - 1, y) || a(x, y + 1) || a(x, y - 1))) {
          out.data[k] = 29; out.data[k + 1] = 35; out.data[k + 2] = 64; out.data[k + 3] = 255;
        }
      }
    }
    const tmp = document.createElement('canvas');
    tmp.width = cv.width; tmp.height = cv.height;
    tmp.getContext('2d').putImageData(out, 0, 0);
    ctx.globalCompositeOperation = 'destination-over';
    ctx.drawImage(tmp, 0, 0);
  }
  return canvasTexture(cv);
}

function makeLabelTexture(text, water, soon) {
  const fontPx = 8;
  const cv = document.createElement('canvas');
  const ctx = cv.getContext('2d');
  ctx.font = `${fontPx}px "Press Start 2P", monospace`;
  const lines = text.split('\n');
  const lineH = fontPx + 4;
  const w = Math.ceil(Math.max(...lines.map((l) => ctx.measureText(l).width))) + 6;
  cv.width = w;
  cv.height = lineH * lines.length + 2;
  ctx.font = `${fontPx}px "Press Start 2P", monospace`;
  ctx.textBaseline = 'top';
  ctx.imageSmoothingEnabled = false;
  const fg = soon ? '#ffd23f' : water ? '#e9fbff' : '#ffffff';
  const bg = water ? '#2a7fa8' : '#1d2340';
  // hard 1px outline, drawn by offsetting the text in 8 directions
  ctx.fillStyle = bg;
  // lines are centred; a single line fills the canvas exactly as before
  const xOf = (l) => 3 + Math.floor((w - 6 - ctx.measureText(l).width) / 2);
  lines.forEach((l, i) => {
    for (const [dx, dy] of [[-1, -1], [0, -1], [1, -1], [-1, 0], [1, 0], [-1, 1], [0, 1], [1, 1], [1, 2], [2, 2]]) {
      ctx.fillText(l, xOf(l) + dx, 3 + i * lineH + dy);
    }
  });
  ctx.fillStyle = fg;
  lines.forEach((l, i) => ctx.fillText(l, xOf(l), 3 + i * lineH));
  // snap anti-aliased edges to solid pixels
  const img = ctx.getImageData(0, 0, cv.width, cv.height);
  for (let k = 3; k < img.data.length; k += 4) img.data[k] = img.data[k] > 110 ? 255 : 0;
  ctx.putImageData(img, 0, 0);
  return canvasTexture(cv);
}
