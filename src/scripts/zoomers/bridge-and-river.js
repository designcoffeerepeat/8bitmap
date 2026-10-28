// Zoomers on the bridges, the river and the rooftops:
//   Manhattan Bridge: a subway train rolls across with two "what time is it" kids dancing on its roof.
//   Hunters Point: a web-slinging hero in dark green swings twice between towers, lands on a lower roof, sits on the
//     ledge and thinks "ugh, responsibility."
//   Staten Island Ferry: the big orange ferry sails between Whitehall and St. George all day, docking at
//     each end, with people at the rails. It replaces the plain boat the renderer used to draw there.

import * as THREE from 'three';
import { watchZoomEgg } from '../zoom-egg.js';
import { BRIDGES, COLS, ROWS, latLngToWorld, latLngToCell } from '../map/geo.js';
import { kit, person, standPose, sitPose, bubble, headTop, VOX } from './kit.js';

const HUNTERS_POINT = [40.7448, -73.9555];
const DECK = 0.93; // top of the bridge decks (renderer.js buildBridges: 0.75 + 0.18)

export function initBridgeAndRiverZoomers(map) {
  const mb = BRIDGES.find((b) => b.name === 'Manhattan Bridge');
  if (mb) {
    const a = latLngToWorld(...mb.from);
    const b = latLngToWorld(...mb.to);
    const ends = [new THREE.Vector3(a.x, DECK, a.z), new THREE.Vector3(b.x, DECK, b.z)];
    watchZoomEgg(map, ends[0].clone().lerp(ends[1], 0.5), (m) => subwayDancers(m, ends));
  }
  const roofs = hunterPointRoofs(map);
  const hp = latLngToWorld(...HUNTERS_POINT);
  if (roofs) watchZoomEgg(map, new THREE.Vector3(hp.x, 1, hp.z), (m) => swinger(m, roofs));
  ferry(map);
}

