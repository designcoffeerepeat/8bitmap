// Monster easter egg. One of six voxel monsters attacks a corner of the city:
//   lizard  a kaiju wades in from the edge of the view, stomps toward Midtown and breathes fire on the streets
//   ape     a rather large ape leaps in, climbs the Empire State Building with a blond woman in its hand,
//           and swats at the plane from the top; when it falls she somersaults into the plane
//   alien   a long-limbed alien rises out of Central Park, roars and shakes off little parasites
//   fluff   the Always Pudgy Fluff Dude forms on the Upper West Side and stomps around, smiling
//   ufo     a flying saucer drifts over the Village beaming people up; shot down, gray aliens fall out on fire
//   robot   a giant robot on Wall Street shouts GIVE ME ALL YOUR JOBS! and lasers the towers with its eyes
// While it is on screen a little plane circles the cursor (on phones, the last tap); clicking or tapping fires
// the plane's machine gun. Once hit, a health bar shows over its head, and enough hits bring it down in a burst
// of 8-bit fireworks. It starts from MONSTER ATTACK! in the + menu (CALL OFF THE ATTACK ends it), or by itself
// every five minutes, cycling through the six, after a ten second warning with STOP and NO MORE.

import * as THREE from 'three';
import { COLS, ROWS, LANDMARKS, latLngToWorld } from './map/geo.js';
import { CATEGORY_COLORS, PALETTE } from './map/palette.js';

const AUTO_EVERY_MS = 5 * 60 * 1000;
const WARN_SECONDS = 10;
const NEXT_KEY = '8bm_monster_next'; // which monster the next automatic attack brings (per visit)
const OFF_KEY = '8bm_monster_off'; // NO MORE: no automatic attacks for the rest of the visit
const FIRE_RATE = 14; // bullets per second
const REDUCED_MOTION = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

const ESB = LANDMARKS.find((l) => l.id === 'esb');
const ESB_ROOF = 9.35; // top of the Empire State's main shaft (renderer.js: ground 0.35 + 3 + 6)
// Central Park's corners: 59th St & 5th Ave, 59th St & Central Park West, 110th St & CPW, 110th St & 5th Ave
const PARK = [[40.7644, -73.9730], [40.7681, -73.9819], [40.8003, -73.9582], [40.7968, -73.9493]].map(([a, b]) => latLngToWorld(a, b));

// center: where the camera flies; zoom: how close; hp: hits to bring it down; planeAlt: the plane's height;
// spread: how far bullets scatter around its chest; puff: size of its smoke when hurt
const MONSTERS = {
  lizard: { name: 'GIGANTIC LIZARD', tag: 'KAIJU', where: 'HEADED FOR MIDTOWN', at: [40.754, -73.984], zoom: 1.15, hp: 60, planeAlt: 13, spread: 1.3, puff: 1, create: createLizard },
  ape: { name: 'RATHER LARGE APE', tag: 'APE', where: 'AT THE EMPIRE STATE', at: [ESB.lat, ESB.lng], lookY: 6, zoom: 2.1, hp: 45, planeAlt: 18, spread: 0.5, puff: 0.5, create: createApe },
  alien: { name: 'ALIEN MONSTER', tag: 'ALIEN', where: 'IN CENTRAL PARK', at: [40.7812, -73.9665], zoom: 2, hp: 50, planeAlt: 9, spread: 0.8, puff: 0.6, create: createAlien },
  fluff: { name: 'ALWAYS PUDGY FLUFF DUDE', tag: 'DUDE', where: 'ON THE UPPER WEST SIDE', at: [40.7865, -73.9770], zoom: 2, hp: 50, planeAlt: 10, spread: 0.9, puff: 0.6, create: createFluff },
  ufo: { name: 'UFO', tag: 'UFO', where: 'OVER MANHATTAN', at: [40.7308, -73.9973], zoom: 2, hp: 50, planeAlt: 15, spread: 1.2, puff: 0.8, create: createUfo },
  robot: { name: 'GIANT ROBOT', tag: 'ROBOT', where: 'ON WALL STREET', at: [40.7069, -74.0113], zoom: 2, hp: 55, planeAlt: 11, spread: 1, puff: 0.7, create: createRobot },
};
const ORDER = ['lizard', 'ape', 'alien', 'fluff', 'ufo', 'robot'];

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
const RAMPS = {
  flame: ramp(FLAME), ember: ramp(EMBER), smoke: ramp(SMOKE), dust: ramp(DUST), boom: ramp(BOOM), bullet: ramp(['#ffffff', '#fff3a0']),
  goo: ramp(['#ffffff', '#fbf8f1', '#efe6d2', '#e4ddd0']), pale: ramp(['#e3dccd', '#b9ad9c', '#6f6559']),
  bugs: ramp(['#3b2f2a', '#2a211d']), sparkle: ramp(['#ffffff', '#fff3a0', '#9fcdea', '#ffffff']),
};

export function initMonster(map) {
  let game = null;
  let warning = null;
  let timer = 0;
  let next = 0;
  let off = REDUCED_MOTION;
  try {
    next = (Number(sessionStorage.getItem(NEXT_KEY)) || 0) % ORDER.length;
    off ||= sessionStorage.getItem(OFF_KEY) === '1';
  } catch {}
  const setNext = (i) => {
    next = i % ORDER.length;
    try { sessionStorage.setItem(NEXT_KEY, String(next)); } catch {}
  };
  const setState = (kind) => window.dispatchEvent(new CustomEvent('monster:state', { detail: { on: !!kind, kind } }));

  function launch(kind) {
    if (!MONSTERS[kind] || game?.kind === kind) return;
    clearWarning();
    game?.end();
    clearTimeout(timer);
    setNext(ORDER.indexOf(kind) + 1);
    game = startGame(map, MONSTERS[kind], () => { game = null; setState(null); schedule(); });
    game.kind = kind;
    setState(kind);
  }
  function stop() {
    clearWarning();
    game?.end();
  }

  // ---- automatic attacks: every five minutes, at a quiet moment (tab in view, nothing open), after a warning ----
  function schedule() {
    clearTimeout(timer);
    if (!off) timer = setTimeout(tryAuto, AUTO_EVERY_MS);
  }
  function tryAuto() {
    if (off || game || warning) return;
    const busy = document.hidden || document.querySelector('dialog[open]')
      || ['#site-menu', '#hood-menu', '#src-menu', '#cat-menu', '#detail'].some((sel) => document.querySelector(sel)?.hidden === false);
    if (busy) timer = setTimeout(tryAuto, 5000);
    else warn(ORDER[next]);
  }
  function warn(kind) {
    const spec = MONSTERS[kind];
    let left = WARN_SECONDS;
    const el = document.createElement('div');
    el.className = 'monster-hud monster-warn box';
    el.innerHTML = `<p role="alert"><b>WARNING!</b> MONSTER ATTACK IN <em>${left}</em><span>${spec.name} ${spec.where}</span></p>
      <div class="monster-acts"><button type="button" class="monster-btn" data-act="stop">STOP</button><button type="button" class="monster-btn" data-act="off">NO MORE</button></div>`;
    document.body.appendChild(el);
    const count = el.querySelector('em');
    const tick = setInterval(() => {
      left -= 1;
      if (left > 0) count.textContent = String(left);
      else launch(kind);
    }, 1000);
    el.addEventListener('click', (e) => {
      const act = e.target.closest('[data-act]')?.dataset.act;
      if (!act) return;
      clearWarning();
      setNext(next + 1); // a stopped monster gives the next one its turn
      if (act === 'off') {
        off = true;
        try { sessionStorage.setItem(OFF_KEY, '1'); } catch {}
      }
      schedule();
    });
    warning = { el, tick };
  }
  function clearWarning() {
    if (!warning) return;
    clearInterval(warning.tick);
    warning.el.remove();
    warning = null;
  }

  schedule();
  return { launch, stop };
}

