// Rooftop grill easter egg. Zoom all the way in on the Upper West Side and a guy with dark
// hair in a white tank top steps out of the stairwell onto a rooftop, lifts the lid on his
// kettle grill and gets to work flipping burgers while the smoke rolls off. Zooming back out
// to about the default view clears it so he comes out again next time.

import * as THREE from 'three';
import { latLngToCell } from './map/geo.js';
import { watchZoomEgg } from './zoom-egg.js';

const UWS = latLngToCell(40.7860, -73.9770); // the Upper West Side, a few blocks off the park
const VOX = 0.045; // world units per voxel, the same scale as the other full-zoom scenes
const WALK = 4.5; // voxels per second
const STRIDE = 0.55; // seconds per pair of steps
const FLIP_EVERY = 3.2; // seconds between burger flips
const PUFFS = 6;

const C = {
  skin: '#d9a27a', hair: '#2a1a12', tank: '#f4f4f2', shorts: '#5d6470', shoe: '#2b2b30',
  grill: '#1d1d22', grillHi: '#3a3a42', grate: '#8c8fa3', coal: '#ff8a1f', ember: '#ed1c24',
  patty: '#6b3b22', pattyHi: '#8a5232', bun: '#e8b56a', spatula: '#c9c9cf', handle: '#5a3a22',
  door: '#a9a39a', doorDark: '#5a5d72', cooler: '#4dd2ff', coolerLid: '#ffffff',
  smoke: ['#e8e8ec', '#cfcfd6', '#b6b6c0'],
};

const BOX = new THREE.BoxGeometry(1, 1, 1);

export function initRooftopGrill(map) {
  const roof = findRoof(map);
  if (!roof) return;
  watchZoomEgg(map, new THREE.Vector3(roof.x, roof.top, roof.z), (m) => startScene(m, roof));
}

// the nearest plain, mid-rise roof to the middle of the UWS that is big enough for a cookout
function findRoof(map) {
  const c0 = Math.floor(UWS.col);
  const r0 = Math.floor(UWS.row);
  for (let ring = 0; ring < 6; ring++) {
    for (let dr = -ring; dr <= ring; dr++) {
      for (let dc = -ring; dc <= ring; dc++) {
        if (Math.max(Math.abs(dr), Math.abs(dc)) !== ring) continue;
        const roof = map.rooftop(c0 + dc, r0 + dr);
        if (roof && roof.bare && roof.size >= 0.7 && roof.top > 1.4 && roof.top < 3.2) return roof;
      }
    }
  }
  return null;
}

