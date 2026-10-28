// New Year's Eve in Times Square, on New York time wherever the visitor is. From 11:50 pm on December 31
// a countdown floats over the ball on One Times Square (and a chip at the bottom of the screen offers to
// fly there); the ball comes down its mast over the last minute and lands at midnight, and fireworks burst
// over the square for the next ten minutes. For the rest of January 1st, tapping the ball drops it again
// with a shorter show. Try it any day with ?nye=SECONDS, which sets the clock that many seconds before
// midnight (?nye=90, or ?nye=-700 for the afternoon of New Year's Day).

import * as THREE from 'three';

const COUNTDOWN = 10 * 60; // seconds before midnight the countdown starts
const DROP = 60; // seconds the ball takes to come down at midnight
const SHOW = 10 * 60; // seconds of fireworks after midnight
const TAP_DROP = 6; // seconds for a drop on tap during New Year's Day
const TAP_SHOW = 25; // seconds of fireworks after a tap drop
const WATCH_ZOOM = 5;
const COLORS = ['#ff5c8a', '#4dd2ff', '#ffd23f', '#7cf07c', '#ffffff', '#ff9f1c', '#c58cff'];
const PARTICLES = 3000;
const GRAVITY = 0.9;
const REDUCED_MOTION = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

// New York's wall clock: { month, day, secs (since local midnight), year }
const PARTS = new Intl.DateTimeFormat('en-US', {
  timeZone: 'America/New_York', year: 'numeric', month: 'numeric', day: 'numeric', hour: 'numeric', minute: 'numeric', second: 'numeric', hourCycle: 'h23',
});
function nyClock(ms) {
  const p = Object.fromEntries(PARTS.formatToParts(ms).map((x) => [x.type, Number(x.value)]));
  return { year: p.year, month: p.month, day: p.day, secs: p.hour * 3600 + p.minute * 60 + p.second + (ms % 1000) / 1000 };
}

// the test clock: ?nye=90 puts "now" 90 seconds before the coming New Year's midnight in New York
function clockShift() {
  const q = new URLSearchParams(location.search);
  const n = Number(q.get('nye'));
  if (!q.has('nye') || !Number.isFinite(n)) return 0;
  const midnight = Date.UTC(nyClock(Date.now()).year + 1, 0, 1, 5); // New York is UTC-5 in winter
  return midnight - n * 1000 - Date.now();
}

const two = (n) => String(n).padStart(2, '0');

