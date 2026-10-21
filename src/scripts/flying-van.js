// Flying van easter egg. Zoom all the way in between the Lower East Side and the East Village
// and a black Sprinter van on tiny flapping wings rises up out of the streets in the middle of
// the view, then circles there. On the roof a chill guy in a black hoodie and sunglasses kicks
// back in a lawn chair next to his Bernedoodle. Zooming back out to about the default view
// clears it so it rises again next time.

import * as THREE from 'three';
import { latLngToWorld } from './map/geo.js';
import { watchZoomEgg } from './zoom-egg.js';

const SPOT = latLngToWorld(40.7215, -73.9830); // between the Lower East Side and the East Village
const ALT = 3.4; // flying height, just clear of the tallest blocks around the LES
const RADIUS = 1.7; // world units, the loop it circles
const SPEED = 0.65; // world units per second
const RISE = 3; // seconds to climb from the street to flying height
const VOX = 0.045; // world units per voxel, the same scale as the Brighton Beach sunbather

const C = {
  van: '#2a2b31', vanShade: '#3d3f48', glass: '#4f6f9f', tyre: '#0c0c0f', trim: '#8c8fa3',
  grille: '#3b3f57', light: '#fff3a0', tail: '#ed1c24',
  wing: '#ffffff', feather: '#dedad2',
  frame: '#c9c9cf', web: ['#3aa35a', '#ffffff'],
  hoodie: '#18181c', pocket: '#2a2a31', jeans: '#2b3550', shoe: '#ffffff', skin: '#e2b48c',
  hair: '#0b0b0d', shades: '#050507',
  dog: '#17171a', dogWhite: '#f4f1ea', rust: '#a0522d', tongue: '#ff7b9c',
};

const BOX = new THREE.BoxGeometry(1, 1, 1);

export function initFlyingVan(map) {
  watchZoomEgg(map, new THREE.Vector3(SPOT.x, 0.35, SPOT.z), startScene);
}

function startScene(map) {
  const parts = buildVan();
  map.world.add(parts.root);

  // it climbs out of the streets, facing left or right across the screen, and levels off into
  // a loop around the middle of the view
  const right = new THREE.Vector3(1, 0, 0).applyQuaternion(map.camera.quaternion).setY(0).normalize();
  const dir = right.multiplyScalar(Math.random() < 0.5 ? 1 : -1);
  const a0 = Math.atan2(-dir.x, dir.z); // where on the loop its heading matches dir
  // pull the loop in toward the camera so that, on screen, it circles the middle of the view
  const away = new THREE.Vector3();
  map.camera.getWorldDirection(away);
  const lean = Math.hypot(away.x, away.z) / Math.max(0.1, -away.y);
  away.setY(0).normalize();
  const mid = map.target;
  const center = new THREE.Vector3(mid.x, ALT, mid.z).addScaledVector(away, -ALT * lean);
  const join = center.clone().add(new THREE.Vector3(Math.cos(a0), 0, Math.sin(a0)).multiplyScalar(RADIUS));
  const start = join.clone().setY(0.35).addScaledVector(dir, -SPEED * RISE * 0.5);
  const turnRate = SPEED / RADIUS;

  const pos = new THREE.Vector3();
  const vel = new THREE.Vector3();
  let t = 0;

  function step(dt) {
    t += dt;
    let bank = 0;
    let pitch = 0;
    if (t < RISE) {
      // ease up off the street, nose high, drifting forward into the loop
      const k = t / RISE;
      pos.lerpVectors(start, join, k);
      pos.y = THREE.MathUtils.lerp(start.y, ALT, 1 - (1 - k) ** 2);
      vel.copy(dir);
      pitch = -0.3 * (1 - k);
    } else {
      const a = a0 + (t - RISE) * turnRate;
      pos.set(center.x + Math.cos(a) * RADIUS, ALT, center.z + Math.sin(a) * RADIUS);
      vel.set(-Math.sin(a), 0, Math.cos(a));
      bank = Math.min(1, (t - RISE) / 1.5) * 0.08; // ease into the lean of the turn
    }
    const root = parts.root;
    root.position.copy(pos);
    root.position.y += Math.sin(t * 1.7) * 0.06;
    root.rotation.y = Math.atan2(vel.x, vel.z);
    root.rotation.z = -bank;
    root.rotation.x = pitch + Math.sin(t * 1.7 + 1) * 0.03;

    // wings flap fast, the dog's ears blow back and its tail wags, the guy nods along
    const flap = Math.sin(t * (t < RISE ? 20 : 14)) * 0.7; // working harder on the climb
    parts.wings[0].rotation.z = -flap;
    parts.wings[1].rotation.z = flap;
    parts.ears[0].rotation.z = -0.35 + Math.sin(t * 9) * 0.25;
    parts.ears[1].rotation.z = 0.35 - Math.sin(t * 9 + 1) * 0.25;
    parts.ears[0].rotation.x = parts.ears[1].rotation.x = -0.5;
    parts.tail.rotation.y = Math.sin(t * 10) * 0.6;
    parts.dogHead.rotation.y = Math.sin(t * 0.6) * 0.5;
    parts.head.rotation.x = Math.max(0, Math.sin(t * 4.2)) * 0.12;
  }

  step(0);
  return {
    step,
    dispose() {
      map.world.remove(parts.root);
      parts.dispose();
    },
  };
}

