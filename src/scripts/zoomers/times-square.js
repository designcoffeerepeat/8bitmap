// Zoomer: Times Square's street performers and tourists. Zoomed all the way in on the plaza, two costumed
// superheroes strike poses, a big red furry character waves and bounces, the Naked Cowboy strums his
// guitar in his hat, boots and briefs, and a few tourists wander the paving stopping to take photos.

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

  // a red and blue caped hero, hands on hips, now and then punching the air
  const hero = add(person(k, { skin: '#e8b48a', top: '#2a5bd7', bottom: '#d7262e', legsColor: '#2a5bd7', shoe: '#d7262e', cape: '#d7262e', hair: '#1a1a1a' }), at(177.4, 139.2), toCrowd);
  k.box(hero.upper, 1, 0.9, 0.1, 0, 2.1, 0.62, '#ffd23f'); // the badge
  // a dark caped hero with a cowl, arms folded, now and then waving
  const dark = add(person(k, { skin: '#d9a27a', top: '#2b2b33', bottom: '#2b2b33', shoe: '#1a1a1e', cape: '#1a1a1e', mask: '#2b2b33', hands: '#1a1a1e' }), at(178.3, 140.3), toCrowd);
  k.box(dark.head, 0.3, 0.6, 0.3, -0.55, 1.9, 0, '#2b2b33'); // ears on the cowl
  k.box(dark.head, 0.3, 0.6, 0.3, 0.55, 1.9, 0, '#2b2b33');
  k.box(dark.upper, 1.1, 0.6, 0.1, 0, 2.2, 0.62, '#ffd23f');
  // the big red furry one: round, bright, with an orange nose
  const red = add(person(k, { scale: 1.15, skin: '#e0231f', top: '#e0231f', bottom: '#e0231f', shoe: '#e0231f', mask: '#e0231f', hands: '#e0231f' }), at(176.6, 140.8), toCrowd);
  k.box(red.head, 0.7, 0.5, 0.5, 0, 0.45, 0.95, '#ff8a1f'); // nose
  k.box(red.head, 1, 0.3, 0.2, 0, 0.05, 0.82, '#1d2340'); // mouth
  k.box(red.upper, 2.6, 2.8, 1.5, 0, 1.6, 0, '#e0231f'); // the fluffy middle
  // the Naked Cowboy: white hat, boots and briefs, a guitar slung across
  const cowboy = add(person(k, { skin: '#e3b08a', top: '#e3b08a', bottom: '#ffffff', legsColor: '#e3b08a', shoe: '#8a5a32', hair: '#d8b25a', hat: 'cowboy' }), at(180.6, 141.6), Math.PI);
  for (const leg of cowboy.legs) k.box(leg, 1.05, 1.6, 1.1, 0, -2.1, 0, '#8a5a32'); // boots
  const guitar = k.node(cowboy.upper, 0, 1.6, 0.9);
  guitar.rotation.z = -0.5;
  k.box(guitar, 1.8, 1.4, 0.4, 0, -0.3, 0, '#c27a3a');
  k.box(guitar, 1.2, 1, 0.42, 0, 0.8, 0, '#c27a3a');
  k.box(guitar, 0.5, 0.5, 0.45, 0, 0.1, 0.02, '#3b2414'); // sound hole
  k.box(guitar, 0.3, 2.6, 0.3, 0, 2.5, 0, '#5a3a22'); // neck
  cowboy.arms[0].rotation.set(-1.1, 0, 0.5); // fretting hand up the neck

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
    // the cowboy strums and taps a boot
    cowboy.arms[1].rotation.set(-0.7 + Math.sin(t * 10) * 0.25, 0, -0.3);
    cowboy.legs[1].rotation.x = Math.max(0, Math.sin(t * 5)) * -0.2;
    cowboy.upper.rotation.z = Math.sin(t * 2.5) * 0.06;
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
