// three.js voxel renderer for the 8-bit NYC map.
// The scene is drawn into a small canvas and scaled up with nearest-neighbour
// filtering, which is what gives it the chunky pixel look.

import * as THREE from 'three';
import { MapControls } from 'three/addons/controls/MapControls.js';
import {
  COLS, ROWS, T, BRIDGES, LANDMARKS, LABELS, buildCity, latLngToWorld, latLngToCell, clearedTiles, rng,
} from './geo.js';
import { PALETTE, CATEGORY_COLORS } from './palette.js';

const GROUND_H = 0.35;
const LEVEL_H = 0.4;
// Roof height of landmarks that clear their neighbouring tiles; pins there sit on top.
const LANDMARK_TOP = { msg: 3.5, tsq: 0.1 }; // tsq: the Times Square plaza paving
// Zoomed out, pins stand on their spots (sharing a tile fans them out a little). From
// SPREAD_FROM they ease apart on screen and are fully spread by SPREAD_FULL (max zoom is 7).
const SPREAD_FROM = 4;
const SPREAD_FULL = 5.5;
// Pin spacing in render pixels, measured between the heads of the 13 px wide pins.
const PIN_GAP = 14; // pins at different places just touch
const SAME_GAP = 11; // pins at the same place overlap a little
const MAX_SHIFT = 42; // furthest a pin moves from its true spot; past this crowds may still overlap
const SAME_SPOT = 0.25; // tiles (~30 m): closer than this counts as the same place
const VIEW_HEIGHT = 70; // world units visible top to bottom at zoom 1
const HOME = { lat: 40.738, lng: -73.975, zoom: 1.15 };
const REDUCED_MOTION = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

const color = (hex) => new THREE.Color(hex);
const pick = (arr, r) => arr[Math.floor(r * arr.length) % arr.length];