// ---------------------------------------------------------------------------
// the van, the lawn chair, the guy and the dog: voxel boxes with a few pivots. Faces +z.

function buildVan() {
  const mats = new Map();
  const mat = (hex) => {
    // drawn in the transparent pass after the pins (renderOrder 10-20), so it flies over them
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
  root.rotation.order = 'YXZ';
  const body = node(root, 0, 0, 0);
  body.scale.setScalar(VOX);

  // ---- the van: tall cargo box, a short hood, wheels at the corners ----
  box(body, 8, 7.4, 16, 0, 5.1, -1.5, C.van);
  box(body, 8, 3, 3, 0, 2.9, 8, C.van); // hood
  box(body, 7.4, 3.6, 1.4, 0, 6.5, 7.1, C.glass); // windshield
  box(body, 8, 0.8, 1.4, 0, 8.4, 7.1, C.van); // over the windshield
  for (const side of [-1, 1]) {
    box(body, 0.1, 2.4, 2.4, side * 4.02, 6.6, 5.2, C.glass); // cab windows
    box(body, 0.1, 0.5, 16, side * 4.02, 2.4, -1.5, C.vanShade); // rocker trim
    box(body, 1.4, 0.8, 0.2, side * 2.7, 3.7, 9.55, C.light);
    box(body, 0.8, 2, 0.2, side * 3.4, 4.6, -9.55, C.tail);
    for (const z of [-6, 5.4]) {
      box(body, 1.2, 2.4, 2.4, side * 3.8, 1.2, z, C.tyre);
      box(body, 0.1, 1, 1, side * 4.45, 1.2, z, C.trim);
    }
  }
  box(body, 3.6, 1.2, 0.2, 0, 2.8, 9.55, C.grille);
  box(body, 8.2, 0.9, 0.6, 0, 1.7, 9.7, C.trim);
  box(body, 8.2, 0.9, 0.6, 0, 1.7, -9.7, C.trim);
  box(body, 0.15, 6, 0.1, 0, 5.2, -9.55, C.vanShade); // rear door seam

  // ---- tiny wings off the top of the cargo box ----
  const wings = [-1, 1].map((side) => {
    const wing = node(body, side * 4, 8.6, -3);
    const blade = node(wing, 0, 0, 0);
    blade.rotation.z = side * 0.35; // swept up a little even at rest
    box(blade, 2.6, 0.5, 3.4, side * 1.3, 0, 0, C.wing);
    box(blade, 2.2, 0.45, 2.6, side * 3.5, 0, -0.4, C.wing);
    box(blade, 1.6, 0.4, 1.8, side * 5.2, 0, -0.8, C.wing);
    for (const [x, z] of [[1.6, -2], [3.4, -2], [5, -1.9], [6.2, -1.2]]) box(blade, 1.1, 0.35, 1.2, side * x, -0.05, z, C.feather);
    return wing;
  });

  // ---- the lawn chair: aluminium frame with green and white webbing ----
  const roof = 8.8;
  const cx = -1.7;
  const cz = -0.5;
  for (const dx of [-1.6, 1.6]) for (const dz of [-1.5, 1.5]) box(body, 0.3, 1, 0.3, cx + dx, roof + 0.5, cz + dz, C.frame);
  for (let i = 0; i < 3; i++) box(body, 3.4, 0.3, 1.07, cx, roof + 1.1, cz - 1.07 + i * 1.07, C.web[i % 2]);
  const back = node(body, cx, roof + 1.2, cz - 1.6);
  back.rotation.x = -0.35;
  for (let i = 0; i < 4; i++) box(back, 3.4, 1.05, 0.3, 0, 0.55 + i * 1.05, 0, C.web[i % 2]);
  for (const dx of [-1.85, 1.85]) {
    box(back, 0.3, 4.4, 0.3, dx, 2.2, 0, C.frame);
    box(body, 0.4, 0.3, 3.2, cx + dx, roof + 2.5, cz, C.frame); // armrests
    box(body, 0.3, 1.4, 0.3, cx + dx, roof + 1.8, cz + 1.4, C.frame);
  }

  // ---- the guy: black hoodie, jeans, white sneakers, black hair and shades, leaning back ----
  const hips = node(body, cx, roof + 1.75, cz - 0.9);
  for (const side of [-1, 1]) {
    box(hips, 0.95, 1, 2.9, side * 0.55, 0, 1.4, C.jeans);
    box(hips, 0.95, 1.9, 1, side * 0.55, -1, 2.6, C.jeans);
    box(hips, 0.95, 0.5, 1.4, side * 0.55, -1.7, 2.8, C.shoe);
  }
  const upper = node(hips, 0, 0.3, 0);
  upper.rotation.x = -0.3;
  box(upper, 2.3, 2.8, 1.3, 0, 1.4, 0, C.hoodie);
  box(upper, 1.4, 0.7, 0.15, 0, 0.7, 0.7, C.pocket);
  box(upper, 1.7, 1, 0.6, 0, 2.7, -0.85, C.hoodie); // the hood, bunched behind his neck
  for (const side of [-1, 1]) {
    const arm = node(upper, side * 1.5, 2.6, 0);
    arm.rotation.x = 0.55;
    box(arm, 0.75, 2.2, 0.8, 0, -1.1, 0, C.hoodie);
    box(arm, 0.6, 0.6, 0.6, 0, -2.4, 0, C.skin);
  }
  const head = node(upper, 0, 2.9, 0);
  box(head, 1.6, 1.6, 1.6, 0, 0.8, 0, C.skin);
  box(head, 1.7, 0.5, 1.7, 0, 1.75, -0.05, C.hair);
  box(head, 1.7, 1.2, 0.4, 0, 1.2, -0.7, C.hair);
  box(head, 1.7, 0.35, 0.3, 0, 1.45, 0.75, C.hair); // fringe
  box(head, 1.5, 0.35, 0.2, 0, 0.9, 0.85, C.shades);

  // ---- the Bernedoodle: black and curly, white bib and muzzle, rust brows, sitting up ----
  const dog = node(body, 2.3, roof, 0.1);
  dog.rotation.y = -0.25;
  box(dog, 2.4, 1.8, 2.4, 0, 0.9, -0.6, C.dog);
  box(dog, 2, 2.6, 1.8, 0, 2.4, 0.3, C.dog);
  box(dog, 1.5, 2.2, 0.3, 0, 2.6, 1.25, C.dogWhite); // white bib
  box(dog, 2.2, 0.5, 2, 0, 1.9, -0.4, C.dog); // curly lumps on the back
  box(dog, 0.5, 0.5, 0.5, 1.15, 1.2, -0.9, C.dog);
  box(dog, 0.5, 0.5, 0.5, -1.15, 1.4, -0.3, C.dog);
  for (const side of [-1, 1]) {
    box(dog, 0.6, 2, 0.6, side * 0.6, 1, 1.0, C.dog);
    box(dog, 0.7, 0.4, 0.8, side * 0.6, 0.2, 1.15, C.dogWhite);
  }
  const dogHead = node(dog, 0, 4.1, 0.6);
  box(dogHead, 2, 1.8, 1.8, 0, 0, 0, C.dog);
  box(dogHead, 1.2, 0.4, 1, 0, 1, -0.1, C.dog); // topknot curls
  box(dogHead, 1, 0.8, 0.9, 0, -0.35, 1.2, C.dogWhite);
  box(dogHead, 0.4, 0.4, 0.3, 0, -0.1, 1.7, C.dog);
  box(dogHead, 0.5, 1.2, 0.1, 0, 0.3, 0.92, C.dogWhite); // white blaze
  box(dogHead, 0.4, 0.5, 0.2, 0, -0.85, 1.45, C.tongue);
  for (const side of [-1, 1]) {
    box(dogHead, 0.35, 0.25, 0.1, side * 0.55, 0.4, 0.92, C.rust);
    box(dogHead, 0.4, 0.4, 0.1, side * 0.75, -0.45, 0.92, C.rust);
    box(dogHead, 0.3, 0.3, 0.1, side * 0.5, 0.1, 0.93, C.dog);
  }
  const ears = [-1, 1].map((side) => {
    const ear = node(dogHead, side * 1.05, 0.5, 0);
    box(ear, 0.45, 1.6, 1, 0, -0.7, 0, C.dog);
    return ear;
  });
  const tail = node(dog, 0, 1.4, -1.8);
  box(tail, 0.6, 0.6, 1.6, 0, 0.2, -0.6, C.dog);

  return { root, wings, head, dogHead, ears, tail, dispose() { mats.forEach((m) => m.dispose()); } };
}
