// Sunbather easter egg. Zoom all the way in on Brighton Beach and a tiny bald, tanned man
// in a black thong walks out onto the sand, spreads his towel and lies down to sunbathe. He stays
// there until the map zooms back out, which sends him home so the scene plays again next time.

import * as THREE from 'three';
import { latLngToWorld } from './map/geo.js';

const SPOT = latLngToWorld(40.57425, -73.9620); // where he lies down, on the Brighton Beach sand
const FROM = latLngToWorld(40.5756, -73.9626); // where he walks in from, by the boardwalk
const SAND = 0.35; // ground top on beach tiles
const VOX = 0.045; // world units per voxel, which makes him about a third of a tile tall
const WALK = 4.5; // voxels per second
const STRIDE = 0.55; // seconds per pair of steps
const GAP = 6.8; // voxels between where he lays the towel and where he sits on it
const IN_VIEW = 0.6; // the beach has to be this close to the middle of the screen (1 = the edge)
const SETTLE = 0.4; // seconds at full zoom before he sets off, so a pinch or scroll has finished

const C = {
  skin: '#a8612f', shade: '#864a22', thong: '#141418', shades: '#1d2340',
  towel: ['#4dd2ff', '#ffffff', '#ffd23f', '#ffffff'],
};

const BOX = new THREE.BoxGeometry(1, 1, 1);

export function initSunbather(map) {
  let scene = null;
  const ndc = new THREE.Vector3();
  const spot = new THREE.Vector3(SPOT.x, SAND, SPOT.z);
  let held = 0; // how long the beach has been in view at full zoom

  map.onFrame((dt) => {
    const atMax = map.zoom >= map.maxZoom * 0.98;
    if (scene) {
      if (map.zoom < map.maxZoom * 0.96) {
        scene.dispose();
        scene = null;
      } else {
        scene.step(dt);
      }
      return;
    }
    ndc.copy(spot).project(map.camera);
    const inView = Math.abs(ndc.x) < IN_VIEW && Math.abs(ndc.y) < IN_VIEW;
    held = atMax && inView ? held + dt : 0;
    if (held >= SETTLE) {
      held = 0;
      scene = startScene(map);
    }
  });
}

function startScene(map) {
  const group = new THREE.Group();
  map.world.add(group);
  const man = buildMan();
  group.add(man.root);
  const towel = buildTowel();
  group.add(towel.root);

  const spot = new THREE.Vector3(SPOT.x, SAND, SPOT.z);
  const from = new THREE.Vector3(FROM.x, SAND, FROM.z);
  const heading = Math.atan2(spot.x - from.x, spot.z - from.z);
  const fwd = new THREE.Vector3(Math.sin(heading), 0, Math.cos(heading));
  const lay = spot.clone().addScaledVector(fwd, -GAP * VOX); // where he stops to put the towel down
  man.root.position.copy(from);
  man.root.rotation.y = heading;
  towel.root.rotation.y = heading;
  // the towel runs from just past his toes at the lay spot to past where his head ends up
  towel.root.position.copy(spot).addScaledVector(fwd, -0.85 * VOX);
  towel.root.position.y = SAND + 0.004;

  // the timeline, in seconds
  const walkTime = from.distanceTo(lay) / (WALK * VOX);
  const T = {};
  T.bend = walkTime;
  T.spread = T.bend + 0.5;
  T.rise = T.spread + 1.1;
  T.step = T.rise + 0.4;
  T.sit = T.step + GAP / WALK;
  T.lie = T.sit + 0.7;
  T.done = T.lie + 0.9;

  let t = 0;
  const ease = (a, b) => THREE.MathUtils.smoothstep(t, a, b);
  const lerp = THREE.MathUtils.lerp;

  function walkCycle(phase) {
    const swing = Math.sin(phase) * 0.6;
    man.legs[0].rotation.x = swing;
    man.legs[1].rotation.x = -swing;
    man.arms[0].rotation.x = -swing * 0.8;
    man.arms[1].rotation.x = swing * 0.3; // this arm holds the towel
    man.hips.position.y = 3 + Math.abs(Math.cos(phase)) * 0.25;
  }
  function standStill() {
    for (const l of man.legs) l.rotation.x = 0;
    man.hips.position.y = 3;
  }

  function step(dt) {
    t = Math.min(t + dt, T.done);
    const root = man.root.position;

    if (t < T.bend) {
      // walk down the beach with the towel rolled under one arm
      root.lerpVectors(from, lay, t / walkTime);
      walkCycle((t / STRIDE) * Math.PI * 2);
      man.roll.visible = true;
      towel.root.visible = false;
    } else if (t < T.rise) {
      // bend over, set the roll down and flick it out along the sand
      root.copy(lay);
      standStill();
      const bend = ease(T.bend, T.spread) - ease(T.spread + 0.6, T.rise);
      man.upper.rotation.x = bend * 0.9;
      man.arms[0].rotation.x = -bend * 1.2;
      man.arms[1].rotation.x = -bend * 1.2;
      man.roll.visible = t < T.spread;
      towel.root.visible = t >= T.spread;
      towel.unroll(ease(T.spread, T.spread + 0.7));
    } else if (t < T.sit) {
      // step forward onto the towel
      man.upper.rotation.x = 0;
      man.roll.visible = false;
      towel.root.visible = true;
      towel.unroll(1);
      const k = THREE.MathUtils.clamp((t - T.step) / (T.sit - T.step), 0, 1);
      root.lerpVectors(lay, spot, k);
      if (t < T.step) {
        standStill();
        for (const a of man.arms) a.rotation.x = 0;
      } else {
        walkCycle(((t - T.step) / STRIDE) * Math.PI * 2);
      }
    } else {
      // sit down with his legs out toward the water, then lie back with his hands behind his head
      root.copy(spot);
      man.roll.visible = false;
      towel.root.visible = true;
      towel.unroll(1);
      const sit = ease(T.sit, T.lie);
      const lie = ease(T.lie, T.done);
      for (const l of man.legs) l.rotation.x = -sit * Math.PI / 2;
      man.hips.position.y = lerp(3, 0.75, sit);
      man.upper.rotation.x = -lie * Math.PI / 2;
      man.arms[0].rotation.x = lerp(-sit * 0.3, Math.PI * 0.95, lie);
      man.arms[1].rotation.x = lerp(-sit * 0.3, Math.PI * 0.95, lie);
      man.arms[0].rotation.z = lie * 0.35;
      man.arms[1].rotation.z = -lie * 0.35;
    }
  }

  step(0);
  return {
    step,
    dispose() {
      map.world.remove(group);
      man.dispose();
      towel.dispose();
    },
  };
}

