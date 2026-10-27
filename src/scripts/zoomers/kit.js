// The shared kit for Zoomers, the easter egg characters that appear when the map is zoomed all the way
// in on their spot (see zoom-egg.js; the sunbather, the flying van and the rooftop grill are the older
// ones). A Zoomer is a little voxel scene: people built from boxes with pivots at the hips, shoulders and
// waist, a walk cycle, and speech or thought bubbles that float over a head as plain page text.

import * as THREE from 'three';
import { latLngToWorld, latLngToCell, COLS, ROWS } from '../map/geo.js';
import { watchZoomEgg } from '../zoom-egg.js';

export const VOX = 0.065; // world units per voxel: a person is about half a tile tall, a bit bigger than the older eggs so they read at full zoom
export const BOX = new THREE.BoxGeometry(1, 1, 1);
export const STRIDE = 0.55; // seconds per pair of steps
export const WALK = 4.5; // voxels per second

// Starts a scene when the map sits zoomed all the way in on [lat, lng]. start(map, spot) returns
// { step(dt), dispose() }; spot is the world position on the ground there.
export function zoomer(map, lat, lng, start, { y = null } = {}) {
  const p = latLngToWorld(lat, lng);
  const spot = new THREE.Vector3(p.x, y ?? map.groundAt(p.x, p.z), p.z);
  watchZoomEgg(map, spot, (m) => start(m, spot.clone()));
}

// Behind a building a Zoomer still shows, as a pale see-through ghost: every box gets a twin drawn only
// where something nearer covers it.
const GHOST = new THREE.MeshBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0.45, depthWrite: false, depthFunc: THREE.GreaterDepth });

// A box builder that shares one material per colour and disposes them all at the end.
export function kit() {
  const mats = new Map();
  const mat = (hex, glow = false) => {
    const key = `${hex}${glow ? '!' : ''}`;
    if (!mats.has(key)) mats.set(key, glow ? new THREE.MeshBasicMaterial({ color: hex }) : new THREE.MeshLambertMaterial({ color: hex, flatShading: true }));
    return mats.get(key);
  };
  const box = (parent, w, h, d, x, y, z, hex, glow = false) => {
    const m = new THREE.Mesh(BOX, mat(hex, glow));
    m.scale.set(w, h, d);
    m.position.set(x, y, z);
    const ghost = new THREE.Mesh(BOX, GHOST);
    ghost.renderOrder = 9;
    m.add(ghost);
    parent.add(m);
    return m;
  };
  const node = (parent, x = 0, y = 0, z = 0) => {
    const g = new THREE.Group();
    g.position.set(x, y, z);
    parent.add(g);
    return g;
  };
  return { mat, box, node, dispose() { mats.forEach((m) => m.dispose()); } };
}

// A person in voxels, facing +z, feet at y = 0. Colours and a few extras:
//   skin, hair, top, bottom, shoe, sleeves (defaults to top), legsColor (defaults to bottom)
//   hair: 'short' | 'long' | 'bald' | 'none';  hat: 'cap' | 'cowboy' | 'beanie' | null
//   cape: colour of a cape down the back;  mask: colour over the whole head;  glasses: colour
//   scale: a multiplier for a bigger or smaller figure
export function person(k, o) {
  const C = { sleeves: o.top, legsColor: o.bottom, hair: '#2a1a12', shoe: '#2b2b30', ...o };
  const root = new THREE.Group();
  const body = k.node(root);
  body.scale.setScalar(VOX * (o.scale ?? 1));
  const hips = k.node(body, 0, 3, 0);
  const legs = [-1, 1].map((side) => {
    const leg = k.node(hips, side * 0.55, 0, 0);
    k.box(leg, 0.95, 3, 1, 0, -1.5, 0, C.legsColor);
    k.box(leg, 0.95, 0.45, 1.3, 0, -2.8, 0.15, C.shoe);
    return leg;
  });
  const upper = k.node(hips);
  k.box(upper, 2.15, 0.8, 1.15, 0, 0.1, 0, C.bottom);
  k.box(upper, 2.2, 2.6, 1.2, 0, 1.8, 0, C.top);
  const head = k.node(upper, 0, 3.1, 0);
  const face = C.mask ?? C.skin;
  k.box(head, 1.6, 1.6, 1.6, 0, 0.8, 0, face);
  if (!C.mask) {
    k.box(head, 0.25, 0.25, 0.1, -0.4, 0.95, 0.82, '#1d2340'); // eyes
    k.box(head, 0.25, 0.25, 0.1, 0.4, 0.95, 0.82, '#1d2340');
  } else {
    k.box(head, 0.5, 0.35, 0.1, -0.4, 0.95, 0.82, '#ffffff');
    k.box(head, 0.5, 0.35, 0.1, 0.4, 0.95, 0.82, '#ffffff');
  }
  if (C.glasses) k.box(head, 1.5, 0.35, 0.15, 0, 0.95, 0.85, C.glasses);
  if (!C.mask && C.hair !== 'none') {
    const style = o.hairStyle ?? 'short';
    if (style !== 'bald') k.box(head, 1.7, 0.45, 1.7, 0, 1.65, 0, C.hair);
    if (style === 'short' || style === 'long') k.box(head, 1.7, 1, 0.3, 0, 1.2, -0.75, C.hair);
    if (style === 'long') k.box(head, 1.75, 2.2, 0.4, 0, 0.6, -0.8, C.hair);
  }
  if (o.hat === 'cap') {
    k.box(head, 1.75, 0.5, 1.75, 0, 1.75, 0, o.hatColor ?? '#1d2340');
    k.box(head, 1.4, 0.15, 0.8, 0, 1.55, 1.1, o.hatColor ?? '#1d2340');
  } else if (o.hat === 'cowboy') {
    k.box(head, 2.8, 0.2, 2.8, 0, 1.7, 0, o.hatColor ?? '#ffffff');
    k.box(head, 1.7, 0.8, 1.7, 0, 2.15, 0, o.hatColor ?? '#ffffff');
  } else if (o.hat === 'beanie') {
    k.box(head, 1.75, 0.7, 1.75, 0, 1.8, 0, o.hatColor ?? '#ed1c24');
  }
  if (C.cape) k.box(upper, 2.3, 4.2, 0.2, 0, 0.9, -0.75, C.cape);
  const arms = [-1, 1].map((side) => {
    const arm = k.node(upper, side * 1.45, 2.9, 0);
    k.box(arm, 0.7, 2.5, 0.75, 0, -1.2, 0, C.sleeves);
    k.box(arm, 0.72, 0.6, 0.77, 0, -2.6, 0, C.hands ?? C.skin);
    // what a hand holds hangs from here, pointing down the arm
    arm.userData.hand = k.node(arm, 0, -2.8, 0.1);
    return arm;
  });
  return { root, body, hips, upper, head, legs, arms };
}

