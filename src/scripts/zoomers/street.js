// Zoomers out on the street, each starting when the map sits zoomed all the way in on its spot:
//   Fifth Avenue and 57th Street: Bill Cunningham in his blue jacket rides his bike and stops to take photos.
//   McCarren Park: a guy in a black cap and a blonde guy in sunglasses on beach chairs share a can of soda back and forth.
//   Museum of the Moving Image: a giant pigeon struts around outside.

import * as THREE from 'three';
import { watchZoomEgg } from '../zoom-egg.js';
import { latLngToWorld } from '../map/geo.js';
import { kit, person, standPose, sitPose, loop, openSpot, VOX, STRIDE, WALK } from './kit.js';

export function initStreetZoomers(map) {
  near(map, 40.7637, -73.9740, billCunningham);
  const park = latLngToWorld(40.7212, -73.9512);
  at(map, { pos: new THREE.Vector3(park.x, map.groundAt(park.x, park.z), park.z) }, mccarren);
  near(map, 40.7563, -73.9239, movingImage);
}

function at(map, spot, start) {
  if (spot) watchZoomEgg(map, spot.pos, (m) => start(m, spot));
}

// A scene on the open tile nearest [lat, lng], preferring one no tall building hides, that starts when
// the map is zoomed all the way in on [lat, lng] itself.
function near(map, lat, lng, start) {
  const spot = openSpot(map, lat, lng, { clearView: true, maxRing: 3 }) ?? openSpot(map, lat, lng);
  if (!spot) return;
  const p = latLngToWorld(lat, lng);
  watchZoomEgg(map, new THREE.Vector3(p.x, spot.y, p.z), (m) => start(m, spot));
}

// a group on the spot, turned so +z faces the building beside it
function stage(map, spot) {
  const root = new THREE.Group();
  root.position.copy(spot.pos);
  if (spot.beside) root.rotation.y = Math.atan2(spot.beside.x - spot.x, spot.beside.z - spot.z);
  map.world.add(root);
  return root;
}
// a local point on a stage, in world units
const v = (x, z, y = 0) => new THREE.Vector3(x, y, z);

// ---- Bill Cunningham -----------------------------------------------------------------------------
function billCunningham(map, spot) {
  const k = kit();
  const root = new THREE.Group();
  map.world.add(root);
  // ride between this tile and the next open one along the street, and back
  const ends = [spot.pos.clone()];
  for (const [dc, dr] of [[1, 0], [0, 1], [-1, 0], [0, -1]]) {
    if (!map.rooftop(spot.col + dc, spot.row + dr)) { ends.push(spot.pos.clone().add(v(dc * 0.9, dr * 0.9))); break; }
  }
  if (ends.length < 2) ends.push(spot.pos.clone().add(v(0.4, 0)));
  const bike = k.node(root);
  bike.scale.setScalar(VOX);
  for (const z of [-2, 2]) {
    k.box(bike, 0.4, 3, 3, 0, 1.5, z, '#1d1d22'); // tyre
    k.box(bike, 0.45, 2, 2, 0, 1.5, z, '#8c8fa3'); // spokes
  }
  k.box(bike, 0.3, 0.3, 4.2, 0, 2.8, 0, '#3a3a42'); // frame
  k.box(bike, 0.3, 1.6, 0.3, 0, 3.4, -1.2, '#3a3a42'); // seat post
  k.box(bike, 0.9, 0.3, 1.2, 0, 4.2, -1.2, '#1d1d22'); // saddle
  k.box(bike, 0.3, 1.8, 0.3, 0, 3.6, 1.8, '#3a3a42'); // stem
  k.box(bike, 2.4, 0.3, 0.3, 0, 4.5, 1.8, '#1d1d22'); // handlebars
  k.box(bike, 1.4, 1, 1.2, 0, 4.1, 2.4, '#8a5a32'); // basket
  const bill = person(k, { skin: '#f0c9a8', top: '#3b6fd1', bottom: '#c8b58a', shoe: '#2b2b30', hair: '#f4f4f2' });
  bill.root.position.set(0, 1.4 * VOX, -1.2 * VOX);
  root.add(bill.root);
  k.box(bill.arms[1].userData.hand, 1, 0.7, 0.7, 0, 0.1, 0.3, '#1d1d22');
  const flash = k.box(bill.arms[1].userData.hand, 0.5, 0.3, 0.2, 0, 0.15, 0.72, '#ffffff', true);
  flash.visible = false;

  const RIDE = 3.2; // seconds per ride from end to end
  const SNAP = 2.2; // seconds stopped for a photo
  let t = 0;
  function step(dt) {
    t += dt;
    const lap = RIDE + SNAP;
    const n = Math.floor(t / lap);
    const u = t % lap;
    const a = ends[n % 2];
    const b = ends[(n + 1) % 2];
    const heading = Math.atan2(b.x - a.x, b.z - a.z);
    const riding = u < RIDE;
    root.position.lerpVectors(a, b, riding ? THREE.MathUtils.smoothstep(u, 0, RIDE) : 1);
    root.rotation.y = heading;
    standPose(bill);
    const pedal = t * 7;
    bill.legs[0].rotation.x = -1.2 + Math.sin(pedal) * (riding ? 0.5 : 0);
    bill.legs[1].rotation.x = -1.2 - Math.sin(pedal) * (riding ? 0.5 : 0);
    bill.hips.position.y = 3;
    if (riding) {
      bill.upper.rotation.x = 0.35;
      bill.arms[0].rotation.x = -1.1;
      bill.arms[1].rotation.x = -1.1;
      flash.visible = false;
    } else {
      // turn to a passer-by and take the shot
      bill.upper.rotation.set(0, 0.9, 0);
      bill.arms[1].rotation.set(-Math.PI / 2 - 0.4, 0, 0.4);
      bill.arms[0].rotation.set(-Math.PI / 2 - 0.4, 0, -0.4);
      const s = u - RIDE;
      flash.visible = s > 1 && s < 1.15;
    }
  }
  step(0);
  return { step, dispose() { map.world.remove(root); k.dispose(); } };
}