// ---------------------------------------------------------------------------
// the man: voxel boxes with pivots at the hips, shoulders and waist. He faces +z.

function buildMan() {
  const mats = new Map();
  const mat = (hex) => {
    if (!mats.has(hex)) mats.set(hex, new THREE.MeshLambertMaterial({ color: hex, flatShading: true }));
    return mats.get(hex);
  };
  const box = (parent, w, h, d, x, y, z, hex) => {
    const m = new THREE.Mesh(BOX, mat(hex));
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
  const body = node(root, 0, 0, 0);
  body.scale.setScalar(VOX);
  const hips = node(body, 0, 3, 0);

  const legs = [-1, 1].map((side) => {
    const leg = node(hips, side * 0.55, 0, 0);
    box(leg, 0.95, 3, 1, 0, -1.5, 0, C.skin);
    box(leg, 0.95, 0.4, 1.3, 0, -2.8, 0.15, C.shade); // feet
    return leg;
  });

  const upper = node(hips, 0, 0, 0);
  box(upper, 2.15, 0.7, 1.15, 0, 0.05, 0, C.thong);
  box(upper, 0.8, 0.5, 0.2, 0, -0.35, 0.55, C.thong); // the front of the thong
  box(upper, 2.2, 2.7, 1.2, 0, 1.75, 0, C.skin);
  box(upper, 1.6, 1.1, 0.3, 0, 1.2, 0.65, C.skin); // a bit of a belly
  box(upper, 1.6, 1.6, 1.6, 0, 3.9, 0, C.skin);
  box(upper, 1.5, 0.35, 0.2, 0, 4.0, 0.85, C.shades);

  const arms = [-1, 1].map((side) => {
    const arm = node(upper, side * 1.45, 2.9, 0);
    box(arm, 0.7, 2.5, 0.75, 0, -1.2, 0, C.skin);
    return arm;
  });
  // the rolled-up towel, tucked under his left arm on the walk out
  const roll = box(upper, 0.9, 0.9, 2.6, 1.95, 1.9, 0, C.towel[0]);

  return { root, hips, upper, legs, arms, roll, dispose() { mats.forEach((m) => m.dispose()); } };
}

// a striped beach towel, laid along +z, that unrolls from its far end back toward him
function buildTowel() {
  const mats = [];
  const root = new THREE.Group();
  const strip = new THREE.Group();
  root.add(strip);
  strip.scale.setScalar(VOX);
  const W = 3.6;
  const L = 9.6;
  const bands = 8;
  for (let i = 0; i < bands; i++) {
    const m = new THREE.MeshLambertMaterial({ color: C.towel[i % C.towel.length], flatShading: true });
    mats.push(m);
    const mesh = new THREE.Mesh(BOX, m);
    mesh.scale.set(W, 0.2, L / bands);
    mesh.position.set(0, 0.1, -L / 2 + (i + 0.5) * (L / bands));
    strip.add(mesh);
  }
  return {
    root,
    unroll(k) {
      // grows from the end nearest the lay spot (-z) toward his feet (+z)
      const s = Math.max(0.05, k);
      strip.scale.z = VOX * s;
      strip.position.z = -(L / 2) * VOX * (1 - s);
    },
    dispose() { mats.forEach((m) => m.dispose()); },
  };
}
