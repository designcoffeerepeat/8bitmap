// Zoomer: Times Square's street performers and tourists. Zoomed all the way in on the plaza, a caped hero and
// a masked wrestler strike poses, a big orange furry character waves and bounces, and a few tourists wander the
// paving stopping to take photos. The costumes are our own, not anyone's famous characters.

import * as THREE from 'three';
import { COLS, ROWS } from '../map/geo.js';
import { kit, person, walkPose, standPose, loop, zoomer, VOX, STRIDE, WALK } from './kit.js';

const PAVING = 0.45; // the plaza's top (times-square.js lays it at GROUND_H + 0.1)
const at = (col, row) => new THREE.Vector3(col - COLS / 2, PAVING, row - ROWS / 2);
const SNAP_EVERY = 5; // seconds between a tourist's photos

export function initTimesSquareZoomer(map) {
  zoomer(map, 40.7585, -73.9855, start, { y: PAVING });
}

function start(map) {
  const k = kit();
  const root = new THREE.Group();
  map.world.add(root);
  const add = (p, pos, facing) => {
    root.add(p.root);
    p.root.position.copy(pos);
    p.root.rotation.y = facing;
    return p;
  };
  const toCrowd = Math.PI * 0.75; // the performers face out across the plaza

  // a purple hero in green goggles and an orange cape, hands on hips, now and then punching the air
  const hero = add(person(k, { skin: '#e8b48a', top: '#7a3cff', bottom: '#7a3cff', legsColor: '#7a3cff', shoe: '#ffd23f', cape: '#ff8a1f', hair: '#1a1a1a', glasses: '#7cf07c' }), at(177.4, 139.2), toCrowd);
  k.box(hero.upper, 2.3, 0.5, 0.1, 0, 1.2, 0.62, '#ffd23f'); // the belt
  // a masked wrestler in pink and teal, arms folded, now and then waving
  const dark = add(person(k, { skin: '#d9a27a', top: '#18b7a8', bottom: '#ff4fa3', shoe: '#ff4fa3', mask: '#ff4fa3', hands: '#18b7a8' }), at(178.3, 140.3), toCrowd);
  k.box(dark.head, 1.5, 0.6, 0.1, 0, 0.95, 0.81, '#fff3a0'); // the yellow band around the mask's eyes
  // the big furry one: round, orange with blue spots and two little horns
  const red = add(person(k, { scale: 1.15, skin: '#ff8a1f', top: '#ff8a1f', bottom: '#ff8a1f', shoe: '#ff8a1f', mask: '#ff8a1f', hands: '#ff8a1f' }), at(176.6, 140.8), toCrowd);
  k.box(red.head, 0.3, 0.6, 0.3, -0.5, 1.9, 0, '#fff3a0'); // horns
  k.box(red.head, 0.3, 0.6, 0.3, 0.5, 1.9, 0, '#fff3a0');
  k.box(red.head, 1, 0.3, 0.2, 0, 0.05, 0.82, '#1d2340'); // mouth
  k.box(red.upper, 2.6, 2.8, 1.5, 0, 1.6, 0, '#ff8a1f'); // the fluffy middle
  for (const [x, y] of [[-0.7, 2.3], [0.6, 1.4], [-0.2, 0.7]]) k.box(red.upper, 0.5, 0.5, 0.1, x, y, 0.78, '#3d7be0'); // spots

  // tourists on two loops around the paving, each with a camera
  const tours = [
    { o: { skin: '#f0c9a8', top: '#ff9f1c', bottom: '#4a5a7a', hat: 'cap', hatColor: '#ffffff', hair: '#7a4a22' }, path: [[176.4, 137.6], [178.6, 137.6], [178.6, 142.4], [176.4, 142.4]], off: 0 },
    { o: { skin: '#a8612f', top: '#7cf07c', bottom: '#2b2b33', hair: '#141418', hairStyle: 'long' }, path: [[176.4, 137.6], [178.6, 137.6], [178.6, 142.4], [176.4, 142.4]], off: 6 },
    { o: { skin: '#d9a27a', top: '#ffffff', bottom: '#5d6470', hair: '#2a1a12', glasses: '#1d2340' }, path: [[179.3, 140.3], [181.6, 140.3], [181.6, 142.6], [179.3, 142.6]], off: 2 },
  ].map(({ o, path, off }, i) => {
    const p = person(k, o);
    root.add(p.root);
    const cam = k.box(p.arms[1].userData.hand, 0.9, 0.6, 0.6, 0, 0, 0.3, '#1d2340');
    const flash = k.box(p.arms[1].userData.hand, 0.5, 0.3, 0.3, 0, 0.05, 0.65, '#ffffff', true);
    flash.visible = false;
    return { p, cam, flash, route: loop(path.map(([c, r]) => at(c, r))), dist: off, clock: i * 1.7 };
  });

  let t = 0;
  function step(dt) {
    t += dt;
    // the heroes
    standPose(hero);
    const punch = Math.max(0, Math.sin(t * 0.9)) > 0.85;
    hero.arms[0].rotation.set(0, 0, 0.6); // hands on hips
    hero.arms[1].rotation.set(punch ? -Math.PI : 0, 0, punch ? 0 : -0.6);
    hero.hips.position.y = 3 + (punch ? 0.3 : 0);
    standPose(dark);
    const wave = Math.sin(t * 0.7 + 1) > 0.6;
    dark.arms[0].rotation.set(-1.3, 0, -0.9); // folded across
    dark.arms[1].rotation.set(wave ? -Math.PI * 0.9 : -1.3, 0, wave ? -0.2 + Math.sin(t * 9) * 0.3 : 0.9);
    // the red one waves both arms and bounces
    standPose(red);
    red.hips.position.y = 3 + Math.abs(Math.sin(t * 4)) * 0.6;
    red.arms[0].rotation.set(-Math.PI * 0.8, 0, 0.4 + Math.sin(t * 6) * 0.4);
    red.arms[1].rotation.set(-Math.PI * 0.8, 0, -0.4 - Math.sin(t * 6 + 1) * 0.4);
    // tourists walk, stop, raise the camera, flash, and walk on
    for (const tr of tours) {
      tr.clock += dt;
      const c = tr.clock % SNAP_EVERY;
      tr.route.place(tr.p.root, tr.dist);
      if (c < SNAP_EVERY - 1.6) {
        tr.dist += dt * WALK * VOX;
        walkPose(tr.p, (tr.clock / STRIDE) * Math.PI * 2);
        tr.p.arms[1].rotation.set(-0.3, 0, 0);
        tr.flash.visible = false;
      } else {
        standPose(tr.p);
        tr.p.root.rotation.y += Math.PI / 2; // turn to the sights
        tr.p.arms[1].rotation.set(-Math.PI / 2 - 0.25, 0, 0.35);
        tr.p.arms[0].rotation.set(-Math.PI / 2 - 0.25, 0, -0.35);
        const snap = SNAP_EVERY - c;
        tr.flash.visible = snap < 0.7 && snap > 0.55;
      }
    }
  }

  step(0);
  return { step, dispose() { map.world.remove(root); k.dispose(); } };
}