// A walk cycle at phase (radians), and back to standing.
export function walkPose(p, phase, { arms = true } = {}) {
  const swing = Math.sin(phase) * 0.6;
  p.legs[0].rotation.x = swing;
  p.legs[1].rotation.x = -swing;
  if (arms) {
    p.arms[0].rotation.x = -swing * 0.8;
    p.arms[1].rotation.x = swing * 0.8;
  }
  p.hips.position.y = 3 + Math.abs(Math.cos(phase)) * 0.25;
}
export function standPose(p) {
  for (const l of p.legs) l.rotation.set(0, 0, 0);
  for (const a of p.arms) a.rotation.set(0, 0, 0);
  p.upper.rotation.set(0, 0, 0);
  p.hips.position.y = 3;
}
export function sitPose(p) {
  standPose(p);
  for (const l of p.legs) l.rotation.x = -Math.PI / 2;
  p.hips.position.y = 1.2;
}

// Walks around a loop of world points at speed (world units per second); place(obj, t) puts it there,
// facing the way it goes. Returns the loop's length.
export function loop(points) {
  const segs = points.map((a, i) => {
    const b = points[(i + 1) % points.length];
    return { a, b, len: a.distanceTo(b) };
  });
  const total = segs.reduce((s, x) => s + x.len, 0);
  return {
    total,
    place(obj, dist) {
      let d = ((dist % total) + total) % total;
      for (const s of segs) {
        if (d <= s.len) {
          obj.position.lerpVectors(s.a, s.b, s.len ? d / s.len : 0);
          obj.rotation.y = Math.atan2(s.b.x - s.a.x, s.b.z - s.a.z);
          return;
        }
        d -= s.len;
      }
    },
  };
}

// A speech ('say') or thought ('think') bubble over a world point, as page text so it stays crisp.
export function bubble(map, text, kind = 'say') {
  const host = map.canvas.parentElement;
  const el = document.createElement('div');
  el.className = `zoomer-bubble is-${kind}`;
  el.textContent = text;
  el.hidden = true;
  host.appendChild(el);
  return {
    // show it over a world position, or hide it with null
    at(pos) {
      if (!pos) { el.hidden = true; return; }
      const p = map.toScreen(pos);
      el.hidden = p.behind;
      el.style.transform = `translate(${Math.round(p.x)}px, ${Math.round(p.y)}px) translate(-50%, -100%)`;
    },
    set(t) { el.textContent = t; },
    dispose() { el.remove(); },
  };
}

// The top of a person's head in world space, for a bubble.
export function headTop(p, out = new THREE.Vector3()) {
  return p.head.localToWorld(out.set(0, 2.4, 0));
}

// The nearest open tile (a street or plaza, no building on it, not water) to [lat, lng]: its middle in
// world space, its ground height, and the roof of a building beside it to stand in front of, if any.
// With clearView it also skips tiles hidden behind tall buildings to the south, where the camera sits.
export function openSpot(map, lat, lng, { maxRing = 6, clearView = false } = {}) {
  const c = latLngToCell(lat, lng);
  const c0 = Math.floor(c.col);
  const r0 = Math.floor(c.row);
  for (let ring = 0; ring <= maxRing; ring++) {
    for (let dr = -ring; dr <= ring; dr++) {
      for (let dc = -ring; dc <= ring; dc++) {
        if (Math.max(Math.abs(dr), Math.abs(dc)) !== ring) continue;
        const col = c0 + dc;
        const row = r0 + dr;
        if (map.rooftop(col, row)) continue;
        const x = col - COLS / 2 + 0.5;
        const z = row - ROWS / 2 + 0.5;
        const y = map.groundAt(x, z);
        if (y < 0.34 || y > 0.6) continue; // water, or a raised landmark
        // clearView: nothing tall just south of it, where the camera looks from
        if (clearView && [1, 2, 3].some((d) => [-1, 0, 1].some((e) => (map.rooftop(col + e, row + d)?.top ?? 0) > y + 0.8 * d))) continue;
        const beside = [[0, -1], [1, 0], [0, 1], [-1, 0]].map(([a, b]) => map.rooftop(col + a, row + b)).find(Boolean) ?? null;
        return { x, z, y, col, row, pos: new THREE.Vector3(x, y, z), beside };
      }
    }
  }
  return null;
}