// tower: { x, z, top, high }: the ball's mast stands at x, z, from top (the roof) to high (the ball at rest)
export function initNewYear(map, ball, tower) {
  const shift = clockShift();
  const now = () => Date.now() + shift;

  // ---- the countdown over the ball and the chip at the bottom ----
  const host = map.canvas.parentElement;
  const tag = document.createElement('div');
  tag.className = 'nye-tag';
  tag.hidden = true;
  host.appendChild(tag);
  const hud = document.createElement('button');
  hud.type = 'button';
  hud.className = 'nye-hud box';
  hud.hidden = true;
  document.body.appendChild(hud);
  const tagAt = new THREE.Vector3(tower.x, tower.high + 0.75, tower.z);
  // aim at the ground point behind the ball, so the ball lands mid-screen with room for the fireworks above
  hud.addEventListener('click', () => {
    const ballAt = new THREE.Vector3(tower.x, tower.high, tower.z);
    const dir = map.camera.getWorldDirection(new THREE.Vector3());
    map.flyTo(ballAt.addScaledVector(dir, tower.high / -dir.y), WATCH_ZOOM);
  });

  // ---- fireworks: one pool of square pixels, each burst a ring of sparks that fall and go out ----
  const pos = new Float32Array(PARTICLES * 3).fill(-1000);
  const col = new Float32Array(PARTICLES * 3);
  const vel = new Float32Array(PARTICLES * 3);
  const life = new Float32Array(PARTICLES);
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  const sparks = new THREE.Points(geo, new THREE.PointsMaterial({ size: 3, sizeAttenuation: false, vertexColors: true, depthWrite: false }));
  sparks.frustumCulled = false;
  sparks.renderOrder = 9;
  map.world.add(sparks);
  let next = 0; // the next slot in the pool
  const colour = new THREE.Color();
  const rockets = [];

  function launch() {
    rockets.push({
      x: tower.x + (Math.random() - 0.5) * 4,
      z: tower.z + (Math.random() - 0.5) * 4,
      y: tower.top,
      peak: tower.high + 1 + Math.random() * 2,
      slot: take(1),
    });
  }
  function take(n) {
    const k = next;
    next = (next + n) % PARTICLES;
    return k;
  }
  function burst(x, y, z) {
    const n = 70 + Math.floor(Math.random() * 50);
    const a = colour.set(COLORS[Math.floor(Math.random() * COLORS.length)]).clone();
    const b = Math.random() < 0.4 ? new THREE.Color(COLORS[Math.floor(Math.random() * COLORS.length)]) : a;
    const speed = 0.9 + Math.random() * 0.9;
    for (let i = 0; i < n; i++) {
      const k = (next + i) % PARTICLES;
      // an even spread over a sphere
      const u = Math.random() * 2 - 1;
      const t = Math.random() * Math.PI * 2;
      const r = Math.sqrt(1 - u * u);
      const s = speed * (0.85 + Math.random() * 0.15);
      pos.set([x, y, z], k * 3);
      vel.set([r * Math.cos(t) * s, u * s, r * Math.sin(t) * s], k * 3);
      const c = i % 2 ? a : b;
      col.set([c.r, c.g, c.b], k * 3);
      life[k] = 1.4 + Math.random() * 0.6;
    }
    next = (next + n) % PARTICLES;
  }
  function stepSparks(dt) {
    for (let k = 0; k < PARTICLES; k++) {
      if (life[k] <= 0) continue;
      life[k] -= dt;
      if (life[k] <= 0) { pos[k * 3 + 1] = -1000; continue; }
      vel[k * 3 + 1] -= GRAVITY * dt;
      const drag = 1 - dt * 1.2;
      vel[k * 3] *= drag; vel[k * 3 + 2] *= drag;
      pos[k * 3] += vel[k * 3] * dt;
      pos[k * 3 + 1] += vel[k * 3 + 1] * dt;
      pos[k * 3 + 2] += vel[k * 3 + 2] * dt;
      // the last half second they flicker out
      if (life[k] < 0.5 && Math.random() < 0.3) pos[k * 3 + 1] = -1000;
    }
    for (let i = rockets.length - 1; i >= 0; i--) {
      const r = rockets[i];
      r.y += dt * 4;
      pos.set([r.x, r.y, r.z], r.slot * 3);
      col.set([1, 0.9, 0.6], r.slot * 3);
      life[r.slot] = 0.2;
      if (r.y >= r.peak) {
        pos[r.slot * 3 + 1] = -1000;
        life[r.slot] = 0;
        burst(r.x, r.y, r.z);
        rockets.splice(i, 1);
      }
    }
    geo.attributes.position.needsUpdate = true;
    geo.attributes.color.needsUpdate = true;
  }

  // ---- a drop on tap, New Year's Day only ----
  const hit = new THREE.Mesh(new THREE.SphereGeometry(0.5, 8, 6), new THREE.MeshBasicMaterial({ visible: false }));
  hit.position.copy(ball.mesh.position);
  map.world.add(hit);
  const raycaster = new THREE.Raycaster();
  const ndc = new THREE.Vector2();
  const overBall = (ev) => {
    const rect = map.canvas.getBoundingClientRect();
    ndc.set(((ev.clientX - rect.left) / rect.width) * 2 - 1, -((ev.clientY - rect.top) / rect.height) * 2 + 1);
    raycaster.setFromCamera(ndc, map.camera);
    return raycaster.intersectObject(hit).length > 0;
  };
  let tapAt = -Infinity; // when the last tap drop started, in ms on the shifted clock
  let downAt = null;
  map.canvas.addEventListener('pointerdown', (ev) => { downAt = { x: ev.clientX, y: ev.clientY }; });
  map.canvas.addEventListener('pointerup', (ev) => {
    if (!downAt || Math.hypot(ev.clientX - downAt.x, ev.clientY - downAt.y) > 6) return;
    const c = nyClock(now());
    if (!(c.month === 1 && c.day === 1) || c.secs < SHOW) return;
    if (now() - tapAt < (TAP_DROP + TAP_SHOW) * 1000 || !overBall(ev)) return;
    tapAt = now();
  });
  map.canvas.addEventListener('pointermove', (ev) => {
    if (ev.pointerType !== 'mouse' || map.canvas.style.cursor) return;
    const c = nyClock(now());
    if (c.month === 1 && c.day === 1 && overBall(ev)) map.canvas.style.cursor = 'pointer';
  });

  // ---- each frame: where the ball is, what the countdown says, how many rockets go up ----
  const RISE = tower.high - tower.top - 0.3; // how far the ball comes down
  let launchClock = 0;
  map.onFrame((dt) => {
    const ms = now();
    const c = nyClock(ms);
    const eve = c.month === 12 && c.day === 31 && c.secs >= 86400 - COUNTDOWN;
    const day = c.month === 1 && c.day === 1;
    const left = 86400 - c.secs; // seconds to midnight on the eve
    let drop = 0; // 0 at the top of the mast, 1 landed
    let rate = 0; // rockets per second
    let text = '';
    let chip = '';
    if (eve) {
      drop = left <= DROP ? 1 - left / DROP : 0;
      const s = Math.ceil(left);
      text = s <= 10 ? String(s) : `${Math.floor(s / 60)}:${two(s % 60)}`;
      chip = `BALL DROP IN ${Math.floor(s / 60)}:${two(s % 60)}`;
    } else if (day && c.secs < SHOW) {
      drop = 1;
      rate = c.secs < 60 ? 5 : 2.2;
      text = `HAPPY NEW YEAR ${c.year}!`;
      chip = `HAPPY NEW YEAR ${c.year}!`;
    } else if (day) {
      const since = (ms - tapAt) / 1000;
      if (since < TAP_DROP) drop = since / TAP_DROP;
      else if (since < TAP_DROP + TAP_SHOW) { drop = 1; rate = 2.5; text = `HAPPY NEW YEAR ${c.year}!`; }
    }
    ball.mesh.position.y = tower.high - RISE * Math.min(1, drop);
    hit.position.y = ball.mesh.position.y;

    if (rate && !REDUCED_MOTION) {
      launchClock += dt * rate;
      while (launchClock >= 1) { launchClock -= 1; launch(); }
    }
    if (rockets.length || life.some((v) => v > 0)) stepSparks(dt);

    // the floating countdown, over the ball while it is on screen
    if (text) {
      tagAt.y = ball.mesh.position.y + 0.75;
      const p = map.toScreen(tagAt);
      const show = !p.behind && p.x > -100 && p.y > -40 && p.x < host.clientWidth + 100 && p.y < host.clientHeight + 40;
      if (show) {
        tag.style.transform = `translate(${Math.round(p.x)}px, ${Math.round(p.y)}px) translate(-50%, -100%)`;
        if (tag.textContent !== text) tag.textContent = text;
        tag.classList.toggle('is-final', eve && left <= 10);
      }
      tag.hidden = !show;
    } else if (!tag.hidden) tag.hidden = true;
    hud.hidden = !chip;
    if (chip && hud.dataset.text !== chip) {
      hud.dataset.text = chip;
      hud.innerHTML = `${chip}<b>WATCH</b>`;
    }
  });
}