// ---- McCarren Park -------------------------------------------------------------------------------
function mccarren(map, spot) {
  const k = kit();
  const root = new THREE.Group();
  root.position.copy(spot.pos);
  map.world.add(root);
  const chair = (x, stripes) => {
    const c = k.node(root, x, 0, 0);
    c.scale.setScalar(VOX);
    for (let i = 0; i < 4; i++) k.box(c, 2.6, 0.3, 0.7, 0, 1.2, -1 + i * 0.7, stripes[i % 2]);
    const back = k.node(c, 0, 1.2, -1.4);
    back.rotation.x = -0.5;
    for (let i = 0; i < 4; i++) k.box(back, 2.6, 0.7, 0.3, 0, 0.4 + i * 0.7, 0, stripes[i % 2]);
    for (const [lx, lz] of [[-1.2, -1], [1.2, -1], [-1.2, 1.2], [1.2, 1.2]]) k.box(c, 0.2, 1.2, 0.2, lx, 0.6, lz, '#c9c9cf');
    return c;
  };
  const SEAT = 0.25; // each chair's middle from the pair's middle: a chair's width apart, so the pass shows
  chair(-SEAT, ['#ff5c8a', '#ffffff']);
  chair(SEAT, ['#4dd2ff', '#ffffff']);
  const cap = person(k, { skin: '#d9a27a', top: '#5d6470', bottom: '#2b3a5a', hat: 'cap', hatColor: '#141418' });
  const blond = person(k, { skin: '#f0c9a8', top: '#ffffff', bottom: '#4a5a7a', hair: '#f1d36b', glasses: '#141418' });
  const pals = [cap, blond];
  pals.forEach((p, i) => {
    root.add(p.root);
    p.root.position.set(i ? SEAT : -SEAT, 0, 0);
    p.root.rotation.y = i ? -0.35 : 0.35; // turned a little toward each other
    sitPose(p);
    p.upper.rotation.x = -0.45; // leaning back
  });
  // a can of soda, big enough to see at full zoom
  const can = k.node(root);
  k.box(can, 0.032, 0.05, 0.032, 0, 0, 0, '#ed1c24');
  k.box(can, 0.033, 0.008, 0.033, 0, 0.026, 0, '#c9c9cf');
  const from = new THREE.Vector3();
  const to = new THREE.Vector3();
  const hand = (p, i, out) => {
    p.arms[i ? 0 : 1].userData.hand.localToWorld(out.set(0, 0, 0.3));
    return root.worldToLocal(out);
  };
  const ease = THREE.MathUtils.smoothstep;
  let t = 0;
  // Each turn: raise it and take a sip (0 to 1.8 s), sit back (to 3), then both lean in and reach across
  // (3 to 3.6), the can goes hand to hand (3.6 to 4.4) and the other one sits back with it (to 5).
  const TURN = 5;
  function step(dt) {
    t += dt;
    const n = Math.floor(t / TURN) % 2;
    const u = t % TURN;
    const reach = ease(u, 3, 3.6) * (1 - ease(u, 4.4, 5));
    const slide = ease(u, 3.6, 4.4);
    pals.forEach((p, i) => {
      sitPose(p);
      p.upper.rotation.x = -0.45;
      p.upper.rotation.z = (i ? 1 : -1) * reach * 0.35; // leaning in toward the other chair
      const side = i ? -1 : 1;
      const up = i === n ? ease(u, 0, 0.5) * (1 - ease(u, 1.3, 1.8)) : 0;
      p.arms[i ? 0 : 1].rotation.set(-0.6 - up * 1.8 + reach * 0.35, 0, side * (0.2 + reach * 1.35));
    });
    root.updateMatrixWorld(true);
    hand(pals[n], n, from);
    hand(pals[1 - n], 1 - n, to);
    can.position.lerpVectors(from, to, slide);
  }
  step(0);
  return { step, dispose() { map.world.remove(root); k.dispose(); } };
}