// ---- the Manhattan Bridge train and its dancers -----------------------------------------------------
function subwayDancers(map, [a, b]) {
  const k = kit();
  const root = new THREE.Group();
  map.world.add(root);
  const CARS = 4;
  const CAR = 0.5; // world units
  const train = k.node(root);
  for (let i = 0; i < CARS; i++) {
    const car = k.node(train, 0, 0, -i * (CAR + 0.03));
    car.scale.setScalar(VOX);
    const L = CAR / VOX;
    k.box(car, 3.4, 3.4, L, 0, 1.9, 0, '#c9ccd6'); // the stainless body
    k.box(car, 3.45, 0.5, L + 0.05, 0, 2.3, 0, '#0039a6'); // the stripe
    for (let w = -L / 2 + 1.5; w < L / 2 - 1; w += 2.2) {
      k.box(car, 3.5, 1, 1.4, 0, 3, w, '#3a4566'); // windows
    }
    k.box(car, 3, 0.3, L - 0.4, 0, 3.75, 0, '#b0b4c0'); // the roof
    k.box(car, 3.6, 0.5, L - 1, 0, 0.3, 0, '#2b2b33'); // the trucks
    if (i === 0) {
      k.box(car, 2.4, 1.1, 0.1, 0, 3, L / 2 + 0.02, '#3a4566'); // front window
      k.box(car, 0.5, 0.5, 0.1, -1.1, 1.2, L / 2 + 0.02, '#fff3a0', true);
      k.box(car, 0.5, 0.5, 0.1, 1.1, 1.2, L / 2 + 0.02, '#fff3a0', true);
    }
  }
  // two kids on the roof of the second car, one spinning on his head, one flipping
  const roofY = 3.9 * VOX;
  const kids = [
    person(k, { scale: 0.8, skin: '#6b4226', top: '#ed1c24', bottom: '#2b2b33', shoe: '#ffffff', hat: 'cap', hatColor: '#141418' }),
    person(k, { scale: 0.8, skin: '#a8612f', top: '#ffd23f', bottom: '#4a5a7a', shoe: '#ffffff', hair: '#141418' }),
  ];
  kids.forEach((kid, i) => {
    const holder = k.node(train, (i ? 0.04 : -0.04), roofY, -(CAR + 0.03) * 1 + (i ? -0.1 : 0.1));
    holder.add(kid.root);
    kid.holder = holder;
  });

  const CROSS = 11; // seconds to cross
  const PAUSE = 1.5;
  const len = a.distanceTo(b);
  let t = 0;
  function step(dt) {
    t += dt;
    const lap = CROSS + PAUSE;
    const n = Math.floor(t / lap);
    const u = Math.min(1, (t % lap) / CROSS);
    const [from, to] = n % 2 ? [b, a] : [a, b];
    const dir = to.clone().sub(from).normalize();
    // the whole train, from just before one end to just past the other
    const head = from.clone().addScaledVector(dir, -CAR * CARS + u * (len + CAR * CARS * 2));
    train.position.copy(head);
    train.rotation.y = Math.atan2(dir.x, dir.z);
    const visible = u < 1;
    train.visible = visible;
    // the spinner
    const [spin, flip] = kids;
    standPose(spin);
    spin.root.rotation.set(Math.PI, t * 8, 0); // on his head
    spin.root.position.y = 7.6 * VOX * 0.8;
    for (const l of spin.legs) l.rotation.z = 0;
    spin.legs[0].rotation.x = 0.5;
    spin.legs[1].rotation.x = -0.5;
    spin.arms[0].rotation.z = 0.4;
    spin.arms[1].rotation.z = -0.4;
    // the flipper: a back flip every two seconds, a pose in between
    standPose(flip);
    const f = t % 2;
    const air = f < 0.7 ? f / 0.7 : 0;
    flip.root.position.y = Math.sin(air * Math.PI) * 0.12;
    flip.root.rotation.x = -air * Math.PI * 2;
    flip.arms[0].rotation.set(air ? -Math.PI : -0.3, 0, 0.3);
    flip.arms[1].rotation.set(air ? -Math.PI : -1.4 + Math.sin(t * 6) * 0.4, 0, -0.3);
  }
  step(0);
  return { step, dispose() { map.world.remove(root); k.dispose(); } };
}

// ---- Hunters Point -----------------------------------------------------------------------------------
// three roofs near Hunters Point South: the tallest to start on, another tall one to swing to, and a
// lower one beyond it to land on
function hunterPointRoofs(map) {
  // a couple of rows south of the spot, so the roofs (which stand tall on screen) sit mid-screen
  const c = latLngToCell(...HUNTERS_POINT);
  c.row += 2.5;
  const found = [];
  for (let dr = -3; dr <= 3; dr++) {
    for (let dc = -3; dc <= 3; dc++) {
      const roof = map.rooftop(Math.floor(c.col) + dc, Math.floor(c.row) + dr);
      if (roof) found.push({ ...roof, pos: new THREE.Vector3(roof.x, roof.top, roof.z) });
    }
  }
  if (found.length < 3) return null;
  const flat = (p, q) => Math.hypot(p.x - q.x, p.z - q.z);
  const here = { x: c.col - COLS / 2, z: c.row - ROWS / 2 };
  found.sort((x, y) => y.top - x.top);
  const start = found.find((r) => flat(r, here) < 3) ?? found[0];
  const mid = found.find((r) => r !== start && r.top > 1.2 && flat(r, start) > 1.2 && flat(r, start) < 3);
  if (!mid) return null;
  const dir = mid.pos.clone().sub(start.pos).setY(0).normalize();
  const end = found
    .filter((r) => r !== start && r !== mid && r.top < mid.top - 0.2 && r.top > 0.6 && flat(r, mid) > 0.9 && flat(r, mid) < 4)
    .map((r) => ({ r, score: r.pos.clone().sub(mid.pos).setY(0).normalize().dot(dir) - Math.abs(flat(r, mid) - 1.5) * 0.3 }))
    .sort((x, y) => y.score - x.score)[0]?.r;
  return end ? [start, mid, end] : null;
}

