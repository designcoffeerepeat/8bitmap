// Monster easter egg. A voxel kaiju wades in from the edge of the view, stomps toward
// Midtown and breathes fire on the streets. While it is on screen a little plane circles
// the cursor (on phones, the last tap); clicking or tapping fires the plane's machine gun.
// Once hit, a health bar shows over its head, and enough hits topple it over in a burst
// of 8-bit fireworks. It starts from LAUNCH MONSTER in the site menu, or by itself once
// per visit after two minutes on the site.

import * as THREE from 'three';
import { COLS, ROWS, latLngToWorld } from './map/geo.js';
import { CATEGORY_COLORS, PALETTE } from './map/palette.js';

const AUTO_AFTER_MS = 2 * 60 * 1000;
const SESSION_KEY = '8bm_monster';
const CENTER = latLngToWorld(40.754, -73.984); // Midtown, around Bryant Park
const MAX_HP = 60;
const VOX = 1; // world units per monster voxel, which makes it about 21 units tall, over the tallest towers
const SPEED = 1.1; // world units per second
const STRIDE = 1.5; // seconds per pair of steps
const PLANE_ALT = 25; // just over the monster's head
const FIRE_RATE = 14; // bullets per second
const REDUCED_MOTION = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

const C = {
  body: '#3d5a4a', dark: '#24362d', belly: '#9fbf8f', spine: '#e8eef9', glow: '#7fe3ff',
  eye: '#ffd23f', mouth: '#9e0f15', tooth: '#ffffff', claw: '#ece8e1',
};
const FLAME = ['#ffffff', '#fff3a0', PALETTE.pinHi, '#ff8a1f', '#ed1c24', '#9e0f15', '#5a5d72'];
const EMBER = [PALETTE.pinHi, '#ff8a1f', '#ed1c24', '#5a5d72'];
const SMOKE = ['#8c8fa3', '#5a5d72', '#3b3f57'];
const DUST = ['#ece8e1', '#d8cfbd', '#a9a39a'];
const BOOM = ['#ffffff', '#fff3a0', PALETTE.pinHi, '#ff8a1f', '#ed1c24', '#5a5d72'];
const SPARKS = Object.values(CATEGORY_COLORS);

const BOX = new THREE.BoxGeometry(1, 1, 1);
const ramp = (hexes) => hexes.map((h) => new THREE.Color(h));
const RAMPS = { flame: ramp(FLAME), ember: ramp(EMBER), smoke: ramp(SMOKE), dust: ramp(DUST), boom: ramp(BOOM), bullet: ramp(['#ffffff', '#fff3a0']) };

export function initMonster(map) {
  let game = null;
  const launch = () => {
    try { sessionStorage.setItem(SESSION_KEY, '1'); } catch {}
    if (!game) game = startGame(map, () => { game = null; });
  };

  // the menu item lives in site.js, which loads before the map
  window.addEventListener('monster:launch', launch);
  if (window.monsterQueued) launch();

  let seen = false;
  try { seen = sessionStorage.getItem(SESSION_KEY) === '1'; } catch {}
  if (!seen && !REDUCED_MOTION) {
    // wait for a quiet moment: tab in view, no modal or menu open
    const tryAuto = () => {
      let done = false;
      try { done = sessionStorage.getItem(SESSION_KEY) === '1'; } catch {}
      if (done || game) return;
      const busy = document.hidden || document.querySelector('dialog[open]') || !document.querySelector('#site-menu')?.hidden;
      if (busy) setTimeout(tryAuto, 5000);
      else launch();
    };
    setTimeout(tryAuto, AUTO_AFTER_MS);
  }
}