// ---- Museum of the Moving Image ------------------------------------------------------------------
function movingImage(map, spot) {
  const k = kit();
  const root = new THREE.Group();
  root.position.copy(spot.pos);
  map.world.add(root);

  // a giant New York pigeon: plump and gray, with a shimmering green and purple neck and pink feet
  const bird = k.node(root);
  const bb = k.node(bird);
  bb.scale.setScalar(VOX);
  const birdLegs = [-0.7, 0.7].map((x) => {
    const leg = k.node(bb, x, 1.8, 0);
    k.box(leg, 0.4, 1.8, 0.4, 0, -0.9, 0, '#e8828f');
    k.box(leg, 0.9, 0.3, 1.4, 0, -1.7, 0.3, '#e8828f');
    return leg;
  });
  const torso = k.node(bb, 0, 1.8, 0);
  k.box(torso, 3.2, 2.8, 4.4, 0, 1.6, -0.2, '#8e939c');
  k.box(torso, 3, 0.8, 4, 0, 0.2, -0.2, '#6f747d');
  k.box(torso, 2, 1, 1.6, 0, 2.2, -2.9, '#4a4e57'); // tail
  const neck = k.node(torso, 0, 2.6, 1.6);
  k.box(neck, 2, 1.4, 1.6, 0, 0.6, 0, '#3f9a72'); // the shimmering neck
  k.box(neck, 2.05, 0.6, 1.65, 0, 0.2, 0, '#7a4f9e');
  k.box(neck, 1.8, 1.8, 1.8, 0, 2, 0.2, '#8e939c'); // head
  k.box(neck, 0.6, 0.4, 0.9, 0, 1.8, 1.4, '#3b3f57'); // beak
  k.box(neck, 0.4, 0.4, 0.1, -0.5, 2.3, 1.12, '#ff8a1f'); // orange eyes
  k.box(neck, 0.4, 0.4, 0.1, 0.5, 2.3, 1.12, '#ff8a1f');
  const wings = [-1, 1].map((side) => {
    const w = k.node(torso, side * 1.7, 2.8, 0);
    k.box(w, 0.4, 2.4, 3.6, 0, -1.2, -0.4, '#6f747d');
    k.box(w, 0.42, 0.4, 3.2, 0, -1.6, -0.4, '#2b2e35'); // wing bars
    return w;
  });

  // a loop around the museum's front
  const r = 0.32;
  const path = loop([v(-r, -r), v(r, -r), v(r, r), v(-r, r)]);
  let t = 0;
  function step(dt) {
    t += dt;
    const d = t * WALK * VOX * 0.8;
    path.place(bird, d);
    const ph = (t / STRIDE) * Math.PI * 2;
    birdLegs[0].rotation.x = Math.sin(ph) * 0.5;
    birdLegs[1].rotation.x = -Math.sin(ph) * 0.5;
    torso.position.y = 1.8 + Math.abs(Math.cos(ph)) * 0.2;
    neck.position.z = 1.6 + Math.sin(ph) * 0.4; // the pigeon head bob
    wings[0].rotation.z = 0.15 + Math.max(0, Math.sin(t * 1.3)) * 0.6;
    wings[1].rotation.z = -wings[0].rotation.z;
  }
  step(0);
  return { step, dispose() { map.world.remove(root); k.dispose(); } };
}