function startGame(map, spec, onEnd) {
  const group = new THREE.Group();
  map.world.add(group);
  const fx = particles(group, 1400);
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
  hp.innerHTML = `<span>${spec.tag}</span><i><b></b></i>`;
  container.appendChild(hp);
  const hpFill = hp.querySelector('b');
  document.body.classList.add('monster-on');

  // ---- the camera flies to its corner of the city ----
  const c = latLngToWorld(spec.at[0], spec.at[1]);
  const center = new THREE.Vector3(c.x, 0, c.z);
  map.flyTo(new THREE.Vector3(c.x, spec.lookY ?? 0, c.z), spec.zoom);
  const aspect = canvas.clientWidth / Math.max(1, canvas.clientHeight);

  const s = { hp: spec.hp, mode: 'alive', modeT: 0, flash: 0, fires: [], fireUntil: 0, held: false, shot: 0, t: 0, vanished: false };
  const ctx = {
    map, fx, group, plane, s, center,
    halfW: (70 / spec.zoom) * aspect / 2, // half the view's width in world units
    // a spot just past the left or right edge of the view, level with the center
    edgePoint(dist) {
      const right = new THREE.Vector3(1, 0, 0).applyQuaternion(map.camera.quaternion).setY(0).normalize();
      const p = center.clone().addScaledVector(right, Math.random() < 0.5 ? -dist : dist);
      p.x = THREE.MathUtils.clamp(p.x, -COLS / 2 + 2, COLS / 2 - 2);
      p.z = THREE.MathUtils.clamp(p.z, -ROWS / 2 + 2, ROWS / 2 - 2);
      return p;
    },
    shake, dustRing, explode,
    say(text) { hudText.textContent = text; },
  };
  const m = spec.create(ctx);
  group.add(m.root);

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
    m.chest.getWorldPosition(chest);

    if (s.mode === 'alive') {
      m.update(dt, t);
      if (s.hp < spec.hp * 0.35 && Math.random() < dt * 8) {
        fx.add({ p: chest.clone().add(rand3(spec.puff)), v: new THREE.Vector3(rand(0.5), 2 + Math.random(), rand(0.5)), life: 1.6, size: 0.5 * spec.puff, g: -0.5, ramp: RAMPS.smoke });
      }
    } else if (s.mode === 'dying') {
      s.modeT += dt;
      if (!s.vanished && m.die(dt, s.modeT)) {
        // it goes, and the fireworks start where it fell
        s.vanished = s.modeT;
        m.root.visible = false;
        const at = m.root.position.clone();
        for (let i = 0; i < 9; i++) setTimeout(() => shell(at), i * 330 + Math.random() * 200);
      }
      if (s.vanished && s.modeT - s.vanished > 5.5 && fx.size === 0) return end();
    }

    // hit flash
    if (s.flash > 0) {
      s.flash -= dt;
      m.setFlash(s.flash > 0);
    }

    // ---- the plane circles the cursor, high over the streets ----
    let cx = pointer.x;
    let cy = pointer.y;
    if (cx === null) {
      const r = canvas.getBoundingClientRect();
      cx = r.left + r.width * 0.5;
      cy = r.top + r.height * 0.4;
    }
    const aim = map.rayToHeight(cx, cy, spec.planeAlt) ?? chest;
    const orbit = t * 1.8;
    tmp.set(aim.x + Math.cos(orbit) * 2.2 * k, spec.planeAlt, aim.z + Math.sin(orbit) * 2.2 * k);
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
    pr.scale.setScalar(k * 0.9);
    plane.prop.rotation.z += dt * 40;
    pr.visible = s.mode !== 'gone';

    // ---- machine gun ----
    if (s.held) s.fireUntil = Math.max(s.fireUntil, t + 0.05);
    if (t < s.fireUntil && m.root.visible && s.mode === 'alive') {
      s.shot += dt * FIRE_RATE;
      while (s.shot >= 1) {
        s.shot -= 1;
        const from = plane.muzzle.getWorldPosition(new THREE.Vector3());
        const target = chest.clone().add(rand3(spec.spread));
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

  function dustRing(p, n, speed, colors = RAMPS.dust, size = 0.45) {
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2;
      fx.add({ p: p.clone().setY(p.y + 0.2), v: new THREE.Vector3(Math.cos(a) * speed, 0.6 + Math.random(), Math.sin(a) * speed), life: 0.6 + Math.random() * 0.3, size, g: 1, drag: 2.5, ramp: colors });
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
    if (s.mode !== 'alive') return;
    for (let i = 0; i < 4; i++) fx.add({ p: p.clone(), v: rand3(4), life: 0.25, size: 0.3, g: 4, ramp: RAMPS.bullet });
    s.hp -= 1;
    s.flash = 0.06;
    hp.hidden = false;
    hpFill.style.width = `${Math.max(0, (s.hp / spec.hp) * 100)}%`;
    hp.classList.toggle('is-low', s.hp < spec.hp * 0.35);
    if (s.hp <= 0) {
      s.mode = 'dying';
      s.modeT = 0;
      hp.hidden = true;
      hud.querySelector('b').textContent = 'MONSTER DEFEATED!';
      hudText.textContent = 'NYC IS SAVED';
      m.onDefeat?.();
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
    m.crown.getWorldPosition(headTop);
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
    m.dispose();
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
// what each monster does: update() while it is alive, onDefeat() at the last hit, and die(), which plays its
// fall and returns true once its body should vanish for the fireworks

// turn toward a goal and move forward; returns the distance still to go
function walkTo(root, st, goal, speed, dt, turn = 1.5) {
  const want = Math.atan2(goal.x - root.position.x, goal.z - root.position.z);
  st.heading += wrapAngle(want - st.heading) * Math.min(1, dt * turn);
  root.rotation.y = st.heading;
  root.position.x += Math.sin(st.heading) * speed * dt;
  root.position.z += Math.cos(st.heading) * speed * dt;
  return Math.hypot(goal.x - root.position.x, goal.z - root.position.z);
}
// advance a walk cycle; returns the foot that just came down (-1 or 1), or 0
function stride(st, dt, seconds) {
  const prev = Math.sin(st.phase);
  st.phase += (dt / seconds) * Math.PI * 2;
  const now = Math.sin(st.phase);
  return Math.sign(now) !== Math.sign(prev) ? Math.sign(now) : 0;
}
function settle(map, root, dt) {
  root.position.y += (floorAt(map, root.position.x, root.position.z) - root.position.y) * Math.min(1, dt * 4);
}
const ease = (x) => 1 - (1 - x) ** 3;

// the gigantic lizard: wades in from the edge of the view, stomps around Midtown and breathes fire
function createLizard(ctx) {
  const { map, s, fx, center } = ctx;
  const kaiju = buildKaiju();
  const root = kaiju.root;
  const start = ctx.edgePoint(THREE.MathUtils.clamp(ctx.halfW + 5, 18, 70));
  root.position.copy(start);
  root.position.y = floorAt(map, start.x, start.z);
  const st = { mode: 'walk', modeT: 0, phase: 0, nextBreath: 3 + Math.random() * 2, heading: Math.atan2(center.x - start.x, center.z - start.z), goal: center.clone(), fallDir: 1, landed: false };
  root.rotation.y = st.heading;
  const chest = new THREE.Vector3();

  function stomp(foot) {
    const p = foot.getWorldPosition(new THREE.Vector3());
    p.y = floorAt(map, p.x, p.z);
    ctx.dustRing(p, 14, 1.4);
    ctx.shake(2, 0.12);
  }

  function breathe(dt) {
    const T = st.modeT;
    // rear back, glow, then rake fire across the street ahead
    const rear = Math.min(1, T / 0.5);
    const fire = T > 0.5 && T < 2.4;
    kaiju.neck.rotation.x = fire ? 0.35 : -0.35 * rear;
    kaiju.jaw.rotation.x = 0.55 * (fire ? 1 : rear);
    kaiju.spineMat.emissive.set(C.glow).multiplyScalar(Math.min(1, T / 0.5) * (0.6 + Math.sin(T * 30) * 0.15));
    pose(kaiju, st.phase, s.t, fire ? 1 : 0);
    if (!fire) return;
    const mouth = kaiju.mouth.getWorldPosition(new THREE.Vector3());
    const sweep = Math.sin((T - 0.5) * 2.2) * 0.6;
    const ang = st.heading + sweep;
    const reach = 6 + Math.sin(T * 3);
    const tx = root.position.x + Math.sin(ang) * reach;
    const tz = root.position.z + Math.cos(ang) * reach;
    const floor = floorAt(map, tx, tz);
    const target = new THREE.Vector3(tx, floor, tz);
    const n = Math.round(dt * 80);
    for (let i = 0; i < n; i++) {
      const dir = target.clone().add(rand3(0.6)).sub(mouth);
      const life = 0.55;
      fx.add({
        p: mouth.clone(), v: dir.divideScalar(life * 0.8), life, size: 0.25 + Math.random() * 0.2, g: 2, ramp: RAMPS.flame, floor,
      });
    }
    if (floor > 0.32 && Math.random() < dt * 6 && s.fires.length < 40) {
      s.fires.push({ p: new THREE.Vector3(tx + rand(0.8), floor, tz + rand(0.8)), life: 5 + Math.random() * 5 });
    }
  }

  return {
    root, chest: kaiju.chest, crown: kaiju.crown, setFlash: kaiju.setFlash, dispose: kaiju.dispose,
    update(dt, t) {
      st.modeT += dt;
      if (st.mode === 'walk') {
        walkTo(root, st, st.goal, 0.7, dt);
        const foot = stride(st, dt, 1.2);
        if (foot) stomp(foot > 0 ? kaiju.footR : kaiju.footL);
        pose(kaiju, st.phase, t, 0);
        // once it reaches Midtown it keeps stomping around nearby
        if (Math.hypot(st.goal.x - root.position.x, st.goal.z - root.position.z) < 2) {
          const a = Math.random() * Math.PI * 2;
          const r = 4 + Math.random() * 7;
          st.goal = new THREE.Vector3(center.x + Math.cos(a) * r, 0, center.z + Math.sin(a) * r);
        }
        if (st.modeT > st.nextBreath) { st.mode = 'breath'; st.modeT = 0; }
      } else {
        breathe(dt);
        if (st.modeT > 2.8) {
          st.mode = 'walk'; st.modeT = 0; st.nextBreath = 3.5 + Math.random() * 3;
          kaiju.spineMat.emissive.set(0x000000);
        }
      }
      settle(map, root, dt);
    },
    onDefeat() {
      st.fallDir = Math.random() < 0.5 ? -1 : 1;
      kaiju.spineMat.emissive.set(0x000000);
    },
    die(dt, T) {
      const f = Math.min(1, T / 1.3);
      kaiju.body.rotation.z = st.fallDir * f * f * 1.5;
      kaiju.head.rotation.x = -0.4 * f;
      kaiju.jaw.rotation.x = 0.6 * f;
      kaiju.chest.getWorldPosition(chest);
      if (f >= 1 && !st.landed) {
        st.landed = true;
        ctx.shake(6, 0.5);
        ctx.explode(chest.clone(), 140, 5, RAMPS.boom, 0.45);
        ctx.dustRing(root.position, 40, 4);
      }
      if (st.landed && T > 1.55) {
        ctx.explode(chest.clone(), 80, 3.5, RAMPS.flame, 0.35);
        return true;
      }
      return false;
    },
  };
}

// the rather large ape: leaps in beside the Empire State Building, beats its chest, climbs to the top with the
// woman in its hand, and swats at the plane. Shot down, it lets go: she somersaults into the plane and it falls.
function createApe(ctx) {
  const { map, plane, group, center } = ctx;
  const ape = buildApe();
  const root = ape.root;
  // climb the face of the tower nearest the camera
  const fwd = new THREE.Vector3(0, 0, -1).applyQuaternion(map.camera.quaternion);
  const n = Math.abs(fwd.x) > Math.abs(fwd.z) ? new THREE.Vector3(-Math.sign(fwd.x), 0, 0) : new THREE.Vector3(0, 0, -Math.sign(fwd.z));
  const along = new THREE.Vector3(n.z, 0, -n.x);
  const base = center.clone().addScaledVector(n, 1.3).setY(0.35);
  const from = base.clone().addScaledVector(along, (Math.random() < 0.5 ? -1 : 1) * 8).addScaledVector(n, 3);
  from.y = floorAt(map, from.x, from.z);
  root.position.copy(from);
  const faceIn = Math.atan2(-n.x, -n.z);
  const faceOut = Math.atan2(n.x, n.z);
  const st = { mode: 'leap', modeT: 0, phase: 0, heading: Math.atan2(base.x - from.x, base.z - from.z), next: 3, act: null, fallV: 0, landed: 0, woman: null };
  root.rotation.y = st.heading;
  const chest = new THREE.Vector3();
  const set = (mode) => { st.mode = mode; st.modeT = 0; };
  const [armL, armR] = ape.arms;

  // the woman flails in its fist the whole time
  function flail(t) {
    const w = ape.woman;
    w.arms[0].rotation.z = 2.6 + Math.sin(t * 14) * 0.5;
    w.arms[1].rotation.z = -2.6 - Math.sin(t * 14 + 1) * 0.5;
    w.legs[0].rotation.x = Math.sin(t * 11) * 0.5;
    w.legs[1].rotation.x = -Math.sin(t * 11) * 0.5;
  }
  // the right arm holds her out to the side
  function holdOut() {
    armR.rotation.set(-0.7, 0, 0.35);
    ape.elbows[1].rotation.x = -1;
  }
  function beatChest(T) {
    armL.rotation.set(-1.4, 0, -0.3 + Math.sin(T * 18) * 0.35);
    ape.elbows[0].rotation.x = -1.6;
    ape.jaw.rotation.x = 0.5;
    ape.head.rotation.x = -0.35;
  }
  function relax(dt) {
    ape.jaw.rotation.x *= 1 - Math.min(1, dt * 6);
    ape.head.rotation.x *= 1 - Math.min(1, dt * 6);
  }

  return {
    root, chest: ape.chest, crown: ape.crown, setFlash: ape.setFlash, dispose: ape.dispose,
    update(dt, t) {
      st.modeT += dt;
      const T = st.modeT;
      flail(t);
      if (st.mode === 'leap') {
        // one bound from the side street to the foot of the tower
        const e = Math.min(1, T / 1.1);
        root.position.lerpVectors(from, base, e);
        root.position.y = THREE.MathUtils.lerp(from.y, base.y, e) + Math.sin(Math.PI * e) * 4;
        ape.torso.rotation.x = 0.5;
        armL.rotation.set(-2.4, 0, 0);
        holdOut();
        if (e >= 1) {
          ctx.shake(3, 0.2);
          ctx.dustRing(base, 18, 1.6);
          set('beat');
        }
      } else if (st.mode === 'beat') {
        st.heading += wrapAngle(faceOut - st.heading) * Math.min(1, dt * 6);
        root.rotation.y = st.heading;
        ape.torso.rotation.x = -0.1;
        beatChest(T);
        holdOut();
        if (T > 1.4) set('climb');
      } else if (st.mode === 'climb') {
        // up the face of the tower, hand over hand
        st.heading += wrapAngle(faceIn - st.heading) * Math.min(1, dt * 6);
        root.rotation.y = st.heading;
        relax(dt);
        stride(st, dt, 0.9);
        const sw = Math.sin(st.phase);
        root.position.y = Math.min(ESB_ROOF - 2.4, root.position.y + dt * (0.9 + 0.5 * Math.abs(sw)));
        ape.torso.rotation.x = 0.15;
        armL.rotation.set(-2.7 + sw * 0.4, 0, 0);
        ape.elbows[0].rotation.x = -0.3 - Math.max(0, sw) * 0.6;
        holdOut();
        ape.legs[0].rotation.x = -0.6 + sw * 0.4;
        ape.legs[1].rotation.x = -0.6 - sw * 0.4;
        if (root.position.y >= ESB_ROOF - 2.4) set('mount');
      } else if (st.mode === 'mount') {
        // haul up onto the roof and turn to face the city
        const e = ease(Math.min(1, T / 0.9));
        root.position.copy(center).addScaledVector(n, THREE.MathUtils.lerp(1.3, 0.8, e));
        root.position.y = THREE.MathUtils.lerp(ESB_ROOF - 2.4, ESB_ROOF, e);
        st.heading = faceIn + wrapAngle(faceOut - faceIn) * e;
        root.rotation.y = st.heading;
        ape.legs[0].rotation.x = ape.legs[1].rotation.x = -0.6 * (1 - e);
        if (e >= 1) { set('top'); st.next = 1; }
      } else {
        // on top: beat its chest, or swat at the plane when it comes close
        if (!st.act && T > st.next) {
          st.act = plane.root.position.distanceTo(root.position) < 6 && Math.random() < 0.7 ? 'swat' : 'beat';
          st.actT = 0;
        }
        holdOut();
        ape.torso.rotation.x = -0.05;
        if (st.act) {
          st.actT += dt;
          if (st.act === 'beat') beatChest(st.actT);
          else {
            const a = Math.min(1, st.actT / 0.7);
            armL.rotation.set(-2.8 + Math.sin(a * Math.PI) * 1.8, 0, -0.4);
            ape.elbows[0].rotation.x = -0.2;
            ape.jaw.rotation.x = 0.4;
          }
          if (st.actT > (st.act === 'beat' ? 1.5 : 0.7)) { st.act = null; st.next = T + 1.5 + Math.random() * 2; }
        } else {
          // hangs on to the spire with its free hand
          armL.rotation.set(-2.5, 0, -0.5);
          ape.elbows[0].rotation.x = -0.5;
          relax(dt);
        }
      }
    },
    onDefeat() {
      // she lets go of its fist and somersaults into the plane
      const w = ape.woman.root;
      group.attach(w);
      st.woman = { from: w.position.clone(), spin: w.rotation.x, size: w.scale.x };
      armR.rotation.set(-2.6, 0, 0.3);
    },
    die(dt, T) {
      // her flight
      const w = ape.woman.root;
      if (st.woman && w.visible) {
        const e = Math.min(1, T / 1.3);
        w.position.lerpVectors(st.woman.from, plane.root.position, ease(e));
        w.position.y += Math.sin(Math.PI * e) * 1.6;
        w.rotation.set(st.woman.spin - e * Math.PI * 4, 0, 0);
        w.scale.setScalar(st.woman.size * (1 - e * 0.5));
        ape.woman.arms[0].rotation.z = 0.3;
        ape.woman.arms[1].rotation.z = -0.3;
        if (e >= 1) {
          w.visible = false;
          plane.passenger.visible = true;
          ctx.say("SHE'S SAFE ON BOARD");
        }
      }
      // its fall: a stagger, then off the tower, tumbling, to the street
      ape.chest.getWorldPosition(chest);
      if (T < 0.5) {
        root.position.x += rand(0.04);
        ape.jaw.rotation.x = 0.7;
        armL.rotation.set(-2.6, 0, -0.6);
      } else if (!st.landed) {
        st.fallV -= 16 * dt;
        root.position.y += st.fallV * dt;
        root.position.addScaledVector(n, dt * 1.6);
        ape.body.rotation.x -= dt * 2.4;
        const floor = floorAt(map, root.position.x, root.position.z);
        if (root.position.y <= floor) {
          root.position.y = floor;
          st.landed = T;
          ctx.shake(6, 0.5);
          ctx.explode(chest.clone(), 120, 4, RAMPS.boom, 0.35);
          ctx.dustRing(root.position, 36, 3);
        }
      }
      return !!st.landed && T - st.landed > 0.4 && !w.visible;
    },
  };
}

// the alien monster: rises out of Central Park, prowls the park on its long arms, rears up to roar and shakes
// off a shower of little parasites
function createAlien(ctx) {
  const { map, s, fx, center } = ctx;
  const al = buildAlien();
  const root = al.root;
  const parkPoint = (u, v) => {
    const a = new THREE.Vector3(PARK[0].x, 0, PARK[0].z).lerp(new THREE.Vector3(PARK[3].x, 0, PARK[3].z), v);
    const b = new THREE.Vector3(PARK[1].x, 0, PARK[1].z).lerp(new THREE.Vector3(PARK[2].x, 0, PARK[2].z), v);
    return a.lerp(b, u);
  };
  // stays around the middle of the park, where the camera is
  const goalNear = () => parkPoint(0.2 + Math.random() * 0.6, 0.32 + Math.random() * 0.36);
  const start = center.clone().add(new THREE.Vector3(rand(1), 0, rand(1)));
  const floor0 = floorAt(map, start.x, start.z);
  root.position.set(start.x, floor0 - 6, start.z);
  const st = { mode: 'rise', modeT: 0, phase: 0, heading: Math.random() * Math.PI * 2, goal: goalNear(), next: 4, roared: false };
  root.rotation.y = st.heading;
  const chest = new THREE.Vector3();
  const set = (mode) => { st.mode = mode; st.modeT = 0; st.roared = false; };

  function roar(T) {
    // rear up on the hind legs, arms out, jaw wide
    const up = Math.sin(Math.min(1, T / 2) * Math.PI);
    al.torso.rotation.x = -0.25 - up * 0.55;
    for (const a of al.arms) a.rotation.x = -up * 1.3;
    al.jaw.rotation.x = up * 0.9;
    al.head.rotation.y = Math.sin(T * 20) * 0.12 * up;
    if (T > 0.7 && !st.roared) {
      st.roared = true;
      ctx.shake(4, 0.5);
      ctx.dustRing(root.position, 30, 3.2);
      al.chest.getWorldPosition(chest);
      for (let i = 0; i < 34; i++) {
        fx.add({ p: chest.clone().add(rand3(1)), v: new THREE.Vector3(rand(2.5), 1 + Math.random() * 2, rand(2.5)), life: 1.2 + Math.random() * 0.6, size: 0.18, g: 6, drag: 0.6, ramp: RAMPS.bugs, floor: floorAt(map, root.position.x, root.position.z) });
      }
    }
  }

  return {
    root, chest: al.chest, crown: al.crown, setFlash: al.setFlash, dispose: al.dispose,
    update(dt, t) {
      st.modeT += dt;
      const T = st.modeT;
      al.tail.forEach((seg, i) => { seg.rotation.y = Math.sin(t * 2.2 - i * 0.7) * 0.18; });
      if (st.mode === 'rise') {
        // claws its way up out of the ground in a cloud of dust
        const e = ease(Math.min(1, T / 3.2));
        root.position.y = floor0 - 6 * (1 - e);
        if (Math.random() < dt * 30) {
          const a = Math.random() * Math.PI * 2;
          fx.add({ p: new THREE.Vector3(root.position.x + Math.cos(a) * 2, floor0 + 0.2, root.position.z + Math.sin(a) * 2), v: new THREE.Vector3(Math.cos(a) * 1.2, 1 + Math.random() * 2, Math.sin(a) * 1.2), life: 0.9, size: 0.45, g: 1, drag: 1.5, ramp: RAMPS.dust });
        }
        if (Math.random() < dt * 4) ctx.shake(2, 0.15);
        if (e >= 1) set('roar');
      } else if (st.mode === 'roar') {
        roar(T);
        if (T > 2) { set('walk'); st.next = 4 + Math.random() * 3; }
      } else {
        if (walkTo(root, st, st.goal, 1.1, dt, 1.2) < 1.5) st.goal = goalNear();
        const foot = stride(st, dt, 1.1);
        if (foot) ctx.shake(1, 0.08);
        const sw = Math.sin(st.phase) * 0.45;
        al.legs[0].rotation.x = sw;
        al.legs[1].rotation.x = -sw;
        al.arms[0].rotation.x = -sw * 0.8;
        al.arms[1].rotation.x = sw * 0.8;
        al.torso.rotation.x = -0.25 + Math.abs(Math.sin(st.phase)) * 0.04;
        al.jaw.rotation.x = Math.max(0, Math.sin(t * 1.3)) * 0.2;
        al.head.rotation.y = Math.sin(t * 0.8) * 0.3;
        settle(map, root, dt);
        if (T > st.next) set('roar');
      }
    },
    die(dt, T) {
      // the arms give way and it slumps forward onto the grass
      const f = Math.min(1, T / 1.2);
      al.torso.rotation.x = -0.25 + f * f * 0.75;
      for (const a of al.arms) a.rotation.x = f * 1.1;
      al.jaw.rotation.x = 0.8 * f;
      root.position.y = floorAt(map, root.position.x, root.position.z) - f * f * 1.2;
      if (f >= 1 && !st.landed) {
        st.landed = true;
        ctx.shake(5, 0.4);
        al.chest.getWorldPosition(chest);
        ctx.dustRing(root.position, 36, 3.5);
        ctx.explode(chest.clone(), 90, 4, RAMPS.boom, 0.35);
        ctx.explode(chest.clone(), 60, 3, RAMPS.pale, 0.3);
      }
      return T > 1.45;
    },
  };
}

// the Always Pudgy Fluff Dude: forms out of thin air on the Upper West Side, waddles along the streets smiling and
// jumps to stomp them flat. Shot down, it swells, catches fire and pops in a rain of marshmallow.
function createFluff(ctx) {
  const { map, s, fx, center } = ctx;
  const pf = buildFluff();
  const root = pf.root;
  const start = center.clone().add(new THREE.Vector3(rand(2), 0, rand(2)));
  root.position.set(start.x, floorAt(map, start.x, start.z), start.z);
  const st = { mode: 'form', modeT: 0, phase: 0, heading: Math.random() * Math.PI * 2, goal: null, next: 4 };
  const goalNear = () => {
    const a = Math.random() * Math.PI * 2;
    const r = 2 + Math.random() * 5;
    return new THREE.Vector3(center.x + Math.cos(a) * r, 0, center.z + Math.sin(a) * r);
  };
  st.goal = goalNear();
  root.rotation.y = st.heading;
  root.scale.setScalar(0.05);
  const chest = new THREE.Vector3();
  const set = (mode) => { st.mode = mode; st.modeT = 0; };

  return {
    root, chest: pf.chest, crown: pf.crown, setFlash: pf.setFlash, dispose: pf.dispose,
    update(dt, t) {
      st.modeT += dt;
      const T = st.modeT;
      if (st.mode === 'form') {
        // grows out of a swirl of sparkles
        const e = Math.min(1, T / 2.4);
        root.scale.setScalar(0.05 + 0.95 * (e < 1 ? ease(e) + Math.sin(e * Math.PI) * 0.08 : 1));
        if (Math.random() < dt * 40) {
          const a = Math.random() * Math.PI * 2;
          const r = 1.5 + Math.random() * 2;
          fx.add({ p: new THREE.Vector3(root.position.x + Math.cos(a) * r, root.position.y + Math.random() * 6, root.position.z + Math.sin(a) * r), v: new THREE.Vector3(-Math.sin(a) * 2, 0.5, Math.cos(a) * 2), life: 0.7, size: 0.25, g: 0, ramp: RAMPS.sparkle, twinkle: true });
        }
        if (e >= 1) { root.scale.setScalar(1); set('walk'); }
      } else if (st.mode === 'walk') {
        // a happy waddle
        if (walkTo(root, st, st.goal, 0.9, dt) < 1.2) st.goal = goalNear();
        const foot = stride(st, dt, 1.3);
        if (foot) {
          const p = (foot > 0 ? pf.feet[1] : pf.feet[0]).getWorldPosition(new THREE.Vector3());
          p.y = floorAt(map, p.x, p.z);
          ctx.dustRing(p, 10, 1.1);
          ctx.shake(1.5, 0.1);
        }
        const sw = Math.sin(st.phase);
        pf.legs[0].rotation.x = sw * 0.4;
        pf.legs[1].rotation.x = -sw * 0.4;
        pf.arms[0].rotation.x = -sw * 0.35;
        pf.arms[1].rotation.x = sw * 0.35;
        pf.body.rotation.z = sw * 0.07;
        pf.hips.position.y = 7 - Math.abs(sw) * 0.4;
        pf.head.rotation.y = Math.sin(t * 0.7) * 0.25;
        settle(map, root, dt);
        if (T > st.next) set('jump');
      } else {
        // crouch, jump, and come down hard
        const floor = floorAt(map, root.position.x, root.position.z);
        pf.legs[0].rotation.x = pf.legs[1].rotation.x = 0;
        pf.body.rotation.z = 0;
        if (T < 0.35) {
          pf.hips.position.y = 7 - (T / 0.35) * 1.4;
          for (const a of pf.arms) a.rotation.z = 0;
        } else if (T < 1.05) {
          const e = (T - 0.35) / 0.7;
          pf.hips.position.y = 7;
          root.position.y = floor + Math.sin(e * Math.PI) * 1.8;
          pf.arms[0].rotation.z = -1.2 * Math.sin(e * Math.PI);
          pf.arms[1].rotation.z = 1.2 * Math.sin(e * Math.PI);
        } else if (!st.landed) {
          st.landed = true;
          root.position.y = floor;
          ctx.shake(5, 0.35);
          ctx.dustRing(root.position, 40, 3.2);
          ctx.dustRing(root.position, 24, 2.2, RAMPS.goo, 0.35);
        } else {
          pf.hips.position.y = 7 - Math.max(0, 0.6 - (T - 1.05) * 3);
          if (T > 1.4) {
            for (const a of pf.arms) a.rotation.z = 0;
            st.landed = false;
            set('walk');
            st.next = 4 + Math.random() * 3;
          }
        }
      }
    },
    die(dt, T) {
      // swells up and burns, then pops
      const f = Math.min(1, T / 1);
      root.scale.setScalar(1 + f * f * 0.35);
      pf.setFlash(Math.sin(T * 30) > 0);
      pf.chest.getWorldPosition(chest);
      if (Math.random() < dt * 40) {
        fx.add({ p: chest.clone().add(rand3(2)), v: new THREE.Vector3(rand(0.5), 2 + Math.random() * 2, rand(0.5)), life: 0.7, size: 0.4, g: -0.5, ramp: RAMPS.flame });
      }
      if (f < 1) return false;
      ctx.shake(6, 0.5);
      ctx.explode(chest.clone(), 220, 7, RAMPS.goo, 0.45);
      ctx.explode(chest.clone(), 60, 4, RAMPS.boom, 0.35);
      ctx.dustRing(root.position, 30, 3, RAMPS.goo, 0.4);
      return true;
    },
  };
}

// the UFO: a flying saucer swoops down over Manhattan, drifts over the Village and beams people up off the
// streets. Shot down, it spins out of the sky and little gray aliens fall out of it on fire.
function createUfo(ctx) {
  const { map, fx, group, center } = ctx;
  const u = buildUfo();
  const root = u.root;
  const HOVER = 11; // well over the rooftops
  const goalNear = () => {
    const a = Math.random() * Math.PI * 2;
    const r = 2 + Math.random() * 6;
    return new THREE.Vector3(center.x + Math.cos(a) * r, HOVER, center.z + Math.sin(a) * r);
  };
  const from = ctx.edgePoint(THREE.MathUtils.clamp(ctx.halfW + 4, 12, 40)).setY(HOVER + 14);
  const arrive = goalNear();
  root.position.copy(from);
  const st = { mode: 'arrive', modeT: 0, goal: goalNear(), next: 3, riders: [], falling: [], fallV: 0, landed: 0 };
  const set = (mode) => { st.mode = mode; st.modeT = 0; };
  const beamFloor = () => floorAt(map, root.position.x, root.position.z);

  // a little person standing in the beam, carried up and into the saucer
  function pickUp() {
    const p = buildTiny(SPARKS[Math.floor(Math.random() * SPARKS.length)], u.tinyMats);
    const a = Math.random() * Math.PI * 2;
    const r = Math.random() * 0.8;
    p.position.set(root.position.x + Math.cos(a) * r, beamFloor(), root.position.z + Math.sin(a) * r);
    group.add(p);
    st.riders.push({ p, spin: rand(4) });
  }
  function carry(dt) {
    for (let i = st.riders.length - 1; i >= 0; i--) {
      const { p, spin } = st.riders[i];
      p.position.y += dt * 1.6;
      p.position.x += (root.position.x - p.position.x) * Math.min(1, dt * 0.8);
      p.position.z += (root.position.z - p.position.z) * Math.min(1, dt * 0.8);
      p.rotation.y += spin * dt;
      p.rotation.z = Math.sin(p.position.y * 3) * 0.4;
      if (p.position.y > root.position.y - 0.8) {
        fx.add({ p: p.position.clone(), v: new THREE.Vector3(), life: 0.3, size: 0.4, g: 0, ramp: RAMPS.sparkle });
        group.remove(p);
        st.riders.splice(i, 1);
      }
    }
  }

  function float(dt, t) {
    root.position.y += (HOVER + Math.sin(t * 1.7) * 0.3 - root.position.y) * Math.min(1, dt * 2);
    u.body.rotation.y += dt * 1.5;
    root.rotation.x = Math.sin(t * 1.3) * 0.06;
    root.rotation.z = Math.cos(t * 1.1) * 0.06;
  }

  return {
    root, chest: u.chest, crown: u.crown, setFlash: u.setFlash,
    dispose() { st.riders.forEach(({ p }) => group.remove(p)); u.dispose(); },
    update(dt, t) {
      st.modeT += dt;
      const T = st.modeT;
      u.blink(t);
      carry(dt);
      if (st.mode === 'arrive') {
        // swoops down out of the sky
        const e = ease(Math.min(1, T / 2.6));
        root.position.lerpVectors(from, arrive, e);
        u.body.rotation.y += dt * 4;
        if (e >= 1) { set('drift'); st.goal = goalNear(); }
      } else if (st.mode === 'drift') {
        const d = tmpV.subVectors(st.goal, root.position).setY(0);
        if (d.length() < 0.5) st.goal = goalNear();
        root.position.addScaledVector(d.normalize(), dt * 2.2);
        float(dt, t);
        if (T > st.next) set('beam');
      } else {
        // the tractor beam: down for three seconds, a few people float up it
        float(dt, t);
        const on = T < 3.2;
        u.beam.visible = on;
        if (on) {
          const h = root.position.y - beamFloor();
          u.beam.position.y = -h / 2;
          u.beam.scale.y = h;
          u.beamMat.opacity = 0.4 + Math.sin(t * 20) * 0.06;
          if (Math.random() < dt * 1.3 && st.riders.length < 4) pickUp();
          if (Math.random() < dt * 12) {
            fx.add({ p: new THREE.Vector3(root.position.x + rand(0.8), beamFloor() + Math.random() * h, root.position.z + rand(0.8)), v: new THREE.Vector3(0, 1.5, 0), life: 0.5, size: 0.15, g: 0, ramp: RAMPS.sparkle, twinkle: true });
          }
        }
        if (T > 4) { u.beam.visible = false; set('drift'); st.next = 3 + Math.random() * 3; }
      }
    },
    onDefeat() {
      u.beam.visible = false;
      // anyone still in the beam drops back to the street, unhurt
      st.riders.forEach(({ p }) => group.remove(p));
      st.riders.length = 0;
    },
    die(dt, T) {
      // spins and smokes, then drops out of the sky; the crew falls out on fire
      u.body.rotation.y += dt * (8 + T * 6);
      root.rotation.z = Math.min(0.9, T * 0.6);
      if (Math.random() < dt * 30) fx.add({ p: root.position.clone().add(rand3(1)), v: new THREE.Vector3(rand(0.5), 1.5, rand(0.5)), life: 1, size: 0.5, g: -0.5, ramp: Math.random() < 0.5 ? RAMPS.flame : RAMPS.smoke });
      // three of them, a quarter second apart: each pops up out of the dome, then falls
      if (st.falling.length < 3 && T > 0.3 + st.falling.length * 0.25) {
        const a = buildGray(u.grayMats);
        a.scale.setScalar(1.8);
        a.position.copy(root.position).add(new THREE.Vector3(rand(0.4), 1.2, rand(0.4)));
        group.add(a);
        const out = Math.random() * Math.PI * 2;
        st.falling.push({ a, v: new THREE.Vector3(Math.cos(out) * 1.6, 6 + Math.random() * 1.5, Math.sin(out) * 1.6), spin: rand(8), down: false });
      }
      for (const f of st.falling) {
        if (f.down) continue;
        f.v.y -= 9 * dt;
        f.a.position.addScaledVector(f.v, dt);
        f.a.rotation.x += f.spin * dt;
        f.a.rotation.z += f.spin * 0.7 * dt;
        if (Math.random() < dt * 25) fx.add({ p: f.a.position.clone().add(rand3(0.25)), v: new THREE.Vector3(rand(0.3), 0.8, rand(0.3)), life: 0.45, size: 0.3, g: -0.5, ramp: RAMPS.flame });
        const floor = floorAt(map, f.a.position.x, f.a.position.z);
        if (f.a.position.y <= floor) {
          f.down = true;
          group.remove(f.a);
          ctx.explode(f.a.position.clone().setY(floor + 0.2), 14, 2, RAMPS.ember, 0.25);
        }
      }
      if (T > 1 && !st.landed) {
        st.fallV -= 10 * dt;
        root.position.y += st.fallV * dt;
        const floor = floorAt(map, root.position.x, root.position.z);
        if (root.position.y <= floor + 0.3) {
          root.position.y = floor + 0.3;
          st.landed = T;
          ctx.shake(6, 0.5);
          ctx.explode(root.position.clone(), 140, 5, RAMPS.boom, 0.45);
          ctx.dustRing(root.position, 36, 3.5);
        }
      }
      return !!st.landed && st.falling.length >= 3 && st.falling.every((f) => f.down);
    },
  };
}
const tmpV = new THREE.Vector3();

// the giant robot: lands on rocket feet and stomps around Wall Street shouting GIVE ME ALL YOUR JOBS! and lasers the office towers
// with its eyes, setting their roofs on fire. Shot down, it sparks, its head pops off and it blows apart.
function createRobot(ctx) {
  const { map, s, fx, center } = ctx;
  const r = buildRobot();
  const root = r.root;
  r.beams.forEach((b) => ctx.group.add(b));
  // it drops out of the sky on rocket feet, a couple of blocks from Wall Street
  const start = center.clone().add(new THREE.Vector3(rand(3), 0, rand(3)));
  const floor0 = floorAt(map, start.x, start.z);
  root.position.set(start.x, floor0 + 22, start.z);
  const st = { mode: 'land', modeT: 0, phase: 0, heading: Math.atan2(center.x - start.x, center.z - start.z), goal: center.clone(), next: 3, target: null, said: 0, headV: null };
  root.rotation.y = st.heading;
  const set = (mode) => { st.mode = mode; st.modeT = 0; };
  const eyePos = new THREE.Vector3();
  const tmp = new THREE.Vector3();

  // its speech bubble, over its head like the health bar
  const bubble = document.createElement('div');
  bubble.className = 'monster-say';
  bubble.textContent = 'GIVE ME ALL YOUR JOBS!';
  bubble.hidden = true;
  map.canvas.parentElement.appendChild(bubble);
  const say = (on) => { bubble.hidden = !on; };
  function placeBubble() {
    if (bubble.hidden) return;
    r.crown.getWorldPosition(tmp);
    tmp.y += 1.4;
    const p = map.toScreen(tmp);
    bubble.style.transform = `translate(${Math.round(p.x)}px, ${Math.round(p.y) - 30}px) translate(-50%, -100%)`;
  }

  // a rooftop a few blocks away to laser
  function pickTarget() {
    for (let i = 0; i < 12; i++) {
      const a = st.heading + rand(1.2);
      const d = 3 + Math.random() * 5;
      const x = root.position.x + Math.sin(a) * d;
      const z = root.position.z + Math.cos(a) * d;
      const roof = map.rooftop(Math.floor(x + COLS / 2), Math.floor(z + ROWS / 2));
      if (roof && roof.top > 1) return new THREE.Vector3(roof.x, roof.top, roof.z);
    }
    const a = st.heading;
    const x = root.position.x + Math.sin(a) * 5;
    const z = root.position.z + Math.cos(a) * 5;
    return new THREE.Vector3(x, floorAt(map, x, z), z);
  }

  function aimBeams(target, t) {
    r.beams.forEach((b, i) => {
      r.eyes[i].getWorldPosition(eyePos);
      const end = target.clone().add(new THREE.Vector3(Math.sin(t * 9 + i) * 0.15, 0, Math.cos(t * 7 + i) * 0.15));
      const len = eyePos.distanceTo(end);
      b.position.copy(eyePos).lerp(end, 0.5);
      b.lookAt(end);
      b.scale.set(0.12, 0.12, len);
      b.visible = true;
    });
    r.beamMat.opacity = 0.75 + Math.sin(t * 40) * 0.2;
  }

  return {
    root, chest: r.chest, crown: r.crown, setFlash: r.setFlash,
    dispose() { bubble.remove(); r.dispose(); },
    update(dt, t) {
      st.modeT += dt;
      const T = st.modeT;
      // shouts every few seconds
      if (st.mode !== 'land' && bubble.hidden && t - st.said > 6) { st.said = t; say(true); }
      if (!bubble.hidden && t - st.said > 2.6) say(false);
      placeBubble();
      r.antenna.visible = Math.floor(t * 4) % 2 === 0;
      if (st.mode === 'land') {
        const e = Math.min(1, T / 2.4);
        root.position.y = floor0 + 22 * (1 - ease(e));
        for (const f of r.feet) {
          if (Math.random() > dt * 40) continue;
          f.getWorldPosition(tmp);
          fx.add({ p: tmp.clone(), v: new THREE.Vector3(rand(0.4), -3 - Math.random() * 2, rand(0.4)), life: 0.4, size: 0.35, g: 0, ramp: RAMPS.flame });
        }
        if (e >= 1) {
          ctx.shake(5, 0.4);
          ctx.dustRing(root.position, 36, 3.2);
          set('walk');
          st.said = -10; // shouts as soon as it lands
        }
      } else if (st.mode === 'walk') {
        if (walkTo(root, st, st.goal, 0.8, dt, 1.2) < 1.5) {
          const a = Math.random() * Math.PI * 2;
          const d = 2 + Math.random() * 6;
          st.goal = new THREE.Vector3(center.x + Math.cos(a) * d, 0, center.z + Math.sin(a) * d);
        }
        const foot = stride(st, dt, 1.4);
        if (foot) {
          const p = (foot > 0 ? r.feet[1] : r.feet[0]).getWorldPosition(new THREE.Vector3());
          p.y = floorAt(map, p.x, p.z);
          ctx.dustRing(p, 12, 1.3);
          ctx.shake(2, 0.1);
        }
        // a stiff, mechanical stride
        const sw = Math.round(Math.sin(st.phase) * 4) / 4;
        r.legs[0].rotation.x = sw * 0.4;
        r.legs[1].rotation.x = -sw * 0.4;
        r.arms[0].rotation.x = -sw * 0.35;
        r.arms[1].rotation.x = sw * 0.35;
        r.head.rotation.y = Math.sin(t * 0.9) * 0.3;
        settle(map, root, dt);
        if (T > st.next) { set('laser'); st.target = pickTarget(); }
      } else {
        // turn to the tower, eyes glow, then a steady laser that sets the roof on fire
        const want = Math.atan2(st.target.x - root.position.x, st.target.z - root.position.z);
        st.heading += wrapAngle(want - st.heading) * Math.min(1, dt * 4);
        root.rotation.y = st.heading;
        r.head.rotation.y *= 1 - Math.min(1, dt * 6);
        r.eyeMat.color.set(T < 0.6 && Math.floor(T * 12) % 2 ? '#ffffff' : '#ff2a2a');
        const firing = T > 0.6 && T < 2.8;
        r.beams.forEach((b) => { b.visible = false; });
        if (firing) {
          aimBeams(st.target, t);
          if (Math.random() < dt * 50) {
            fx.add({ p: st.target.clone().add(rand3(0.2)), v: rand3(2.5).setY(1 + Math.random() * 2), life: 0.4, size: 0.2, g: 5, ramp: RAMPS.bullet });
          }
          if (Math.random() < dt * 4 && s.fires.length < 40) s.fires.push({ p: st.target.clone().add(new THREE.Vector3(rand(0.4), 0, rand(0.4))), life: 6 + Math.random() * 4 });
          if (Math.random() < dt * 3) ctx.shake(1, 0.08);
        }
        if (T > 3.2) {
          r.eyeMat.color.set('#ff2a2a');
          set('walk');
          st.next = 3 + Math.random() * 3;
        }
      }
    },
    onDefeat() {
      r.beams.forEach((b) => { b.visible = false; });
      bubble.textContent = 'NO MORE JOBS...';
      say(true);
      placeBubble();
    },
    die(dt, T) {
      placeBubble();
      // sparks and judders, the eyes go dark, then the head pops off and the body blows apart
      r.eyeMat.color.set(Math.floor(T * 10) % 2 ? '#3b3f57' : '#ff2a2a');
      root.rotation.z = rand(0.04);
      if (Math.random() < dt * 30) {
        r.chest.getWorldPosition(tmp);
        fx.add({ p: tmp.clone().add(rand3(1.5)), v: rand3(3).setY(2 + Math.random() * 2), life: 0.5, size: 0.2, g: 6, ramp: RAMPS.bullet });
      }
      if (T > 1 && !st.headV) {
        st.headV = new THREE.Vector3(rand(1), 7, rand(1));
        say(false);
        r.chest.getWorldPosition(tmp);
        ctx.shake(6, 0.5);
        ctx.explode(tmp.clone(), 150, 5, RAMPS.boom, 0.45);
        ctx.explode(tmp.clone(), 60, 4, RAMPS.smoke, 0.4);
        ctx.dustRing(root.position, 36, 3.5);
        r.body.visible = false;
        r.head.getWorldPosition(tmp);
        ctx.group.attach(r.head);
        r.head.visible = true;
      }
      if (st.headV) {
        st.headV.y -= 12 * dt;
        r.head.position.addScaledVector(st.headV, dt);
        r.head.rotation.x += dt * 6;
        const floor = floorAt(map, r.head.position.x, r.head.position.z);
        if (r.head.position.y <= floor) {
          r.head.visible = false;
          ctx.explode(r.head.position.clone().setY(floor + 0.3), 50, 3, RAMPS.boom, 0.35);
          return true;
        }
      }
      return false;
    },
  };
}

// ---------------------------------------------------------------------------
// the gigantic lizard: a stack of voxel boxes with pivots for legs, arms, tail, head and jaw

const VOX = 0.5; // world units per lizard voxel, which makes it about 10 units tall

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
// the other three monsters, built the same way: boxes in voxel units under a scaled `body`

// `over` draws it in the transparent pass after the pins (renderOrder 10-20), like the plane, so it flies over them
function voxelKit(vox, { over = false } = {}) {
  const mats = new Map();
  const mat = (hex) => {
    if (!mats.has(hex)) mats.set(hex, new THREE.MeshLambertMaterial({ color: hex, flatShading: true, transparent: over }));
    return mats.get(hex);
  };
  const box = (parent, w, h, d, x, y, z, hex) => {
    const m = new THREE.Mesh(BOX, mat(hex));
    if (over) m.renderOrder = 30;
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
  body.scale.setScalar(vox);
  let flashing = false;
  const extra = [];
  return {
    root, body, box, node, extra,
    setFlash(on) {
      if (on === flashing) return;
      flashing = on;
      for (const m of mats.values()) m.emissive.set(on ? 0x664444 : 0x000000);
    },
    dispose() { [...mats.values(), ...extra].forEach((m) => m.dispose()); },
  };
}

const APE_VOX = 0.28; // about 5 units tall: big enough to see over Midtown, small beside the tower

function buildApe() {
  const fur = '#3a2a22';
  const dark = '#241914';
  const face = '#8a7468';
  const kit = voxelKit(APE_VOX);
  const { box, node, body } = kit;
  const hips = node(body, 0, 5, 0);
  const legs = [-1, 1].map((side) => {
    const leg = node(hips, side * 2.2, 0, 0);
    box(leg, 3, 4, 3, 0, -2, 0, fur);
    box(leg, 3.2, 1.2, 4, 0, -4.4, 0.6, dark);
    return leg;
  });
  const torso = node(hips, 0, 0, 0);
  box(torso, 8, 6.5, 5.4, 0, 3.4, 0, fur);
  box(torso, 5, 3.6, 0.4, 0, 4.2, 2.8, '#5a4438');
  box(torso, 9.6, 2.6, 5.6, 0, 7.4, -0.2, fur);
  const chest = node(torso, 0, 4.5, 1.5);
  const head = node(torso, 0, 8.6, 1.2);
  box(head, 4.2, 4, 4, 0, 1.6, 0.4, fur);
  box(head, 4.6, 1, 1.4, 0, 2.8, 2.2, dark);
  box(head, 3.4, 2.6, 1.2, 0, 1.2, 2.6, face);
  for (const sx of [-0.8, 0.8]) box(head, 0.6, 0.5, 0.3, sx, 2.1, 3.25, '#ffffff');
  const jaw = node(head, 0, 0.2, 2);
  box(jaw, 3, 1, 1.6, 0, -0.4, 0.6, face);
  box(jaw, 2.4, 0.2, 0.3, 0, 0.05, 1.35, C.mouth);
  for (const sx of [-0.7, 0.7]) box(jaw, 0.4, 0.4, 0.3, sx, 0.25, 1.35, C.tooth);
  const crown = node(head, 0, 4.2, 0.4);
  const elbows = [];
  const hands = [];
  const arms = [-1, 1].map((side) => {
    const arm = node(torso, side * 5.4, 7.6, 0);
    box(arm, 2.6, 5, 2.6, 0, -2.3, 0, fur);
    const elbow = node(arm, 0, -4.8, 0);
    box(elbow, 2.4, 4.6, 2.4, 0, -2.2, 0, fur);
    box(elbow, 2.8, 1.8, 2.8, 0, -5.2, 0.2, dark);
    elbows.push(elbow);
    hands.push(node(elbow, 0, -5.6, 1.2));
    return arm;
  });
  // the woman, in world units, in its right fist
  const woman = buildWoman();
  kit.extra.push(...woman.mats);
  woman.root.scale.setScalar(1.6 / APE_VOX);
  woman.root.position.set(0, 0.2, 0.4);
  hands[1].add(woman.root);
  return { ...kit, hips, torso, chest, head, jaw, crown, legs, arms, elbows, woman };
}

// blond hair and a white dress, half a unit tall before scaling; she spins around her middle
function buildWoman() {
  const mats = [];
  const root = new THREE.Group();
  const inner = new THREE.Group();
  inner.position.y = -0.3;
  root.add(inner);
  const box = (parent, w, h, d, x, y, z, hex) => {
    // drawn after the pins like the plane, so she shows when she flies over them
    const m = new THREE.MeshLambertMaterial({ color: hex, flatShading: true, transparent: true });
    mats.push(m);
    const mesh = new THREE.Mesh(BOX, m);
    mesh.renderOrder = 30;
    mesh.scale.set(w, h, d);
    mesh.position.set(x, y, z);
    parent.add(mesh);
    return mesh;
  };
  const skin = '#f2c9a0';
  const legs = [-1, 1].map((side) => {
    const leg = new THREE.Group();
    leg.position.set(side * 0.045, 0.22, 0);
    inner.add(leg);
    box(leg, 0.06, 0.22, 0.06, 0, -0.11, 0, skin);
    return leg;
  });
  box(inner, 0.2, 0.26, 0.13, 0, 0.33, 0, '#ffffff');
  const arms = [-1, 1].map((side) => {
    const arm = new THREE.Group();
    arm.position.set(side * 0.12, 0.43, 0);
    inner.add(arm);
    box(arm, 0.05, 0.18, 0.05, 0, -0.09, 0, skin);
    return arm;
  });
  box(inner, 0.13, 0.13, 0.13, 0, 0.52, 0, skin);
  box(inner, 0.16, 0.07, 0.16, 0, 0.6, 0, '#ffe066');
  box(inner, 0.16, 0.17, 0.05, 0, 0.5, -0.07, '#ffe066');
  return { root, legs, arms, mats };
}

const ALIEN_VOX = 0.32; // about 5 units tall: half the lizard

function buildAlien() {
  const skin = '#b9ad9c';
  const dark = '#6f6559';
  const pink = '#c2405a';
  const kit = voxelKit(ALIEN_VOX);
  const { box, node, body } = kit;
  const hips = node(body, 0, 10, -3);
  const legs = [-1, 1].map((side) => {
    const leg = node(hips, side * 2, 0, 0);
    box(leg, 2, 5, 2.4, 0, -2.2, -0.6, skin);
    const knee = node(leg, 0, -4.6, -1);
    box(knee, 1.3, 5.6, 1.3, 0, -2.6, 0.6, skin);
    box(knee, 1.8, 0.8, 2.4, 0, -5.4, 1.2, dark);
    return leg;
  });
  const tail = [];
  let parent = node(hips, 0, 0.4, -1);
  [[2, 1.8, 2.6], [1.6, 1.4, 2.4], [1.2, 1, 2.2], [0.8, 0.7, 2], [0.5, 0.5, 1.8]].forEach(([w, h, d], i, all) => {
    const seg = node(parent, 0, 0, i ? -all[i - 1][2] + 0.2 : 0);
    seg.rotation.x = i ? -0.12 : 0.25;
    box(seg, w, h, d, 0, 0, -d / 2, skin);
    tail.push(seg);
    parent = seg;
  });
  const torso = node(hips, 0, 0, 0);
  torso.rotation.x = -0.25;
  box(torso, 4.6, 4.2, 8, 0, 1, 3.5, skin);
  box(torso, 3, 0.6, 6.4, 0, -1.2, 3.5, '#d9cdb8');
  for (let i = 0; i < 6; i++) box(torso, 0.5, 1.2 - i * 0.08, 0.8, 0, 3.4, i * 1.6 + 0.2, dark);
  box(torso, 5.6, 4.2, 3, 0, 1.8, 7.4, skin);
  for (const sx of [-3, 3]) box(torso, 0.8, 1.4, 1.6, sx, 0.6, 8, pink); // the sacs on its neck
  const chest = node(torso, 0, 1, 6);
  const arms = [-1, 1].map((side) => {
    const arm = node(torso, side * 3.2, 1.5, 8);
    box(arm, 1.4, 7, 1.4, 0, -3.3, 0, skin);
    const elbow = node(arm, 0, -6.8, 0);
    box(elbow, 1.1, 6.4, 1.1, 0, -3, 0, skin);
    box(elbow, 1.8, 0.6, 1.8, 0, -6.4, 0.4, dark);
    return arm;
  });
  const head = node(torso, 0, 2.4, 9.2);
  box(head, 2.6, 2, 3.6, 0, 0.4, 1.8, skin);
  for (const sx of [-1, 1]) box(head, 0.4, 0.4, 0.3, sx, 0.9, 3.6, '#1d2340');
  const jaw = node(head, 0, -0.4, 0.6);
  box(jaw, 2.4, 0.8, 3.2, 0, -0.4, 1.4, skin);
  box(jaw, 2, 0.2, 2.8, 0, 0.05, 1.4, pink);
  for (const sx of [-0.7, 0, 0.7]) box(jaw, 0.3, 0.4, 0.3, sx, 0.25, 2.8, C.tooth);
  const crown = node(head, 0, 2.6, 1);
  return { ...kit, hips, torso, chest, head, jaw, crown, legs, arms, tail };
}

const FLUFF_VOX = 0.24; // about 6 units tall

function buildFluff() {
  const white = '#fbf8f1';
  const shade = '#e4ddd0';
  const ink = '#1d2340';
  const blue = '#3d7be0';
  const kit = voxelKit(FLUFF_VOX);
  const { box, node, body } = kit;
  const hips = node(body, 0, 7, 0);
  const feet = [];
  const legs = [-1, 1].map((side) => {
    const leg = node(hips, side * 2.4, 0, 0);
    box(leg, 4, 3, 4, 0, -1.5, 0, white);
    box(leg, 4.5, 0.3, 4.5, 0, -3, 0, shade);
    box(leg, 4.4, 2.4, 4.4, 0, -4.3, 0, white);
    box(leg, 4.2, 1.4, 5, 0, -6.3, 0.4, white);
    feet.push(node(leg, 0, -7, 0.4));
    return leg;
  });
  const torso = node(hips, 0, 0, 0);
  for (const [w, h, d, y] of [[8.4, 2, 7, 1], [10, 3, 8.4, 3.5], [9.6, 2.4, 8, 6], [8, 1.6, 6.8, 7.9]]) box(torso, w, h, d, 0, y, 0, white);
  for (const y of [2.1, 5]) box(torso, 10.1, 0.3, 8.5, 0, y, 0, shade);
  box(torso, 7, 1.2, 6.2, 0, 9.2, 0, blue);
  box(torso, 3, 1.4, 0.6, 0, 9.1, 3.3, '#ed1c24');
  box(torso, 0.9, 0.9, 0.8, 0, 9.1, 3.5, '#9e0f15');
  const chest = node(torso, 0, 5, 2);
  const arms = [-1, 1].map((side) => {
    const arm = node(torso, side * 5.6, 8, 0);
    box(arm, 3.2, 3, 3.2, 0, -1.2, 0, white);
    box(arm, 3.4, 2.6, 3.4, 0, -3.8, 0, white);
    box(arm, 3.5, 0.3, 3.5, 0, -2.6, 0, shade);
    box(arm, 2.8, 2.4, 2.8, 0, -6.2, 0.2, white);
    return arm;
  });
  const head = node(torso, 0, 9.8, 0.2);
  box(head, 6, 2, 5.6, 0, 1, 0, white);
  box(head, 6.8, 2.8, 6.2, 0, 3.3, 0, white);
  box(head, 6, 1.8, 5.6, 0, 5.5, 0, white);
  for (const sx of [-1.3, 1.3]) box(head, 0.7, 1, 0.3, sx, 3.9, 3.15, ink);
  box(head, 2.4, 0.35, 0.3, 0, 2.3, 3.15, ink);
  for (const sx of [-1.4, 1.4]) box(head, 0.5, 0.35, 0.3, sx, 2.6, 3.15, ink);
  for (const sx of [-2.4, 2.4]) box(head, 1, 0.6, 0.3, sx, 2.8, 3.12, '#ffb3c1');
  // sailor hat
  box(head, 6.4, 0.6, 6, 0, 6.6, 0, blue);
  box(head, 5.6, 1.6, 5.2, 0, 7.7, 0, white);
  const crown = node(head, 0, 9, 0);
  return { ...kit, hips, torso, chest, head, crown, legs, arms, feet };
}

const UFO_VOX = 0.25; // about 6 units across

function buildUfo() {
  const kit = voxelKit(UFO_VOX, { over: true });
  const { box, node, body } = kit;
  // a pixel disc: strips whose width follows the circle
  const disc = (r, y, h, hex) => {
    for (let k = -r + 0.5; k < r; k += 1) box(body, 2 * Math.sqrt(r * r - k * k), h, 1, 0, y, k, hex);
  };
  disc(9, -1.2, 1, '#8c8fa3');
  disc(12, 0, 1.4, '#c9d2e3');
  disc(10, 1.2, 1, '#e8eef9');
  disc(5, 2.6, 2, PALETTE.glass);
  disc(3.4, 4.1, 1, '#c5d6f2');
  disc(3, -2, 0.6, '#b6ff8a'); // the glow underneath
  // blinking lights round the rim
  const lights = [];
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * Math.PI * 2;
    const m = new THREE.MeshBasicMaterial({ color: SPARKS[i % SPARKS.length], transparent: true });
    kit.extra.push(m);
    const l = new THREE.Mesh(BOX, m);
    l.renderOrder = 30;
    l.scale.set(1.2, 0.8, 1.2);
    l.position.set(Math.cos(a) * 11.6, 0, Math.sin(a) * 11.6);
    body.add(l);
    lights.push(l);
  }
  // the tractor beam: a pale green column, scaled to reach the street
  const beamMat = new THREE.MeshBasicMaterial({ color: '#b6ff8a', transparent: true, opacity: 0.3, depthWrite: false });
  kit.extra.push(beamMat);
  const beam = new THREE.Mesh(BOX, beamMat);
  beam.renderOrder = 25;
  beam.scale.set(1.6, 1, 1.6);
  beam.visible = false;
  kit.root.add(beam);
  const chest = node(kit.root, 0, 0, 0);
  const crown = node(kit.root, 0, 1.6, 0);
  const tinyMats = new Map();
  const grayMats = new Map();
  const dispose = kit.dispose;
  return {
    ...kit, chest, crown, beam, beamMat, tinyMats, grayMats,
    blink(t) { lights.forEach((l, i) => { l.visible = Math.floor(t * 6 + i) % 3 !== 0; }); },
    dispose() {
      dispose();
      [...tinyMats.values(), ...grayMats.values()].forEach((m) => m.dispose());
    },
  };
}

// little figures, in world units, sharing materials through the map they are given
function figureKit(mats) {
  const mat = (hex) => {
    if (!mats.has(hex)) mats.set(hex, new THREE.MeshLambertMaterial({ color: hex, flatShading: true, transparent: true }));
    return mats.get(hex);
  };
  return (parent, w, h, d, x, y, z, hex) => {
    const m = new THREE.Mesh(BOX, mat(hex));
    m.renderOrder = 30; // over the pins, like the plane
    m.scale.set(w, h, d);
    m.position.set(x, y, z);
    parent.add(m);
    return m;
  };
}

// a New Yorker about half a unit tall, in a shirt of the given colour
function buildTiny(shirt, mats) {
  const box = figureKit(mats);
  const g = new THREE.Group();
  box(g, 0.14, 0.2, 0.08, 0, 0.1, 0, '#3b3f57');
  box(g, 0.18, 0.2, 0.1, 0, 0.3, 0, shirt);
  box(g, 0.12, 0.12, 0.12, 0, 0.46, 0, '#f2c9a0');
  return g;
}

// a little gray alien: big head, black eyes
function buildGray(mats) {
  const box = figureKit(mats);
  const g = new THREE.Group();
  box(g, 0.12, 0.28, 0.1, 0, 0, 0, '#9aa0a6');
  box(g, 0.24, 0.2, 0.2, 0, 0.24, 0, '#b4bac0');
  for (const sx of [-0.06, 0.06]) box(g, 0.07, 0.05, 0.03, sx, 0.25, 0.1, '#1d2340');
  return g;
}

const ROBOT_VOX = 0.3; // about 7 units tall

function buildRobot() {
  const steel = '#8c8fa3';
  const light = '#c9d2e3';
  const dark = '#3b3f57';
  const kit = voxelKit(ROBOT_VOX);
  const { box, node, body } = kit;
  const hips = node(body, 0, 9, 0);
  box(hips, 6, 1.6, 3.6, 0, 0, 0, dark);
  const feet = [];
  const legs = [-1, 1].map((side) => {
    const leg = node(hips, side * 2, -0.4, 0);
    box(leg, 2.4, 4, 2.4, 0, -2.2, 0, steel);
    box(leg, 2.8, 1, 2.8, 0, -4.5, 0, dark); // knee
    box(leg, 2.4, 3.4, 2.4, 0, -6.4, 0, steel);
    box(leg, 3, 1.2, 4, 0, -8.2, 0.5, dark);
    feet.push(node(leg, 0, -8.6, 0.5));
    return leg;
  });
  const torso = node(hips, 0, 0.8, 0);
  box(torso, 7.6, 6.4, 4.6, 0, 3.4, 0, light);
  box(torso, 4.4, 3, 0.4, 0, 3.6, 2.4, dark);
  // chest panel lights
  [PALETTE.pinHi, '#6ee07a', '#7fe3ff'].forEach((hex, i) => box(torso, 0.8, 0.8, 0.3, -1.3 + i * 1.3, 4.2, 2.65, hex));
  box(torso, 3, 0.4, 0.3, 0, 2.8, 2.65, PALETTE.pin);
  box(torso, 9.2, 1.8, 3.6, 0, 6.4, 0, steel); // shoulders
  const chest = node(torso, 0, 3.5, 1.5);
  const arms = [-1, 1].map((side) => {
    const arm = node(torso, side * 5, 6.4, 0);
    box(arm, 1.8, 4, 1.8, 0, -2.4, 0, steel);
    box(arm, 2.2, 0.9, 2.2, 0, -4.6, 0, dark);
    box(arm, 1.8, 3, 1.8, 0, -6.4, 0, steel);
    for (const cx of [-0.5, 0.5]) box(arm, 0.6, 1.4, 1.6, cx, -8.4, 0.2, dark); // claw
    return arm;
  });
  box(torso, 1.6, 1, 1.6, 0, 7.6, 0, dark); // neck
  const head = node(torso, 0, 8.1, 0);
  box(head, 4, 3.4, 3.6, 0, 1.7, 0, light);
  box(head, 3.4, 1.2, 0.3, 0, 2.2, 1.85, dark); // visor
  box(head, 2.4, 0.4, 0.3, 0, 0.8, 1.85, steel); // mouth grille
  for (const sx of [-2.2, 2.2]) box(head, 0.4, 1.4, 1.4, sx, 1.8, 0, steel); // ear bolts
  box(head, 0.3, 1.6, 0.3, 0, 4.2, 0, steel);
  // glowing eyes and the antenna light, unlit so they always shine
  const eyeMat = new THREE.MeshBasicMaterial({ color: '#ff2a2a' });
  const antMat = new THREE.MeshBasicMaterial({ color: PALETTE.pin });
  kit.extra.push(eyeMat, antMat);
  const eyes = [-0.9, 0.9].map((sx) => {
    const e = new THREE.Mesh(BOX, eyeMat);
    e.scale.set(0.8, 0.6, 0.3);
    e.position.set(sx, 2.2, 2.05);
    head.add(e);
    return e;
  });
  const antenna = new THREE.Mesh(BOX, antMat);
  antenna.scale.set(0.7, 0.7, 0.7);
  antenna.position.set(0, 5.3, 0);
  head.add(antenna);
  const crown = node(head, 0, 5.5, 0);
  // the eye lasers: thin red bars stretched from each eye to the target, drawn over the pins (the robot puts them
  // in the scene, since they are placed in world space)
  const beamMat = new THREE.MeshBasicMaterial({ color: '#ff2a2a', transparent: true, opacity: 0.85, depthWrite: false });
  kit.extra.push(beamMat);
  const beams = [0, 1].map(() => {
    const b = new THREE.Mesh(BOX, beamMat);
    b.renderOrder = 30;
    b.visible = false;
    return b;
  });
  return { ...kit, hips, torso, chest, head, crown, legs, arms, feet, eyes, eyeMat, antenna, beams, beamMat };
}

// ---------------------------------------------------------------------------
// the plane: a little red-and-white prop plane that faces +z

function buildPlane() {
  const mats = [];
  const root = new THREE.Group();
  const body = new THREE.Group();
  root.add(body);
  const box = (w, h, d, x, y, z, hex) => {
    // drawn in the transparent pass after the pins (renderOrder 10-20), so it flies over them
    const m = new THREE.MeshLambertMaterial({ color: hex, flatShading: true, transparent: true });
    mats.push(m);
    const mesh = new THREE.Mesh(BOX, m);
    mesh.renderOrder = 30;
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
  // the woman the ape lets go of, riding behind the cockpit once she lands in the plane
  const passenger = box(0.24, 0.2, 0.24, 0, 0.4, -0.1, '#ffe066');
  passenger.visible = false;
  const muzzle = new THREE.Object3D();
  muzzle.position.set(0, 0, 1.3);
  body.add(muzzle);
  return { root, body, prop, muzzle, passenger, dispose() { mats.forEach((m) => m.dispose()); } };
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