export function createMap(container, opts = {}) {
  let pixelSize = opts.pixelSize ?? 2;
  const listeners = { select: [], hover: [], view: [] };
  const frameHooks = new Set(); // extra scene actors (the monster easter egg) step here each frame
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
  controls.minZoom = 0.25; // far enough out to see all five boroughs
  controls.maxZoom = 7;
  controls.minPolarAngle = 0.45;
  controls.maxPolarAngle = 1.1;
  controls.zoomToCursor = true;

  scene.add(new THREE.HemisphereLight(0xffffff, 0x8a7a9a, 1.6));
  const sun = new THREE.DirectionalLight(0xffffff, 1.9);
  sun.position.set(-60, 120, 80);
  scene.add(sun);

  const city = buildCity();
  city.landmarkTop = new Map();
  const world = new THREE.Group();
  scene.add(world);

  // Landmark tiles get hand-built models instead of generic blocks.
  const landmarkCells = new Set();
  for (const l of LANDMARKS) {
    const { col, row } = latLngToCell(l.lat, l.lng);
    for (const { col: c, row: w } of clearedTiles(l)) {
      landmarkCells.add(w * COLS + c);
      // pins on a cleared tile sit on the landmark's roof
      if (l.clear) city.landmarkTop.set(w * COLS + c, GROUND_H + LANDMARK_TOP[l.id]);
    }
    if (l.low) {
      const r2 = Math.ceil(l.low);
      for (let dr = -r2; dr <= r2; dr++) {
        for (let dc = -r2; dc <= r2; dc++) {
          const c = Math.floor(col) + dc;
          const w = Math.floor(row) + dr;
          const d = Math.hypot(c + 0.5 - col, w + 0.5 - row);
          // step the neighbours down towards the landmark
          if (d <= l.low) city.height[w * COLS + c] = Math.min(city.height[w * COLS + c], Math.round(2 + d * 1.5));
        }
      }
    }
  }

  buildBase(world);
  const waterFrames = buildWater(world, city);
  buildLand(world, city);
  const roofs = buildBuildings(world, city, landmarkCells);
  buildBridges(world);
  buildLandmarks(world, city);
  const boats = buildBoats(world);
  const labelSprites = buildLabels(world);

  // ---- pins -------------------------------------------------------------
  const pinGroup = new THREE.Group();
  world.add(pinGroup);
  let pins = []; // { sprite, event, anchor, fan, spot, baseY, order, phase }
  let visibleVersion = 0;
  let hovered = null;
  let selected = null;
  const pinTextures = new Map();

  function pinTexture(category, state) {
    const key = `${category}:${state}`;
    if (!pinTextures.has(key)) pinTextures.set(key, makePinTexture(CATEGORY_COLORS[category] ?? '#ffffff', state));
    return pinTextures.get(key);
  }

  function setEvents(events) {
    showPinTitle(null);
    pinGroup.clear();
    pins = [];
    const spots = []; // one per place; events within ~30 m of each other share it
    const used = new Map();
    for (const ev of events) {
      const p = latLngToWorld(ev.venue.lat, ev.venue.lng);
      const cellKey = `${Math.floor(p.x)},${Math.floor(p.z)}`;
      const n = used.get(cellKey) ?? 0;
      used.set(cellKey, n + 1);
      // fan out events that land on the same tile
      const fan = new THREE.Vector3(n ? Math.cos(n * 2.1) * 0.9 : 0, 0, n ? Math.sin(n * 2.1) * 0.9 : 0);
      let spot = spots.findIndex((q) => Math.hypot(q.x - p.x, q.z - p.z) < SAME_SPOT);
      if (spot < 0) spot = spots.push(p) - 1;
      const baseY = groundTop(city, ev.venue.lat, ev.venue.lng) + 0.2;
      const mat = new THREE.SpriteMaterial({ map: pinTexture(ev.category, 'idle'), depthTest: false, transparent: true });
      const sprite = new THREE.Sprite(mat);
      sprite.center.set(0.5, 0);
      sprite.position.set(p.x + fan.x, baseY, p.z + fan.z);
      sprite.renderOrder = 10;
      sprite.userData.eventId = ev.id;
      pinGroup.add(sprite);
      pins.push({ sprite, event: ev, anchor: new THREE.Vector3(p.x, baseY, p.z), fan, spot, baseY, order: 10, phase: Math.random() * Math.PI * 2 });
    }
    layoutKey = '';
    refreshPinStates();
    updateSpriteScales();
  }

  function refreshPinStates() {
    for (const pin of pins) {
      const state = pin.event.id === selected ? 'selected' : pin.event.id === hovered ? 'hover' : 'idle';
      pin.sprite.material.map = pinTexture(pin.event.category, state);
      pin.sprite.renderOrder = state === 'idle' ? pin.order : 20;
    }
  }

  // Pins are drawn at a fixed pixel size, so whether two of them collide depends on the view.
  // Zoomed in close (see SPREAD_FROM) they are spread out on screen: pins at different places
  // are pushed apart until their heads just touch, and pins at the same place huddle together,
  // overlapping a little. Panning moves everything alike, so it needs no new layout.
  let layoutKey = '';
  const right = new THREE.Vector3();
  const up = new THREE.Vector3();
  function layoutPins() {
    camera.updateMatrixWorld();
    const q = camera.quaternion;
    const key = [camera.zoom, q.x, q.y, q.z, q.w].map((n) => n.toFixed(4)).join() + `|${rw}x${rh}|${visibleVersion}`;
    if (key === layoutKey) return;
    layoutKey = key;
    const t = THREE.MathUtils.clamp((camera.zoom - SPREAD_FROM) / (SPREAD_FULL - SPREAD_FROM), 0, 1);
    if (t === 0) {
      for (const pin of pins) {
        pin.sprite.position.copy(pin.anchor).add(pin.fan);
        pin.baseY = pin.sprite.position.y;
        pin.order = 10;
      }
      refreshPinStates();
      return;
    }
    const wpp = worldPerPixel();
    right.setFromMatrixColumn(camera.matrixWorld, 0);
    up.setFromMatrixColumn(camera.matrixWorld, 1);
    const shown = pins.filter((p) => p.sprite.visible);
    // screen spots in render pixels, y down; pins sharing a place start on a small spiral
    const seen = new Map();
    const pts = shown.map((pin, i) => {
      projected.copy(pin.anchor).project(camera);
      const k = seen.get(pin.spot) ?? 0;
      seen.set(pin.spot, k + 1);
      const ox = ((projected.x + 1) / 2) * rw;
      const oy = ((1 - projected.y) / 2) * rh;
      return { pin, i, ox, oy, x: ox + Math.cos(k * 2.4) * 2 * Math.sqrt(k), y: oy + Math.sin(k * 2.4) * 2 * Math.sqrt(k) };
    });
    for (let iter = 0; iter < 40; iter++) {
      const grid = new Map();
      for (const p of pts) {
        const g = `${Math.floor(p.x / PIN_GAP)},${Math.floor(p.y / PIN_GAP)}`;
        if (!grid.has(g)) grid.set(g, []);
        grid.get(g).push(p);
      }
      let moved = false;
      for (const a of pts) {
        const gx = Math.floor(a.x / PIN_GAP);
        const gy = Math.floor(a.y / PIN_GAP);
        for (let dx = -1; dx <= 1; dx++) {
          for (let dy = -1; dy <= 1; dy++) {
            for (const b of grid.get(`${gx + dx},${gy + dy}`) ?? []) {
              if (b.i <= a.i) continue; // each pair once
              const need = a.pin.spot === b.pin.spot ? SAME_GAP : PIN_GAP;
              let ux = b.x - a.x;
              let uy = b.y - a.y;
              let d = Math.hypot(ux, uy);
              if (d >= need) continue;
              if (d < 1e-3) { ux = 1; uy = 0; d = 1; } else { ux /= d; uy /= d; }
              const push = (need - Math.max(d, 1e-3)) / 2;
              a.x -= ux * push; a.y -= uy * push;
              b.x += ux * push; b.y += uy * push;
              moved = true;
            }
          }
        }
      }
      for (const p of pts) {
        const d = Math.hypot(p.x - p.ox, p.y - p.oy);
        if (d > MAX_SHIFT) {
          p.x = p.ox + ((p.x - p.ox) * MAX_SHIFT) / d;
          p.y = p.oy + ((p.y - p.oy) * MAX_SHIFT) / d;
        }
      }
      if (!moved) break;
    }
    for (const p of pts) {
      // whole render pixels keep the sprites crisp
      const dx = Math.round((p.x - p.ox) * t) * wpp;
      const dy = -Math.round((p.y - p.oy) * t) * wpp;
      p.pin.sprite.position.copy(p.pin.anchor).addScaledVector(p.pin.fan, 1 - t).addScaledVector(right, dx).addScaledVector(up, dy);
      p.pin.baseY = p.pin.sprite.position.y;
      // pins lower on screen are drawn over the ones behind them
      p.pin.order = 10 + p.y / rh;
    }
    refreshPinStates();
  }

  function setVisible(ids) {
    const set = ids ? new Set(ids) : null;
    for (const pin of pins) pin.sprite.visible = !set || set.has(pin.event.id);
    visibleVersion++;
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
    const target = new THREE.Vector3(pin.anchor.x, 0, pin.anchor.z);
    flyTo(target, Math.max(camera.zoom, zoom ?? 2.6));
  }

  // Slides and zooms the map to a place, such as a neighborhood picked in the + dropdown.
  function focusLatLng(lat, lng, zoom) {
    const p = latLngToWorld(lat, lng);
    flyTo(new THREE.Vector3(p.x, 0, p.z), THREE.MathUtils.clamp(zoom, controls.minZoom, controls.maxZoom));
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

  // ---- what the viewer can see ------------------------------------------------
  // The event list follows the map: once the view leaves home, it lists only the pins on screen.
  // 'view' fires when the camera comes to rest after any move (drag, zoom, turn, fly, resize).
  const homeTarget = (() => { const p = latLngToWorld(HOME.lat, HOME.lng); return new THREE.Vector3(p.x, 0, p.z); })();
  function atHome() {
    const off = camera.position.clone().sub(controls.target).normalize();
    return Math.abs(camera.zoom - HOME.zoom) < 0.01
      && controls.target.distanceTo(homeTarget) < 0.5
      && off.angleTo(camOffset) < 0.01;
  }
  function eventsInView() {
    camera.updateMatrixWorld();
    const ids = new Set();
    for (const pin of pins) {
      projected.copy(pin.anchor).project(camera);
      if (Math.abs(projected.x) <= 1 && Math.abs(projected.y) <= 1) ids.add(pin.event.id);
    }
    return ids;
  }
  let viewKey = '';
  let viewSent = '';
  let viewStill = 0;
  function watchView(dt) {
    const p = camera.position;
    const t = controls.target;
    const key = [camera.zoom, p.x, p.y, p.z, t.x, t.z].map((n) => n.toFixed(3)).join() + `|${rw}x${rh}`;
    if (key !== viewKey) {
      viewKey = key;
      viewStill = 0;
      return;
    }
    viewStill += dt;
    if (viewStill > 0.15 && key !== viewSent) {
      viewSent = key;
      emit('view');
    }
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
    showPinTitle(id);
    if (id !== hovered) {
      highlight(id);
      emit('hover', id);
    }
  });
  canvas.addEventListener('pointerleave', (ev) => {
    if (ev.pointerType !== 'mouse') return;
    showPinTitle(null);
    if (hovered) {
      highlight(null);
      emit('hover', null);
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

  // ---- HTML labels pinned to map positions -------------------------------------
  // Crisp text at any size (neighborhood names). Each is a
  // plain element in a layer over the canvas, moved to its projected spot per frame.
  const anchorLayer = document.createElement('div');
  anchorLayer.className = 'map-anchors';
  container.appendChild(anchorLayer);
  const anchors = [];
  const projected = new THREE.Vector3();
  function addAnchor(text, lat, lng, { className = '', minZoom = 0, maxZoom = Infinity } = {}) {
    const el = document.createElement('div');
    el.className = `map-anchor ${className}`;
    el.textContent = text;
    el.hidden = true;
    anchorLayer.appendChild(el);
    const p = latLngToWorld(lat, lng);
    anchors.push({ el, pos: new THREE.Vector3(p.x, groundTop(city, lat, lng) + 0.5, p.z), minZoom, maxZoom });
    return el;
  }
  function placeAnchors() {
    const w = canvas.clientWidth;
    const h = canvas.clientHeight;
    for (const a of anchors) {
      let show = camera.zoom >= a.minZoom && camera.zoom <= a.maxZoom;
      if (show) {
        projected.copy(a.pos).project(camera);
        const x = Math.round(((projected.x + 1) / 2) * w);
        const y = Math.round(((1 - projected.y) / 2) * h);
        show = x > -300 && x < w + 300 && y > -60 && y < h + 60;
        if (show) a.el.style.transform = `translate(${x}px, ${y}px) translate(-50%, -50%)`;
      }
      if (a.el.hidden === show) a.el.hidden = !show;
    }
  }

  // The event title floats over a pin while the mouse is on it (mouse only, so taps work as before).
  const pinTitle = document.createElement('div');
  pinTitle.className = 'pin-title';
  pinTitle.hidden = true;
  anchorLayer.appendChild(pinTitle);
  let titlePin = null;
  function showPinTitle(id) {
    if ((titlePin?.event.id ?? null) === id) return;
    titlePin = id ? pins.find((p) => p.event.id === id) ?? null : null;
    if (titlePin) pinTitle.textContent = titlePin.event.title;
    pinTitle.hidden = !titlePin;
    placePinTitle();
  }
  function placePinTitle() {
    if (!titlePin) return;
    if (!titlePin.sprite.visible) return showPinTitle(null);
    projected.copy(titlePin.sprite.position).project(camera);
    const cssPerPx = canvas.clientHeight / rh;
    const x = Math.round(((projected.x + 1) / 2) * canvas.clientWidth);
    const y = Math.round(((1 - projected.y) / 2) * canvas.clientHeight - titlePin.sprite.material.map.image.height * cssPerPx - 4);
    pinTitle.style.transform = `translate(${x}px, ${y}px) translate(-50%, -100%)`;
  }

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
    layoutPins();
    watchView(dt);

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
    for (const fn of frameHooks) fn(dt, t);

    renderer.render(scene, camera);
    placeAnchors();
    placePinTitle();
    requestAnimationFrame(tick);
  }

  new ResizeObserver(resize).observe(container);
  resize();
  home(false);
  requestAnimationFrame(tick);

  return {
    setEvents,
    addAnchor,
    setVisible,
    focusEvent,
    focusLatLng,
    select,
    highlight,
    zoomBy,
    rotateBy,
    home: () => home(true),
    atHome,
    eventsInView,
    setPixelSize,
    on(name, fn) { listeners[name].push(fn); },
    // ---- hooks for things that move around the scene (see src/scripts/monster.js) ----
    world,
    camera,
    canvas,
    onFrame(fn) { frameHooks.add(fn); return () => frameHooks.delete(fn); },
    // ground height at a world position (water and bridges sit near 0.3)
    groundAt: (x, z) => groundTopCell(city, Math.floor(x + COLS / 2), Math.floor(z + ROWS / 2)),
    // the building on a tile: { x, z, size, top, bare } (bare means nothing stands on its roof)
    rooftop(col, row) { return roofs.get(row * COLS + col) ?? null; },
    // where the ray under a screen point crosses the level y, in world space
    rayToHeight(clientX, clientY, y) {
      const rect = canvas.getBoundingClientRect();
      ndc.set(((clientX - rect.left) / rect.width) * 2 - 1, -((clientY - rect.top) / rect.height) * 2 + 1);
      raycaster.setFromCamera(ndc, camera);
      const r = raycaster.ray;
      if (Math.abs(r.direction.y) < 1e-4) return null;
      return r.at((y - r.origin.y) / r.direction.y, new THREE.Vector3());
    },
    // a world position in CSS pixels relative to the map container
    toScreen(v) {
      projected.copy(v).project(camera);
      return { x: ((projected.x + 1) / 2) * canvas.clientWidth, y: ((1 - projected.y) / 2) * canvas.clientHeight, behind: projected.z > 1 };
    },
    flyTo: (target, zoom) => flyTo(target, THREE.MathUtils.clamp(zoom ?? camera.zoom, controls.minZoom, controls.maxZoom)),
    get target() { return controls.target.clone(); },
    get zoom() { return camera.zoom; },
    get maxZoom() { return controls.maxZoom; },
    get pixelSize() { return pixelSize; },
  };
}

// ---------------------------------------------------------------------------
// scene builders

function groundTop(city, lat, lng) {
  const { col, row } = latLngToCell(lat, lng);
  return groundTopCell(city, Math.floor(col), Math.floor(row));
}

function groundTopCell(city, c, r) {
  if (c < 0 || r < 0 || c >= COLS || r >= ROWS) return 0.2;
  const i = r * COLS + c;
  if (city.type[i] === T.WATER || city.type[i] === T.BRIDGE) return 0.3;
  if (city.landmarkTop?.has(i)) return city.landmarkTop.get(i);
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
    if (t === T.LAND || t === T.PARK || t === T.AIRPORT || t === T.BEACH) cells.push(i);
  }
  // The ground tops are one flat texture at GROUND_H, one pixel per tile. Only tiles whose
  // sides can be seen (on the shore or the map's edge) and the odd raised park tile are
  // real boxes, which keeps the whole city to a few thousand boxes of ground.
  const data = new Uint8Array(COLS * ROWS * 4);
  const sides = [];
  const r = rng(5);
  for (const i of cells) {
    const col = i % COLS;
    const row = Math.floor(i / COLS);
    const t = city.type[i];
    let hex = PALETTE.land[city.area[i]] ?? PALETTE.land.li;
    if (t === T.PARK) hex = (col + row) % 3 === 0 ? PALETTE.park[1] : PALETTE.park[0];
    if (t === T.BEACH) hex = PALETTE.sand;
    if (t === T.AIRPORT) hex = (col - row) % 5 === 0 || (col + 2 * row) % 7 === 0 ? PALETTE.runway : PALETTE.airport;
    if (t === T.LAND && city.street[i]) hex = PALETTE.street;
    const shore = touchesWater(city, col, row);
    if (t === T.LAND && shore && city.height[i] === 0) hex = PALETTE.sand;
    const ti = ((ROWS - 1 - row) * COLS + col) * 4;
    const c = color(hex).convertLinearToSRGB();
    data[ti] = c.r * 255; data[ti + 1] = c.g * 255; data[ti + 2] = c.b * 255; data[ti + 3] = 255;
    const bump = r() < 0.04 && t === T.PARK ? 0.1 : 0;
    const edge = col === 0 || row === 0 || col === COLS - 1 || row === ROWS - 1;
    // boxes stop just under the texture so the two never fight over the same pixels
    if (shore || edge || bump) sides.push([i, GROUND_H + bump - (bump ? 0 : 0.01), hex]);
  }
  const tex = new THREE.DataTexture(data, COLS, ROWS);
  tex.magFilter = THREE.NearestFilter;
  tex.minFilter = THREE.NearestFilter;
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.needsUpdate = true;
  const top = new THREE.Mesh(new THREE.PlaneGeometry(COLS, ROWS), lambert({ map: tex, alphaTest: 0.5 }));
  top.rotation.x = -Math.PI / 2;
  top.position.y = GROUND_H;
  world.add(top);

  const mesh = instanced(sides.length);
  sides.forEach(([i, h, hex], k) => {
    const { x, z } = cellPos(i);
    place(mesh, k, x, 0, z, 1, h, 1, hex);
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
  const roofs = new Map();
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
    const roof = { x: x + jx, z: z + jz, size: fp, top: GROUND_H + height, bare: true };
    roofs.set(i, roof);
    // tall towers get a setback and sometimes a mast
    if (h > 7) {
      roof.bare = false;
      const fp2 = fp * (0.55 + r() * 0.2);
      const h2 = height * (0.15 + r() * 0.2);
      boxes.push([x + jx, GROUND_H + height, z + jz, fp2, h2, fp2, r() < 0.5 ? hex : PALETTE.glass]);
      if (r() < 0.25) boxes.push([x + jx, GROUND_H + height + h2, z + jz, 0.08, 0.9, 0.08, '#e8eef9']);
    } else if (h > 2 && r() < 0.1) {
      // rooftop water tower, very New York
      roof.bare = false;
      boxes.push([x + jx + 0.15, GROUND_H + height, z + jz - 0.1, 0.22, 0.3, 0.22, '#8f8a82']);
    }
  }
  const mesh = instanced(boxes.length);
  boxes.forEach((b, k) => place(mesh, k, b[0], b[1], b[2], b[3], b[4], b[5], b[6]));
  mesh.instanceColor.needsUpdate = true;
  world.add(mesh);
  return roofs;
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
    liberty: [[1, 0.6, 1, '#d6d2ca'], [0.55, 0.9, 0.55, '#c8c3ba'], [0.35, 1.3, 0.35, PALETTE.liberty], [0.22, 0.4, 0.22, PALETTE.liberty]],
    globe: [[1.6, 0.15, 1.6, '#9fcdea'], [0.15, 0.6, 0.15, '#8c8fa3'], [0.9, 0.35, 0.9, '#c9d2e3'], [1.4, 0.45, 1.4, '#c9d2e3'], [1.5, 0.45, 1.5, '#dbe2ee'], [1.1, 0.35, 1.1, '#c9d2e3'], [0.5, 0.2, 0.5, '#c9d2e3']],
    parachute: [[1, 0.3, 1, '#d94a3a'], [0.3, 5.5, 0.3, '#d94a3a'], [1.6, 0.3, 1.6, '#d94a3a'], [0.9, 0.4, 0.9, '#e8eef9'], [0.08, 1, 0.08, '#ffffff']],
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
        parts.push([p.x + 0.15, y + 0.4, p.z, 0.16, 0.2, 0.16, '#ece8e1']); // torch
      }
    } else if (l.id === 'yankee' || l.id === 'citi') {
      parts.push([p.x, GROUND_H, p.z, 2.4, 0.15, 2.4, '#5bbd5b']);
      for (const [dx, dz, sx, sz] of [[0, -1.1, 2.6, 0.4], [0, 1.1, 2.6, 0.4], [-1.1, 0, 0.4, 2.6], [1.1, 0, 0.4, 2.6]]) {
        parts.push([p.x + dx, GROUND_H, p.z + dz, sx, 0.9, sz, '#f2f2f2']);
      }
    } else if (l.id === 'wheel') {
      // a ring of cars standing on two legs, facing the boardwalk
      for (let k = 0; k < 12; k++) {
        const a = (k / 12) * Math.PI * 2;
        parts.push([p.x + Math.cos(a) * 1.3, GROUND_H + 1.6 + Math.sin(a) * 1.3, p.z, 0.4, 0.4, 0.3, k % 2 ? '#ff5c8a' : '#ffe14d']);
      }
      parts.push([p.x, GROUND_H, p.z, 0.25, 1.7, 0.25, '#f2f2f2']);
      parts.push([p.x, GROUND_H, p.z, 1.6, 0.2, 0.5, '#5a5d72']);
    } else if (l.id === 'msg') {
      // Madison Square Garden: a round drum on the Penn Station block, turned to the street grid
      const grid = -0.5;
      parts.push([p.x, GROUND_H, p.z, 3, 0.4, 2, '#9a968e', grid]); // Penn Plaza podium
      // the drum is a pixel circle: thin strips whose width follows the curve
      const drum = (y, r, h, hex) => {
        for (let k = -3.5; k <= 3.5; k++) {
          const dz = (k / 4) * r;
          const w = 2 * Math.sqrt(Math.max(0, r * r - dz * dz)) + 0.1;
          parts.push([p.x, y, p.z + dz, w, h, (r / 4) + 0.02, hex]);
        }
      };
      drum(GROUND_H + 0.4, 1, 2.3, '#d6d0c4'); // facade
      drum(GROUND_H + 2.7, 1.04, 0.4, '#4a4d63'); // dark crown band
      drum(GROUND_H + 3.1, 0.9, 0.25, '#e8eef9'); // roof
      drum(GROUND_H + 3.35, 0.55, 0.15, '#c9d2e3'); // roof dome
      // light ribs around the drum
      for (let k = 0; k < 16; k++) {
        const a = (k / 16) * Math.PI * 2;
        parts.push([p.x + Math.cos(a) * 1.07, GROUND_H + 0.4, p.z + Math.sin(a) * 1.07, 0.12, 2.3, 0.12, '#f4f1ea']);
      }
      // the red MSG sign facing 7th Ave
      parts.push([p.x + Math.cos(grid) * 1.12, GROUND_H + 1.3, p.z - Math.sin(grid) * 1.12, 0.14, 0.7, 0.9, '#d94a3a', grid]);
    } else if (l.id === 'unisphere') {
      parts.push([p.x, GROUND_H, p.z, 1.8, 1.1, 1.4, '#8a4b32']);
      parts.push([p.x, GROUND_H + 1.1, p.z, 1.5, 0.12, 1.1, '#6d3a26']);
    }
  }
  const mesh = instanced(parts.length);
  parts.forEach((b, k) => place(mesh, k, b[0], b[1], b[2], b[3], b[4], b[5], b[6], b[7]));
  mesh.instanceColor.needsUpdate = true;
  world.add(mesh);
}

function buildBoats(world) {
  const routes = [
    { from: [40.7005, -74.0135], to: [40.6460, -74.0690], hex: '#ff8a1f', size: [0.9, 0.35, 0.45], speed: 0.05 }, // Staten Island Ferry
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
    const tex = makeLabelTexture(l.text, l.water);
    const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, depthTest: false, transparent: true }));
    const p = latLngToWorld(l.lat, l.lng);
    s.position.set(p.x, l.water ? 0.5 : 9, p.z);
    s.renderOrder = 5;
    s.userData.minZoom = l.water ? 1.4 : 0;
    s.userData.maxZoom = l.water ? 99 : 3.2;
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
  // the whole pin wears its category colour; a selected pin gets a dark eye of the same colour
  const body = catHex;
  const shade = '#' + color(catHex).multiplyScalar(0.7).getHexString();
  const outline = state === 'idle' ? '#1d2340' : '#ffffff';
  const fills = { X: outline, R: body, D: shade, C: state === 'selected' ? '#' + color(catHex).multiplyScalar(0.4).getHexString() : body };
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

function makeLabelTexture(text, water) {
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
  const fg = water ? '#e9fbff' : '#ffffff';
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