function startGame(map, onEnd) {
  const group = new THREE.Group();
  map.world.add(group);
  const fx = particles(group, 1400);
  const kaiju = buildKaiju();
  group.add(kaiju.root);
  const plane = buildPlane();
  group.add(plane.root);
  const canvas = map.canvas;
  const container = canvas.parentElement;
  const touch = !window.matchMedia?.('(hover: hover) and (pointer: fine)').matches;

  // ---- HUD: banner with a dismiss button, and the health bar over the monster ----
  const hud = document.createElement('div');
  hud.className = 'monster-hud box';
  hud.innerHTML = `<p role="status"><b>MONSTER ATTACK!</b> <span>${touch ? 'TAP' : 'CLICK'} TO FIRE</span></p>
    <button type="button" class="monster-x" aria-label="Call off the monster">X</button>`;
  document.body.appendChild(hud);
  const hudText = hud.querySelector('span');
  hud.querySelector('button').addEventListener('click', () => end());
  const hp = document.createElement('div');
  hp.className = 'monster-hp';
  hp.hidden = true;
  hp.innerHTML = '<span>KAIJU</span><i><b></b></i>';
  container.appendChild(hp);
  const hpFill = hp.querySelector('b');
  document.body.classList.add('monster-on');

  // ---- where it starts: just past the left or right edge of the view, aimed at Midtown ----
  const center = new THREE.Vector3(CENTER.x, 0, CENTER.z);
  map.flyTo(center, 1.15);
  const right = new THREE.Vector3(1, 0, 0).applyQuaternion(map.camera.quaternion).setY(0).normalize();
  const aspect = canvas.clientWidth / Math.max(1, canvas.clientHeight);
  const halfW = (70 / 1.15) * aspect / 2;
  const startDist = THREE.MathUtils.clamp(halfW + 5, 18, 70);
  const start = center.clone().addScaledVector(right, Math.random() < 0.5 ? -startDist : startDist);
  start.x = THREE.MathUtils.clamp(start.x, -COLS / 2 + 2, COLS / 2 - 2);
  start.z = THREE.MathUtils.clamp(start.z, -ROWS / 2 + 2, ROWS / 2 - 2);
  kaiju.root.position.copy(start);
  kaiju.root.position.y = floorAt(map, start.x, start.z);
  let heading = Math.atan2(center.x - start.x, center.z - start.z);
  kaiju.root.rotation.y = heading;
  let goal = center.clone();

  const s = {
    hp: MAX_HP, mode: 'walk', modeT: 0, phase: 0, nextBreath: 3 + Math.random() * 2,
    flash: 0, fires: [], dying: null, fallDir: 1, aim: null, fireUntil: 0, held: false, shot: 0, t: 0,
  };

  // ---- input ----
  const pointer = { x: null, y: null };
  let downAt = null;
  const onMove = (e) => {
    if (e.pointerType === 'mouse') { pointer.x = e.clientX; pointer.y = e.clientY; }
  };
  const onDown = (e) => {
    downAt = { x: e.clientX, y: e.clientY };
    if (e.pointerType === 'mouse' && e.button === 0) {
      pointer.x = e.clientX; pointer.y = e.clientY;
      s.held = true;
      s.fireUntil = Math.max(s.fireUntil, s.t + 0.35);
    }
  };
  const onUp = (e) => {
    s.held = false;
    // on touch screens a tap moves the plane there and fires; a drag still pans the map
    if (e.pointerType !== 'mouse' && downAt && Math.hypot(e.clientX - downAt.x, e.clientY - downAt.y) < 12) {
      pointer.x = e.clientX; pointer.y = e.clientY;
      s.fireUntil = s.t + 0.6;
    }
    downAt = null;
  };
  const onCancel = () => { s.held = false; downAt = null; };
  const onKey = (e) => { if (e.key === 'Escape' && !document.querySelector('dialog[open]')) end(); };
  canvas.addEventListener('pointermove', onMove);
  canvas.addEventListener('pointerdown', onDown);
  window.addEventListener('pointerup', onUp);
  window.addEventListener('pointercancel', onCancel);
  window.addEventListener('blur', onCancel);
  document.addEventListener('keydown', onKey);

  // ---- per-frame update ----
  const tmp = new THREE.Vector3();
  const tmp2 = new THREE.Vector3();
  const chest = new THREE.Vector3();
  let shakeT = 0;
  let shakeAmp = 0;

  function step(dt) {
    s.t += dt;
    const t = s.t;
    const k = THREE.MathUtils.clamp(1.15 / map.zoom, 0.35, 2.5); // keeps the plane the same size on screen
    const root = kaiju.root;
    kaiju.chest.getWorldPosition(chest);

    if (s.mode === 'walk' || s.mode === 'breath') {
      s.modeT += dt;
      if (s.mode === 'walk') {
        // turn toward the goal, then stomp forward
        const want = Math.atan2(goal.x - root.position.x, goal.z - root.position.z);
        heading += wrapAngle(want - heading) * Math.min(1, dt * 1.5);
        root.rotation.y = heading;
        root.position.x += Math.sin(heading) * SPEED * dt;
        root.position.z += Math.cos(heading) * SPEED * dt;
        const prev = Math.sin(s.phase);
        s.phase += (dt / STRIDE) * Math.PI * 2;
        if (Math.sign(Math.sin(s.phase)) !== Math.sign(prev)) stomp(Math.sin(s.phase) > 0 ? kaiju.footR : kaiju.footL);
        pose(kaiju, s.phase, t, 0);
        // once it reaches Midtown it keeps stomping around nearby
        if (Math.hypot(goal.x - root.position.x, goal.z - root.position.z) < 2) {
          const a = Math.random() * Math.PI * 2;
          const r = 4 + Math.random() * 7;
          goal = new THREE.Vector3(center.x + Math.cos(a) * r, 0, center.z + Math.sin(a) * r);
        }
        if (s.modeT > s.nextBreath) { s.mode = 'breath'; s.modeT = 0; }
      } else {
        breathe(dt);
        if (s.modeT > 2.8) {
          s.mode = 'walk'; s.modeT = 0; s.nextBreath = 3.5 + Math.random() * 3;
          kaiju.spineMat.emissive.set(0x000000);
        }
      }
      const floor = floorAt(map, root.position.x, root.position.z);
      root.position.y += (floor - root.position.y) * Math.min(1, dt * 4);
      if (s.hp < MAX_HP * 0.35 && Math.random() < dt * 8) {
        fx.add({ p: chest.clone().add(rand3(2)), v: new THREE.Vector3(rand(0.5), 2 + Math.random(), rand(0.5)), life: 1.6, size: 0.5, g: -0.5, ramp: RAMPS.smoke });
      }
    } else if (s.mode === 'dying') {
      s.modeT += dt;
      const f = Math.min(1, s.modeT / 1.3);
      kaiju.body.rotation.z = s.fallDir * f * f * 1.5;
      kaiju.head.rotation.x = -0.4 * f;
      kaiju.jaw.rotation.x = 0.6 * f;
      if (f >= 1 && !s.dying.landed) {
        s.dying.landed = true;
        shake(6, 0.5);
        explode(chest.clone(), 140, 9, RAMPS.boom, 0.7);
        dustRing(root.position, 40, 7);
      }
      if (s.dying.landed && s.modeT > 1.55 && root.visible) {
        root.visible = false;
        explode(chest.clone(), 80, 6, RAMPS.flame, 0.5);
        for (let i = 0; i < 9; i++) setTimeout(() => shell(root.position), i * 330 + Math.random() * 200);
      }
      if (s.modeT > 7 && fx.size === 0) return end(true);
    }

    // hit flash
    if (s.flash > 0) {
      s.flash -= dt;
      kaiju.setFlash(s.flash > 0);
    }

    // ---- the plane circles the cursor, high over the streets ----
    let cx = pointer.x;
    let cy = pointer.y;
    if (cx === null) {
      const r = canvas.getBoundingClientRect();
      cx = r.left + r.width * 0.5;
      cy = r.top + r.height * 0.4;
    }
    const aim = map.rayToHeight(cx, cy, PLANE_ALT) ?? chest;
    const orbit = t * 1.8;
    tmp.set(aim.x + Math.cos(orbit) * 3.2 * k, PLANE_ALT, aim.z + Math.sin(orbit) * 3.2 * k);
    const pr = plane.root;
    const before = tmp2.copy(pr.position);
    if (!s.planeReady) { pr.position.copy(tmp); s.planeReady = true; }
    pr.position.lerp(tmp, 1 - Math.exp(-dt * 5));
    const vx = pr.position.x - before.x;
    const vz = pr.position.z - before.z;
    if (Math.hypot(vx, vz) > 1e-4) {
      const yaw = Math.atan2(vx, vz);
      const turn = wrapAngle(yaw - pr.rotation.y);
      pr.rotation.y += turn * Math.min(1, dt * 8);
      plane.body.rotation.z = THREE.MathUtils.lerp(plane.body.rotation.z, THREE.MathUtils.clamp(-turn * 3, -0.8, 0.8), Math.min(1, dt * 6));
    }
    pr.scale.setScalar(k * 1.8);
    plane.prop.rotation.z += dt * 40;
    pr.visible = s.mode !== 'gone';

    // ---- machine gun ----
    if (s.held) s.fireUntil = Math.max(s.fireUntil, t + 0.05);
    if (t < s.fireUntil && root.visible && s.mode !== 'dying') {
      s.shot += dt * FIRE_RATE;
      while (s.shot >= 1) {
        s.shot -= 1;
        const from = plane.muzzle.getWorldPosition(new THREE.Vector3());
        const target = chest.clone().add(rand3(2.6));
        const dir = target.sub(from);
        const dist = dir.length();
        dir.normalize();
        const willHit = Math.random() < 0.85;
        if (!willHit) dir.add(rand3(0.25)).normalize();
        fx.add({
          p: from, v: dir.multiplyScalar(55), life: dist / 55, size: 0.3 * Math.max(0.6, k), g: 0, ramp: RAMPS.bullet,
          onDie: willHit ? (p) => hit(p) : null,
        });
      }
    } else s.shot = 0.99; // the first round leaves as soon as the button goes down

    // ---- burning spots on the streets ----
    for (let i = s.fires.length - 1; i >= 0; i--) {
      const f = s.fires[i];
      f.life -= dt;
      if (f.life <= 0) { s.fires.splice(i, 1); continue; }
      if (Math.random() < dt * 7 * Math.min(1, f.life / 2)) {
        fx.add({ p: f.p.clone().add(new THREE.Vector3(rand(0.4), 0, rand(0.4))), v: new THREE.Vector3(rand(0.3), 1.4 + Math.random(), rand(0.3)), life: 0.6 + Math.random() * 0.4, size: 0.35, g: -0.3, ramp: RAMPS.ember });
      }
    }

    fx.step(dt);
    placeHp();
    if (shakeT > 0) {
      shakeT -= dt;
      const a = shakeT > 0 ? Math.round(shakeAmp * (Math.random() * 2 - 1)) : 0;
      canvas.style.translate = a ? `${a}px ${Math.round(shakeAmp * (Math.random() * 2 - 1))}px` : '';
    }
  }

  function breathe(dt) {
    const T = s.modeT;
    // rear back, glow, then rake fire across the street ahead
    const rear = Math.min(1, T / 0.5);
    const fire = T > 0.5 && T < 2.4;
    kaiju.neck.rotation.x = fire ? 0.35 : -0.35 * rear;
    kaiju.jaw.rotation.x = 0.55 * (fire ? 1 : rear);
    kaiju.spineMat.emissive.set(C.glow).multiplyScalar(Math.min(1, T / 0.5) * (0.6 + Math.sin(T * 30) * 0.15));
    pose(kaiju, s.phase, s.t, fire ? 1 : 0);
    if (!fire) return;
    const root = kaiju.root;
    const mouth = kaiju.mouth.getWorldPosition(new THREE.Vector3());
    const sweep = Math.sin((T - 0.5) * 2.2) * 0.6;
    const ang = heading + sweep;
    const reach = 12 + Math.sin(T * 3) * 2;
    const tx = root.position.x + Math.sin(ang) * reach;
    const tz = root.position.z + Math.cos(ang) * reach;
    const floor = floorAt(map, tx, tz);
    const target = new THREE.Vector3(tx, floor, tz);
    const n = Math.round(dt * 80);
    for (let i = 0; i < n; i++) {
      const dir = target.clone().add(rand3(1.2)).sub(mouth);
      const life = 0.55;
      fx.add({
        p: mouth.clone(), v: dir.divideScalar(life * 0.8), life, size: 0.45 + Math.random() * 0.4, g: 2, ramp: RAMPS.flame, floor,
      });
    }
    if (floor > 0.32 && Math.random() < dt * 6 && s.fires.length < 40) {
      s.fires.push({ p: new THREE.Vector3(tx + rand(1.5), floor, tz + rand(1.5)), life: 5 + Math.random() * 5 });
    }
  }

  function stomp(foot) {
    const p = foot.getWorldPosition(new THREE.Vector3());
    p.y = floorAt(map, p.x, p.z);
    dustRing(p, 14, 2.5);
    shake(2, 0.12);
  }

  function dustRing(p, n, speed) {
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2;
      fx.add({ p: p.clone().setY(p.y + 0.2), v: new THREE.Vector3(Math.cos(a) * speed, 0.6 + Math.random(), Math.sin(a) * speed), life: 0.6 + Math.random() * 0.3, size: 0.45, g: 1, drag: 2.5, ramp: RAMPS.dust });
    }
  }

  function explode(p, n, speed, colors, size) {
    for (let i = 0; i < n; i++) {
      const v = rand3(1).normalize().multiplyScalar(speed * (0.3 + Math.random() * 0.7));
      v.y = Math.abs(v.y) * 1.2;
      fx.add({ p: p.clone(), v, life: 0.8 + Math.random() * 0.8, size: size * (0.6 + Math.random()), g: 6, drag: 1.2, ramp: colors });
    }
  }

  // a firework: a rising shell with a trail, then a ring of sparks in one of the category colours
  function shell(from) {
    if (s.mode === 'gone') return;
    const color = new THREE.Color(SPARKS[Math.floor(Math.random() * SPARKS.length)]);
    const colors = [new THREE.Color('#ffffff'), color, color, color.clone().multiplyScalar(0.6)];
    fx.add({
      p: from.clone().add(new THREE.Vector3(rand(6), 1, rand(6))), v: new THREE.Vector3(rand(1.5), 16 + Math.random() * 6, rand(1.5)),
      life: 0.9 + Math.random() * 0.4, size: 0.5, g: 9, ramp: RAMPS.bullet,
      trail: true,
      onDie: (p) => {
        const n = 46;
        for (let i = 0; i < n; i++) {
          const v = rand3(1).normalize().multiplyScalar(7 + Math.random() * 1.5);
          fx.add({ p: p.clone(), v, life: 1.3 + Math.random() * 0.6, size: 0.5, g: 3, drag: 1.4, ramp: colors, twinkle: true });
        }
        shake(1, 0.1);
      },
    });
  }

  function hit(p) {
    if (s.mode === 'dying' || s.mode === 'gone') return;
    for (let i = 0; i < 4; i++) fx.add({ p: p.clone(), v: rand3(4), life: 0.25, size: 0.3, g: 4, ramp: RAMPS.bullet });
    s.hp -= 1;
    s.flash = 0.06;
    hp.hidden = false;
    hpFill.style.width = `${Math.max(0, (s.hp / MAX_HP) * 100)}%`;
    hp.classList.toggle('is-low', s.hp < MAX_HP * 0.35);
    if (s.hp <= 0) {
      s.mode = 'dying';
      s.modeT = 0;
      s.dying = { landed: false };
      s.fallDir = Math.random() < 0.5 ? -1 : 1;
      kaiju.spineMat.emissive.set(0x000000);
      hp.hidden = true;
      hud.querySelector('b').textContent = 'MONSTER DEFEATED!';
      hudText.textContent = 'NYC IS SAVED';
    }
  }

  function shake(amp, time) {
    if (REDUCED_MOTION) return;
    shakeAmp = Math.max(amp, shakeT > 0 ? shakeAmp : 0);
    shakeT = Math.max(shakeT, time);
  }

  const headTop = new THREE.Vector3();
  function placeHp() {
    if (hp.hidden) return;
    kaiju.crown.getWorldPosition(headTop);
    const p = map.toScreen(headTop);
    hp.style.transform = `translate(${Math.round(p.x)}px, ${Math.round(p.y) - 14}px) translate(-50%, -100%)`;
  }

  // ---- teardown: everything goes, and the map works exactly as before ----
  let ended = false;
  function end() {
    if (ended) return;
    ended = true;
    s.mode = 'gone';
    stop();
    canvas.removeEventListener('pointermove', onMove);
    canvas.removeEventListener('pointerdown', onDown);
    window.removeEventListener('pointerup', onUp);
    window.removeEventListener('pointercancel', onCancel);
    window.removeEventListener('blur', onCancel);
    document.removeEventListener('keydown', onKey);
    canvas.style.translate = '';
    map.world.remove(group);
    fx.dispose();
    kaiju.dispose();
    plane.dispose();
    hp.remove();
    document.body.classList.remove('monster-on');
    // keep the victory banner up for a moment
    if (hud.querySelector('b').textContent === 'MONSTER DEFEATED!') setTimeout(() => hud.remove(), 2500);
    else hud.remove();
    onEnd();
  }

  const stop = map.onFrame(step);
  return { end };
}