function swinger(map, [r0, r1, r2]) {
  const k = kit();
  const root = new THREE.Group();
  map.world.add(root);
  const hero = person(k, { skin: '#1f4a2c', top: '#1f4a2c', bottom: '#1f4a2c', legsColor: '#1f4a2c', shoe: '#1f4a2c', mask: '#1f4a2c', sleeves: '#1f4a2c', hands: '#1f4a2c' });
  k.box(hero.upper, 1.2, 1.2, 0.1, 0, 2.2, 0.62, '#e8e8ea'); // the emblem
  root.add(hero.root);
  const web = k.box(root, 0.008, 1, 0.008, 0, 0, 0, '#f4f4f2', true);
  const think = bubble(map, 'ugh, responsibility.', 'think');
  // stand in the middle of each roof, and sit on the last one's ledge facing back the way he came
  const p0 = r0.pos.clone();
  const p1 = r1.pos.clone();
  const dir2 = r2.pos.clone().sub(r1.pos).setY(0).normalize();
  const ledge = r2.pos.clone().addScaledVector(dir2, -(r2.size / 2 - 0.02));
  const SWING = 1.8;
  const T = { s1: 0.8, s2: 0.8 + SWING + 0.5, land: 0.8 + SWING * 2 + 0.5, sit: 0.8 + SWING * 2 + 1.3 };
  const hand = new THREE.Vector3();
  let t = 0;
  // one swing: a dip under an anchor point high above the middle of the gap
  const swing = (a, b, u) => {
    const p = a.clone().lerp(b, u);
    const top = Math.max(a.y, b.y) + 1.6;
    p.y -= Math.sin(u * Math.PI) * 0.6; // sags in the middle
    const anchor = a.clone().lerp(b, 0.5).setY(top);
    return { p, anchor };
  };
  function step(dt) {
    t += dt;
    standPose(hero);
    let anchor = null;
    if (t < T.s1) {
      hero.root.position.copy(p0);
      hero.root.rotation.y = Math.atan2(p1.x - p0.x, p1.z - p0.z);
      hero.legs[0].rotation.x = -0.4; // crouched to jump
      hero.hips.position.y = 2.4;
    } else if (t < T.s2 - 0.5) {
      const s = swing(p0, p1, (t - T.s1) / SWING);
      hero.root.position.copy(s.p);
      anchor = s.anchor;
    } else if (t < T.s2) {
      hero.root.position.copy(p1);
      hero.hips.position.y = 2.4;
    } else if (t < T.land) {
      const s = swing(p1, ledge, (t - T.s2) / SWING);
      hero.root.position.copy(s.p);
      hero.root.rotation.y = Math.atan2(ledge.x - p1.x, ledge.z - p1.z);
      anchor = s.anchor;
    } else {
      // sit on the ledge with his legs over the edge, looking out
      hero.root.position.copy(ledge);
      hero.root.rotation.y = Math.atan2(-dir2.x, -dir2.z);
      sitPose(hero);
      hero.hips.position.y = 0.2;
      hero.upper.rotation.x = 0.25; // slumped
      hero.arms[0].rotation.x = -0.5;
      hero.arms[1].rotation.x = -0.5;
    }
    if (anchor) {
      hero.arms[1].rotation.set(-Math.PI, 0, -0.2);
      hero.legs[0].rotation.x = 0.4;
      hero.legs[1].rotation.x = -0.3;
    }
    root.updateMatrixWorld(true);
    web.visible = !!anchor;
    if (anchor) {
      hero.arms[1].userData.hand.localToWorld(hand.set(0, 0, 0));
      web.position.copy(hand).lerp(anchor, 0.5);
      web.scale.y = hand.distanceTo(anchor);
      web.lookAt(anchor);
      web.rotateX(Math.PI / 2);
    }
    think.at(t > T.sit ? headTop(hero, hand) : null);
  }
  step(0);
  return { step, dispose() { map.world.remove(root); think.dispose(); k.dispose(); } };
}