function startScene(map, roof) {
  const scene = buildScene();
  scene.root.position.set(roof.x, roof.top, roof.z);
  map.world.add(scene.root);
  const { man } = scene;

  // in roof voxels: out of the stairwell door, round to the far side of the grill
  const path = [new THREE.Vector3(-2, 0, -2.9), new THREE.Vector3(-0.2, 0, -1.6), new THREE.Vector3(1, 0, -1.1)];
  const legs = [];
  let walkTime = 0;
  for (let i = 1; i < path.length; i++) {
    const d = path[i].distanceTo(path[i - 1]) / WALK;
    legs.push({ from: path[i - 1], to: path[i], t0: walkTime, d });
    walkTime += d;
  }
  const T = { turn: walkTime, lid: walkTime + 0.4, cook: walkTime + 1.4 };

  const puffs = scene.puffs.map((p, i) => ({ mesh: p, age: (i / PUFFS) * 2.4 }));
  let t = 0;

  function step(dt) {
    t += dt;

    // smoke, whenever the lid is off
    const smoking = t > T.lid;
    for (const p of puffs) {
      p.age += dt;
      if (p.age > 2.4) p.age -= 2.4;
      const k = p.age / 2.4;
      p.mesh.visible = smoking && k > 0.02;
      p.mesh.position.set(1.5 + Math.sin(p.age * 2 + p.mesh.id) * 0.4 + k * 4.5, 4.3 + k * 8, 1.6 - k * 2);
      p.mesh.scale.setScalar(0.4 + Math.sin(k * Math.PI) * 0.6);
    }

    if (t < T.turn) {
      const leg = legs.find((l) => t < l.t0 + l.d) ?? legs[legs.length - 1];
      const k = Math.min(1, (t - leg.t0) / leg.d);
      man.root.position.lerpVectors(leg.from, leg.to, k);
      man.root.rotation.y = Math.atan2(leg.to.x - leg.from.x, leg.to.z - leg.from.z);
      const swing = Math.sin((t / STRIDE) * Math.PI * 2) * 0.6;
      man.legs[0].rotation.x = swing;
      man.legs[1].rotation.x = -swing;
      man.arms[0].rotation.x = -swing * 0.8;
      man.arms[1].rotation.x = swing * 0.8;
      man.hips.position.y = 3 + Math.abs(Math.cos((t / STRIDE) * Math.PI * 2)) * 0.25;
      return;
    }

    const last = legs[legs.length - 1];
    man.root.position.copy(last.to);
    for (const l of man.legs) l.rotation.x = 0;
    man.hips.position.y = 3;
    // turn to face the grill, then lift the lid off and hang it on the side
    const turn = THREE.MathUtils.smoothstep(t, T.turn, T.lid);
    man.root.rotation.y = THREE.MathUtils.lerp(Math.atan2(last.to.x - last.from.x, last.to.z - last.from.z), 0, turn);
    const lid = THREE.MathUtils.smoothstep(t, T.lid, T.cook);
    scene.lid.rotation.z = -lid * 1.9;
    man.arms[0].rotation.x = -Math.sin(lid * Math.PI) * 1.2;

    if (t < T.cook) {
      man.arms[1].rotation.x = 0;
      return;
    }
    // cooking: spatula hand works the grill, and every few seconds a burger goes up and over
    const c = t - T.cook;
    const cycle = c % FLIP_EVERY;
    const which = Math.floor(c / FLIP_EVERY) % scene.patties.length;
    const flip = THREE.MathUtils.clamp((cycle - 0.4) / 0.6, 0, 1);
    man.arms[1].rotation.x = -0.9 - Math.sin(flip * Math.PI) * 0.6 + Math.sin(c * 5) * 0.05 * (1 - flip);
    man.arms[0].rotation.x = -0.4;
    man.head.rotation.x = 0.25;
    scene.patties.forEach((p, i) => {
      const base = p.userData.base;
      if (i === which && flip > 0 && flip < 1) {
        p.position.y = base.y + Math.sin(flip * Math.PI) * 2.2;
        p.rotation.x = p.userData.side + flip * Math.PI;
      } else {
        p.position.y = base.y;
        if (i === which && flip >= 1) p.userData.side = (p.userData.side + Math.PI) % (Math.PI * 2);
        p.rotation.x = p.userData.side;
      }
    });
    // coals glow
    scene.coals.forEach((m, i) => { m.visible = Math.sin(t * 6 + i * 1.7) > -0.6; });
  }

  step(0);
  return {
    step,
    dispose() {
      map.world.remove(scene.root);
      scene.dispose();
    },
  };
}

// ---------------------------------------------------------------------------
// the roof set: stairwell door, kettle grill, cooler, smoke, and the guy. In roof voxels,
// with the roof top at y = 0.