// ---------------------------------------------------------------------------
// the monster: a stack of voxel boxes with pivots for legs, arms, tail, head and jaw

function buildKaiju() {
  const mats = new Map();
  const mat = (hex) => {
    if (!mats.has(hex)) mats.set(hex, new THREE.MeshLambertMaterial({ color: hex, flatShading: true }));
    return mats.get(hex);
  };
  const spineMat = new THREE.MeshLambertMaterial({ color: C.spine, flatShading: true });
  const box = (parent, w, h, d, x, y, z, hex) => {
    const m = new THREE.Mesh(BOX, hex === 'spine' ? spineMat : mat(hex));
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
  const hips = node(body, 0, 8, 0);

  const legs = [-1, 1].map((side) => {
    const leg = node(hips, side * 2.4, 0, 0);
    box(leg, 3.2, 5, 3.6, 0, -2.2, 0, C.body);
    box(leg, 2.6, 3, 2.8, 0, -5.6, 0.2, C.body);
    box(leg, 3.4, 1.4, 4.8, 0, -7.3, 0.9, C.dark);
    for (const cx of [-1.1, 0, 1.1]) box(leg, 0.6, 0.6, 0.8, cx, -7.7, 3.6, C.claw);
    const foot = node(leg, 0, -8, 1);
    return { leg, foot };
  });

  // tail: a chain of shrinking segments that droops to the ground
  const tail = [];
  let parent = node(hips, 0, -0.5, -2.2);
  const segs = [[4.4, 3.8, 3.6], [3.6, 3, 3.4], [2.8, 2.4, 3.2], [2.1, 1.8, 3], [1.5, 1.3, 2.8], [1, 0.9, 2.6]];
  segs.forEach(([w, h, d], i) => {
    const seg = node(parent, 0, 0, i ? -segs[i - 1][2] + 0.3 : 0);
    seg.rotation.x = i ? -0.16 : -0.35;
    box(seg, w, h, d, 0, 0, -d / 2, C.body);
    box(seg, w * 0.5, h * 0.25, d * 0.8, 0, -h * 0.45, -d / 2, C.belly);
    if (i < 5) box(seg, 0.6, 1.4 - i * 0.2, 1.6, 0, h / 2 + 0.5, -d / 2, 'spine');
    tail.push(seg);
    parent = seg;
  });

  const torso = node(hips, 0, 0, 0);
  torso.rotation.x = 0.18;
  box(torso, 6.4, 7.5, 5.2, 0, 3.6, 0, C.body);
  box(torso, 4.4, 6.4, 0.6, 0, 3.4, 2.75, C.belly);
  for (const y of [1.5, 3.1, 4.7]) box(torso, 4.6, 0.3, 0.7, 0, y, 2.8, C.dark); // belly ridges
  box(torso, 4.6, 3, 4.4, 0, 8.4, 0.6, C.body);
  const chest = node(torso, 0, 5, 1.5);
  // three rows of dorsal plates, tallest down the middle
  [2.2, 2.8, 3.2, 2.8, 2.2].forEach((h, i) => {
    box(torso, 0.7, h, 1.8, 0, 1 + i * 1.8, -3.1, 'spine');
    for (const sx of [-1.3, 1.3]) box(torso, 0.6, h * 0.6, 1.4, sx, 1.4 + i * 1.8, -2.8, 'spine');
  });
  const arms = [-1, 1].map((side) => {
    const arm = node(torso, side * 3.6, 6.4, 1.2);
    box(arm, 1.4, 3, 1.6, 0, -1.2, 0.4, C.body);
    box(arm, 1.2, 1.2, 2.4, 0, -2.6, 1.6, C.body);
    for (const cx of [-0.35, 0.35]) box(arm, 0.35, 0.6, 0.5, cx, -2.9, 3, C.claw);
    return arm;
  });

  const neck = node(torso, 0, 9.6, 1);
  const head = node(neck, 0, 0, 0);
  box(head, 3.8, 2.8, 4.4, 0, 1.2, 1.6, C.body);
  box(head, 4, 0.7, 1.2, 0, 2.5, 2.9, C.dark);
  box(head, 3.2, 1.2, 2.2, 0, 1, 4.6, C.body);
  for (const sx of [-1.3, 1.3]) box(head, 0.7, 0.6, 0.5, sx, 2, 3.6, C.eye);
  for (const sx of [-1, 0, 1]) box(head, 0.4, 0.5, 0.4, sx, 0.25, 5.4, C.tooth);
  const crown = node(head, 0, 4, 1.6);
  const jaw = node(head, 0, 0.4, 1);
  box(jaw, 3.2, 0.9, 4.2, 0, -0.45, 2.4, C.body);
  box(jaw, 2.6, 0.2, 3.6, 0, 0.05, 2.4, C.mouth);
  for (const sx of [-0.9, 0.9]) box(jaw, 0.4, 0.5, 0.4, sx, 0.3, 4.2, C.tooth);
  const mouth = node(head, 0, 0.5, 5.8);

  const all = [...mats.values(), spineMat];
  let flashing = false;
  return {
    root, body, hips, torso, neck, head, jaw, mouth, crown, chest, tail, arms, spineMat,
    footL: legs[0].foot, footR: legs[1].foot, legL: legs[0].leg, legR: legs[1].leg,
    setFlash(on) {
      if (on === flashing) return;
      flashing = on;
      for (const m of mats.values()) m.emissive.set(on ? 0x664444 : 0x000000);
    },
    dispose() { all.forEach((m) => m.dispose()); },
  };
}

// walk cycle: legs and arms swing, body bobs, tail sways; `still` freezes the stride while it breathes fire
function pose(k, phase, t, still) {
  const swing = Math.sin(phase) * 0.45 * (1 - still);
  k.legL.rotation.x = swing;
  k.legR.rotation.x = -swing;
  k.arms[0].rotation.x = -swing * 0.6 - 0.2;
  k.arms[1].rotation.x = swing * 0.6 - 0.2;
  k.hips.position.y = 8 - Math.abs(Math.sin(phase)) * 0.5 * (1 - still);
  k.torso.rotation.z = Math.sin(phase) * 0.04;
  k.tail.forEach((seg, i) => { seg.rotation.y = Math.sin(t * 1.6 - i * 0.7) * 0.1; });
  if (!still) {
    k.neck.rotation.x = Math.sin(phase * 2) * 0.05;
    k.jaw.rotation.x = Math.max(0, Math.sin(t * 0.9)) * 0.15;
  }
}

// ---------------------------------------------------------------------------
// the plane: a little red-and-white prop plane that faces +z

function buildPlane() {
  const mats = [];
  const root = new THREE.Group();
  const body = new THREE.Group();
  root.add(body);
  const box = (w, h, d, x, y, z, hex) => {
    const m = new THREE.MeshLambertMaterial({ color: hex, flatShading: true });
    mats.push(m);
    const mesh = new THREE.Mesh(BOX, m);
    mesh.scale.set(w, h, d);
    mesh.position.set(x, y, z);
    body.add(mesh);
    return mesh;
  };
  box(0.45, 0.45, 1.8, 0, 0, 0, '#ffffff');
  box(0.5, 0.5, 0.25, 0, 0, 1, PALETTE.pin);
  box(2.6, 0.12, 0.6, 0, 0.05, 0.2, PALETTE.pin);
  box(0.3, 0.25, 0.45, 0, 0.32, 0.25, PALETTE.glass);
  box(1.1, 0.1, 0.35, 0, 0.1, -0.8, PALETTE.pin);
  box(0.1, 0.5, 0.4, 0, 0.35, -0.8, PALETTE.pin);
  const prop = box(1.2, 0.12, 0.08, 0, 0, 1.18, '#1d2340');
  const muzzle = new THREE.Object3D();
  muzzle.position.set(0, 0, 1.3);
  body.add(muzzle);
  return { root, body, prop, muzzle, dispose() { mats.forEach((m) => m.dispose()); } };
}

// ---------------------------------------------------------------------------
// one instanced mesh of unlit cubes for flames, smoke, dust, bullets and fireworks

function particles(parent, max) {
  const mesh = new THREE.InstancedMesh(BOX, new THREE.MeshBasicMaterial(), max);
  mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  mesh.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(max * 3), 3);
  mesh.frustumCulled = false;
  mesh.count = 0;
  mesh.renderOrder = 15;
  parent.add(mesh);
  const list = [];
  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const sc = new THREE.Vector3();
  return {
    get size() { return list.length; },
    add(p) {
      if (list.length >= max) return;
      p.max = p.life;
      list.push(p);
    },
    step(dt) {
      const born = [];
      for (let i = list.length - 1; i >= 0; i--) {
        const p = list[i];
        p.life -= dt;
        if (p.life <= 0) {
          list.splice(i, 1);
          p.onDie?.(p.p);
          continue;
        }
        p.v.y -= (p.g ?? 0) * dt;
        if (p.drag) p.v.multiplyScalar(Math.max(0, 1 - p.drag * dt));
        p.p.addScaledVector(p.v, dt);
        // flames that reach the street spread out along it
        if (p.floor !== undefined && p.p.y < p.floor + 0.2) {
          p.p.y = p.floor + 0.2;
          p.v.y = 0.8;
          p.v.x *= 0.35;
          p.v.z *= 0.35;
          p.g = -1;
        }
        if (p.trail && Math.random() < 0.7) {
          born.push({ p: p.p.clone(), v: new THREE.Vector3(), life: 0.35, size: 0.3, g: 0.5, ramp: RAMPS.ember });
        }
      }
      born.forEach((p) => this.add(p));
      let n = 0;
      for (const p of list) {
        const age = 1 - p.life / p.max;
        const r = p.ramp;
        const c = r[Math.min(r.length - 1, Math.floor(age * r.length))];
        // flames grow then shrink; everything else just shrinks, in whole steps
        let size = p.size * (p.ramp === RAMPS.flame ? (age < 0.3 ? 0.6 + age : 1.3 - age * 0.6) : 1 - age * 0.5);
        if (p.twinkle && Math.random() < 0.25) size *= 0.4;
        m.compose(p.p, q, sc.set(size, size, size));
        mesh.setMatrixAt(n, m);
        mesh.setColorAt(n, c);
        n++;
      }
      mesh.count = n;
      mesh.instanceMatrix.needsUpdate = true;
      mesh.instanceColor.needsUpdate = true;
    },
    dispose() {
      list.length = 0;
      mesh.material.dispose();
      mesh.dispose();
    },
  };
}

// ---------------------------------------------------------------------------

// street level under a point: 0 in the water, the ground top on land (buildings ignored)
function floorAt(map, x, z) {
  return map.groundAt(x, z) > 0.3 ? 0.35 : 0;
}
function rand(r) { return (Math.random() * 2 - 1) * r; }
function rand3(r) { return new THREE.Vector3(rand(r), rand(r), rand(r)); }
function wrapAngle(a) { return Math.atan2(Math.sin(a), Math.cos(a)); }
