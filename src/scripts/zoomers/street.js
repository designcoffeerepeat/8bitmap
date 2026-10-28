// Zoomers out on the street, each starting when the map sits zoomed all the way in on its spot:
//   Carroll Gardens: a woman dressed all in green waters the planters in front of a building.
//   Fifth Avenue and 57th Street: Bill Cunningham in his blue jacket rides his bike and stops to take photos.
//   City Hall: the Rent Is Too Damn High guy, in black gloves and white whiskers, says so.
//   McCarren Park: a guy in a cap and a blonde guy in sunglasses on beach chairs pass a joint back and forth.
//   Museum of the Moving Image: a big turquoise bird and a gray elephant stroll around outside.

import * as THREE from 'three';
import { watchZoomEgg } from '../zoom-egg.js';
import { latLngToWorld } from '../map/geo.js';
import { kit, person, walkPose, standPose, sitPose, loop, bubble, headTop, openSpot, VOX, STRIDE, WALK } from './kit.js';

export function initStreetZoomers(map) {
  near(map, 40.6795, -73.9992, carrollGardens);
  near(map, 40.7637, -73.9740, billCunningham);
  near(map, 40.7118, -74.0062, rentGuy);
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

// ---- Carroll Gardens -----------------------------------------------------------------------------
function carrollGardens(map, spot) {
  const k = kit();
  const root = stage(map, spot);
  const GREEN = '#2e9d4a';
  const pots = [-0.28, 0, 0.28].map((x, i) => {
    const pot = k.node(root, x, 0, 0.36);
    pot.scale.setScalar(VOX);
    k.box(pot, 3, 1.6, 2, 0, 0.8, 0, '#8a5a32');
    k.box(pot, 2.6, 1.2, 1.6, 0, 2.1, 0, '#3f9b3a');
    for (const [fx, fz] of [[-0.8, 0.3], [0.2, -0.4], [0.9, 0.4]]) k.box(pot, 0.5, 0.5, 0.5, fx, 2.9, fz, ['#ff5c8a', '#ffd23f', '#ffffff'][(i + fx > 0 ? 1 : 0) % 3]);
    return pot;
  });
  k.box(k.node(root), 0.9, 0.04, 0.12, 0, 0.02, 0.36, '#6a4a30'); // the bed the pots stand in
  const her = person(k, { skin: '#f0c9a8', top: GREEN, bottom: GREEN, shoe: '#1f6b33', hair: '#a0522d', hairStyle: 'long', hat: 'beanie', hatColor: GREEN });
  root.add(her.root);
  const can = k.node(her.arms[1].userData.hand, 0, -0.3, 0.6);
  k.box(can, 1.4, 1.3, 1.2, 0, 0, 0, '#1f6b33');
  k.box(can, 0.3, 0.3, 1.4, 0, 0.3, 1.1, '#1f6b33'); // spout
  const drops = [0, 1, 2, 3].map(() => k.box(root, 0.012, 0.03, 0.012, 0, 0, 0, '#4dd2ff', true));

  const stops = pots.map((p) => v(p.position.x, 0.17));
  let t = 0;
  const seg = 4.2; // seconds at each pot: walk over, then water
  function step(dt) {
    t += dt;
    const n = Math.floor(t / seg);
    const u = t % seg;
    const from = stops[(n + stops.length - 1) % stops.length];
    const to = stops[n % stops.length];
    const walking = u < 1.2;
    standPose(her);
    if (walking) {
      her.root.position.lerpVectors(from, to, u / 1.2);
      her.root.rotation.y = to.x > from.x ? Math.PI / 2 : -Math.PI / 2;
      walkPose(her, (u / STRIDE) * Math.PI * 2, { arms: false });
      her.arms[1].rotation.x = -0.3;
    } else {
      her.root.position.copy(to);
      her.root.rotation.y = 0;
      const tip = THREE.MathUtils.smoothstep(u, 1.3, 1.8) - THREE.MathUtils.smoothstep(u, seg - 0.5, seg - 0.1);
      her.arms[1].rotation.x = -0.4 - tip * 0.9;
      can.rotation.x = tip * 0.7;
      her.upper.rotation.x = tip * 0.25;
    }
    // water runs from the spout while the can is tipped
    root.updateMatrixWorld(true);
    const spout = root.worldToLocal(can.localToWorld(new THREE.Vector3(0, 0.3, 1.8)));
    drops.forEach((d, i) => {
      const ph = (t * 2.2 + i / drops.length) % 1;
      d.visible = !walking && can.rotation.x > 0.5;
      d.position.set(spout.x, Math.max(0.08, spout.y - ph * 0.2), spout.z + ph * 0.03);
    });
  }
  step(0);
  return { step, dispose() { map.world.remove(root); k.dispose(); } };
}

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

// ---- the Rent Is Too Damn High guy ---------------------------------------------------------------
function rentGuy(map, spot) {
  const k = kit();
  const root = new THREE.Group();
  root.position.copy(spot.pos);
  map.world.add(root);
  const man = person(k, { skin: '#6b4226', top: '#1d1d22', bottom: '#1d1d22', shoe: '#141418', hair: '#f4f4f2', hairStyle: 'bald', hands: '#141418' });
  root.add(man.root);
  // the white whiskers and moustache
  k.box(man.head, 0.4, 1, 0.5, -0.75, 0.35, 0.45, '#f4f4f2');
  k.box(man.head, 0.4, 1, 0.5, 0.75, 0.35, 0.45, '#f4f4f2');
  k.box(man.head, 1.4, 0.3, 0.2, 0, 0.45, 0.86, '#f4f4f2');
  k.box(man.upper, 0.5, 1.6, 0.1, 0, 2.2, 0.62, '#f4f4f2'); // shirt front
  const say = bubble(map, 'Rent is Too Damn High!', 'say');
  const head = new THREE.Vector3();
  let t = 0;
  function step(dt) {
    t += dt;
    standPose(man);
    const c = t % 6;
    const talking = c > 0.6 && c < 4.4;
    man.root.rotation.y = Math.sin(t * 0.5) * 0.4;
    if (talking) {
      man.arms[1].rotation.set(-Math.PI * 0.85 + Math.sin(t * 6) * 0.15, 0, -0.2); // fist up
      man.arms[0].rotation.set(-0.6 + Math.sin(t * 6 + 1) * 0.2, 0, 0.2);
      man.hips.position.y = 3 + Math.abs(Math.sin(t * 6)) * 0.15;
    }
    root.updateMatrixWorld(true);
    say.at(talking ? headTop(man, head) : null);
  }
  step(0);
  return { step, dispose() { map.world.remove(root); say.dispose(); k.dispose(); } };
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
  chair(-0.09, ['#ff5c8a', '#ffffff']);
  chair(0.09, ['#4dd2ff', '#ffffff']);
  const cap = person(k, { skin: '#d9a27a', top: '#5d6470', bottom: '#2b3a5a', hat: 'cap', hatColor: '#ed1c24' });
  const blond = person(k, { skin: '#f0c9a8', top: '#ffffff', bottom: '#4a5a7a', hair: '#f1d36b', glasses: '#141418' });
  const pals = [cap, blond];
  pals.forEach((p, i) => {
    root.add(p.root);
    p.root.position.set(i ? 0.09 : -0.09, 0, 0);
    p.root.rotation.y = i ? -0.35 : 0.35; // turned a little toward each other
    sitPose(p);
    p.upper.rotation.x = -0.45; // leaning back
  });
  const joint = k.box(root, 0.008, 0.008, 0.04, 0, 0, 0, '#f4f4f2');
  const tip = k.box(root, 0.01, 0.01, 0.01, 0, 0, 0, '#ff8a1f', true);
  const puffs = [0, 1, 2].map(() => k.box(root, 0.03, 0.03, 0.03, 0, 0, 0, '#dcdce4'));
  const hand = new THREE.Vector3();
  let t = 0;
  const TURN = 4; // seconds each holds it: a puff, a breath out, then pass
  function step(dt) {
    t += dt;
    const n = Math.floor(t / TURN) % 2;
    const u = t % TURN;
    pals.forEach((p, i) => {
      sitPose(p);
      p.upper.rotation.x = -0.45;
      if (i === n) {
        const up = u < 1.2 ? THREE.MathUtils.smoothstep(u, 0, 0.5) : u < 3.2 ? 1 - THREE.MathUtils.smoothstep(u, 1.2, 1.7) : 0;
        p.arms[i ? 0 : 1].rotation.set(-0.6 - up * 1.8, 0, (i ? -1 : 1) * (u > 3.2 ? 0.9 : 0.2));
      } else {
        // reaching over for it at the end of the other's turn
        const reach = THREE.MathUtils.smoothstep(u, 3.1, 3.6);
        p.arms[i ? 0 : 1].rotation.set(-0.6 - reach * 0.4, 0, (i ? -1 : 1) * reach * 0.9);
      }
    });
    root.updateMatrixWorld(true);
    const holder = pals[n];
    holder.arms[n ? 0 : 1].userData.hand.localToWorld(hand.set(0, 0, 0.3));
    root.worldToLocal(hand);
    joint.position.copy(hand);
    tip.position.copy(hand).add(v(0, 0.025, 0.006));
    // the smoke after a puff, drifting up
    puffs.forEach((pf, i) => {
      const s = u - 1.3 - i * 0.35;
      pf.visible = s > 0 && s < 1.6;
      if (!pf.visible) return;
      holder.head.localToWorld(pf.position.set(0, 0.6, 1.2));
      root.worldToLocal(pf.position);
      pf.position.y += s * 0.08;
      pf.position.x += Math.sin(s * 3 + i) * 0.01;
      pf.scale.setScalar(0.02 + s * 0.02);
    });
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

  // the big turquoise bird: tall, feathery, orange legs and beak
  const bird = k.node(root);
  const bb = k.node(bird);
  bb.scale.setScalar(VOX);
  const birdLegs = [-0.7, 0.7].map((x) => {
    const leg = k.node(bb, x, 4.2, 0);
    k.box(leg, 0.4, 4.2, 0.4, 0, -2.1, 0, '#ff8a1f');
    k.box(leg, 0.9, 0.3, 1.4, 0, -4.1, 0.3, '#ff8a1f');
    return leg;
  });
  const torso = k.node(bb, 0, 4.2, 0);
  k.box(torso, 3.6, 3.6, 3.2, 0, 1.8, 0, '#2ec4b6');
  k.box(torso, 3.2, 1, 3, 0, 0.1, 0, '#21a396');
  const neck = k.node(torso, 0, 3.4, 0.8);
  k.box(neck, 1.4, 3, 1.4, 0, 1.5, 0, '#2ec4b6');
  k.box(neck, 2.2, 2, 2, 0, 3.6, 0.1, '#2ec4b6'); // head
  k.box(neck, 1.2, 0.5, 1.4, 0, 3.2, 1.6, '#ff8a1f'); // beak
  k.box(neck, 0.5, 0.5, 0.2, -0.5, 4, 1.15, '#ffffff');
  k.box(neck, 0.5, 0.5, 0.2, 0.5, 4, 1.15, '#ffffff');
  k.box(neck, 0.25, 0.25, 0.1, -0.5, 4, 1.26, '#1d2340');
  k.box(neck, 0.25, 0.25, 0.1, 0.5, 4, 1.26, '#1d2340');
  for (const x of [-0.6, 0, 0.6]) k.box(neck, 0.3, 0.9, 0.3, x, 4.9, 0, '#2ec4b6'); // head feathers
  const wings = [-1, 1].map((side) => {
    const w = k.node(torso, side * 1.9, 3, 0);
    k.box(w, 0.4, 2.8, 2.4, 0, -1.4, 0, '#21a396');
    return w;
  });

  // the gray elephant: four legs, big ears, long trunk, little tusks
  const ele = k.node(root);
  const eb = k.node(ele);
  eb.scale.setScalar(VOX);
  const eleLegs = [[-1.2, -2], [1.2, -2], [-1.2, 2], [1.2, 2]].map(([x, z]) => {
    const leg = k.node(eb, x, 2.4, z);
    k.box(leg, 1.3, 2.4, 1.3, 0, -1.2, 0, '#7d8288');
    return leg;
  });
  k.box(eb, 3.8, 3, 6, 0, 3.6, 0, '#9aa0a6');
  const ehead = k.node(eb, 0, 4.2, 3.4);
  k.box(ehead, 2.6, 2.6, 2, 0, 0.4, 0.4, '#9aa0a6');
  for (const x of [-1.9, 1.9]) k.box(ehead, 0.4, 2.6, 1.8, x, 0.6, 0, '#7d8288'); // ears
  k.box(ehead, 0.3, 0.3, 0.1, -0.6, 0.9, 1.42, '#1d2340'); // eyes
  k.box(ehead, 0.3, 0.3, 0.1, 0.6, 0.9, 1.42, '#1d2340');
  for (const x of [-0.7, 0.7]) k.box(ehead, 0.3, 0.3, 0.9, x, -0.6, 1.6, '#f4f1e8'); // tusks
  const trunk = k.node(ehead, 0, 0, 1.4);
  k.box(trunk, 0.8, 3, 0.8, 0, -1.4, 0.2, '#7d8288');

  // a loop around the museum's front
  const r = 0.32;
  const path = loop([v(-r, -r), v(r, -r), v(r, r), v(-r, r)]);
  let t = 0;
  function step(dt) {
    t += dt;
    const d = t * WALK * VOX * 0.8;
    path.place(bird, d);
    path.place(ele, d - 0.32);
    const ph = (t / STRIDE) * Math.PI * 2;
    birdLegs[0].rotation.x = Math.sin(ph) * 0.5;
    birdLegs[1].rotation.x = -Math.sin(ph) * 0.5;
    torso.position.y = 4.2 + Math.abs(Math.cos(ph)) * 0.3;
    neck.rotation.x = Math.sin(ph) * 0.12;
    wings[0].rotation.z = 0.15 + Math.max(0, Math.sin(t * 1.3)) * 0.6;
    wings[1].rotation.z = -wings[0].rotation.z;
    eleLegs.forEach((l, i) => { l.rotation.x = Math.sin(ph * 0.7 + (i % 3 ? Math.PI : 0)) * 0.35; });
    trunk.rotation.x = Math.sin(t * 1.7) * 0.3;
    trunk.rotation.z = Math.sin(t * 1.1) * 0.25;
  }
  step(0);
  return { step, dispose() { map.world.remove(root); k.dispose(); } };
}