function buildScene() {
  const mats = new Map();
  const mat = (hex) => {
    // drawn after the pins, like the other full-zoom scenes, so a pin never covers him
    if (!mats.has(hex)) mats.set(hex, new THREE.MeshLambertMaterial({ color: hex, flatShading: true, transparent: true }));
    return mats.get(hex);
  };
  const box = (parent, w, h, d, x, y, z, hex) => {
    const m = new THREE.Mesh(BOX, mat(hex));
    m.renderOrder = 30;
    m.scale.set(w, h, d);
    m.position.set(x, y, z);
    parent.add(m);
    return m;
  };
  const node = (parent, x, y, z) => {
    const g = new THREE.Group();
    g.position.set(x, y, z);
    parent.add(g);
    return g;
  };

  const root = new THREE.Group();
  const set = node(root, 0, 0, 0);
  set.scale.setScalar(VOX);

  // stairwell bulkhead with its door open
  box(set, 4, 5.4, 4, -4.5, 2.7, -4.5, C.door);
  box(set, 0.2, 3.6, 1.8, -2.45, 1.8, -2.9, C.doorDark);

  // kettle grill on three legs, lid hinged on the side
  const grill = node(set, 1, 0, 1.6);
  for (const [x, z] of [[-1, -0.8], [1, -0.8], [0, 1.1]]) box(grill, 0.3, 2.4, 0.3, x, 1.2, z, C.grillHi);
  box(grill, 3.4, 1.4, 3.4, 0, 2.9, 0, C.grill);
  box(grill, 2.6, 0.5, 2.6, 0, 2.1, 0, C.grill);
  const coals = [[-0.8, -0.6], [0.6, -0.8], [-0.2, 0.7], [0.9, 0.5]].map(([x, z], i) => box(grill, 0.6, 0.2, 0.6, x, 3.5, z, i % 2 ? C.coal : C.ember));
  box(grill, 3, 0.1, 3, 0, 3.62, 0, C.grate);
  const patties = [[-0.75, -0.6], [0.75, -0.6], [0, 0.8]].map(([x, z]) => {
    const p = node(grill, x, 3.8, z);
    box(p, 1.2, 0.2, 1.2, 0, 0.1, 0, C.patty);
    box(p, 1.2, 0.2, 1.2, 0, -0.1, 0, C.pattyHi);
    p.userData = { base: p.position.clone(), side: 0 };
    return p;
  });
  const lid = node(grill, 1.7, 3.6, 0);
  box(lid, 3.4, 1.3, 3.4, -1.7, 0.65, 0, C.grill);
  box(lid, 0.6, 0.4, 0.6, -1.7, 1.5, 0, C.grillHi);

  // a cooler and a plate of buns
  box(set, 2.4, 1.6, 1.6, 4.4, 0.8, -1.2, C.cooler);
  box(set, 2.4, 0.4, 1.6, 4.4, 1.8, -1.2, C.coolerLid);
  box(set, 1.2, 0.5, 1.2, 4.4, 2.25, -1.2, C.bun);

  // smoke puffs, reused as they drift off
  const puffs = [];
  for (let i = 0; i < PUFFS; i++) puffs.push(box(set, 1, 1, 1, 0, 0, 0, C.smoke[i % C.smoke.length]));

  // the guy: dark hair, white tank top, grey shorts, bare arms. Faces +z.
  const manRoot = node(set, 0, 0, 0);
  const hips = node(manRoot, 0, 3, 0);
  const legs = [-1, 1].map((side) => {
    const leg = node(hips, side * 0.55, 0, 0);
    box(leg, 0.95, 1.4, 1, 0, -0.6, 0, C.shorts);
    box(leg, 0.95, 1.6, 0.95, 0, -2.1, 0, C.skin);
    box(leg, 0.95, 0.4, 1.3, 0, -2.8, 0.15, C.shoe);
    return leg;
  });
  const upper = node(hips, 0, 0, 0);
  box(upper, 2.15, 0.7, 1.15, 0, 0.1, 0, C.shorts);
  box(upper, 2.2, 2.6, 1.2, 0, 1.75, 0, C.tank);
  box(upper, 0.6, 0.5, 1.2, -0.8, 3.15, 0, C.tank); // straps
  box(upper, 0.6, 0.5, 1.2, 0.8, 3.15, 0, C.tank);
  box(upper, 1, 0.5, 1.22, 0, 3.15, 0, C.skin); // neck and chest above the scoop
  const head = node(upper, 0, 3.4, 0);
  box(head, 1.6, 1.6, 1.6, 0, 0.8, 0, C.skin);
  box(head, 1.7, 0.55, 1.7, 0, 1.75, -0.05, C.hair);
  box(head, 1.7, 1.2, 0.4, 0, 1.15, -0.7, C.hair);
  box(head, 0.3, 0.8, 1.2, -0.8, 1.1, -0.15, C.hair);
  box(head, 0.3, 0.8, 1.2, 0.8, 1.1, -0.15, C.hair);
  const arms = [-1, 1].map((side) => {
    const arm = node(upper, side * 1.45, 2.9, 0);
    box(arm, 0.7, 2.5, 0.75, 0, -1.2, 0, C.skin);
    return arm;
  });
  // the spatula, in his right hand
  const spat = node(arms[1], 0, -2.5, 0);
  box(spat, 0.25, 0.25, 1.6, 0, 0, 0.7, C.handle);
  box(spat, 0.9, 0.12, 0.9, 0, 0, 1.9, C.spatula);

  return {
    root,
    man: { root: manRoot, hips, legs, arms, head },
    lid, patties, coals, puffs,
    dispose() { mats.forEach((m) => m.dispose()); },
  };
}