// ---- the Staten Island Ferry ---------------------------------------------------------------------------
const WHITEHALL = [40.7005, -74.0135];
const ST_GEORGE = [40.6460, -74.0690];
const SAIL = 70; // seconds a crossing takes on the map
const DOCK = 8; // seconds at each terminal

function ferry(map) {
  const k = kit();
  const a = latLngToWorld(...WHITEHALL);
  const b = latLngToWorld(...ST_GEORGE);
  const from = new THREE.Vector3(a.x, 0.3, a.z);
  const to = new THREE.Vector3(b.x, 0.3, b.z);
  const boat = k.node(map.world);
  boat.rotation.y = Math.atan2(to.x - from.x, to.z - from.z);
  const hull = k.node(boat);
  hull.scale.setScalar(VOX);
  const L = 30; // voxels long, double-ended like the real ones
  const W = 9;
  k.box(hull, W, 2.4, L, 0, 1.2, 0, '#ff7a1a');
  k.box(hull, W - 1, 0.6, L - 4, 0, 2.7, 0, '#ff7a1a');
  k.box(hull, W + 0.2, 0.4, L + 0.2, 0, 0.2, 0, '#c8501a'); // the waterline
  // two decks of cabin with rows of windows, and a pilot house at each end
  for (const [y, w, l] of [[3.2, W - 1.2, L - 6], [5.4, W - 2, L - 10]]) {
    k.box(hull, w, 2, l, 0, y + 1, 0, '#ff8a2a');
    k.box(hull, w + 0.1, 0.8, l - 1, 0, y + 1.1, 0, '#3a4566');
  }
  for (const z of [-(L - 12) / 2, (L - 12) / 2]) {
    k.box(hull, 3.4, 1.6, 2.2, 0, 8.3, z, '#ffffff');
    k.box(hull, 3.5, 0.6, 2.3, 0, 8.5, z, '#3a4566');
  }
  k.box(hull, 0.6, 1.6, 0.6, 0, 8, 0, '#f4f4f2'); // the mast
  k.box(hull, 1.4, 0.8, 0.1, 0.3, 9.3, 0, '#2a5bd7'); // a flag
  // passengers along the open ends of the main deck
  const folks = ['#ed1c24', '#4dd2ff', '#ffd23f', '#7cf07c', '#ffffff', '#ff5c8a'];
  folks.forEach((hex, i) => {
    const z = (i % 2 ? 1 : -1) * (L / 2 - 2.6);
    const x = -2.4 + (i >> 1) * 2.4;
    k.box(hull, 0.8, 1.4, 0.8, x, 3.7, z, hex);
    k.box(hull, 0.7, 0.7, 0.7, x, 4.75, z, '#e3b08a');
  });
  const wake = [0, 1, 2, 3, 4].map(() => k.box(map.world, 0.12, 0.02, 0.12, 0, 0.31, 0, '#ffffff'));
  const lap = 2 * (SAIL + DOCK);
  map.onFrame((dt, t) => {
    const u = t % lap;
    let pos;
    let moving = 0;
    if (u < DOCK) pos = 0;
    else if (u < DOCK + SAIL) { pos = THREE.MathUtils.smootherstep(u, DOCK, DOCK + SAIL); moving = 1; }
    else if (u < DOCK * 2 + SAIL) pos = 1;
    else { pos = 1 - THREE.MathUtils.smootherstep(u, DOCK * 2 + SAIL, lap); moving = -1; }
    boat.position.lerpVectors(from, to, pos);
    boat.position.y = 0.3 + Math.sin(t * 1.4) * 0.006;
    boat.rotation.z = Math.sin(t * 0.9) * 0.01;
    // a short white wake behind whichever end is trailing
    const back = to.clone().sub(from).normalize().multiplyScalar(-moving);
    wake.forEach((w, i) => {
      w.visible = moving !== 0;
      w.position.copy(boat.position).addScaledVector(back, (L / 2) * VOX + 0.08 + i * 0.12);
      w.position.y = 0.31;
      w.position.x += Math.sin(t * 3 + i) * 0.02;
    });
  });
}
