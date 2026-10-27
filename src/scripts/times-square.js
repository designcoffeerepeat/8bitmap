// Times Square. The tiles cleared for it in geo.js (Broadway and 7th Ave from 42nd to 48th St, and
// the block east of it) are paved as one plaza. At the north end stands a wide building with a
// billboard on its front; across the plaza, One Times Square with flashing screens and the New
// Year's Eve ball waiting at the top of its mast.
// Zoomed out the billboard flashes 8BIT / .NYC and tapping it flies in. From AD_ZOOM in it shows
// YOUR AD/EVENT HERE, like the ad slot beside the header, and tapping it opens the contact form
// on Ad/Event Inquiry. A booked ad can later replace drawAd*() with its own artwork.

import * as THREE from 'three';
import { COLS, ROWS, LANDMARKS, clearedTiles } from './map/geo.js';
import { initNewYear } from './new-year.js';

const GROUND_H = 0.35;
const PAVING = '#a9a6b8';
const KERB = '#8c8fa3';
// world position of a tile's north-west corner
const tile = (col, row) => ({ x: col - COLS / 2, z: row - ROWS / 2 });
// the ad building fills the north end of the plaza, tiles 179 to 181 of row 135 to 136, facing south
const AD = { x0: tile(179, 0).x + 0.1, x1: tile(182, 0).x - 0.1, z0: tile(0, 135).z + 0.4, z1: tile(0, 137).z - 0.05, h: 4.6 };
const SIGN = { w: 2.6, h: 1.5, y: 2.6 }; // world units; y is the bottom edge above the ground
// One Times Square, across the plaza from the ad building and clear of its view
const TOWER = { ...tile(180, 139), w: 0.8, h: 4.2, mast: 1.6 };
const BALL_R = 3; // the ball's radius in voxels
const BALL_VOX = 0.1;
const AD_ZOOM = 3; // from here in the billboard shows the ad
const BIG_AD = 120; // render px the billboard needs on screen before the full-size ad lettering fits
const FLY_ZOOM = 5.5; // zoom after tapping the billboard while zoomed out
const FLASH = 0.45; // seconds per flash frame
const REDUCED_MOTION = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

const NEON = ['#ff5c8a', '#4dd2ff', '#ffd23f', '#7cf07c'];
const SPARKLE = ['#ffffff', '#e8eef9', '#c5d6f2', '#4dd2ff', '#ff5c8a', '#ffd23f'];
const NIGHT = '#1d2340';
const COIN = '#ffd23f';

// 3 x 5 pixel letters for the small billboard faces
const GLYPHS = {
  8: ['###', '#.#', '###', '#.#', '###'],
  A: ['.#.', '#.#', '###', '#.#', '#.#'],
  B: ['##.', '#.#', '##.', '#.#', '##.'],
  C: ['###', '#..', '#..', '#..', '###'],
  D: ['##.', '#.#', '#.#', '#.#', '##.'],
  E: ['###', '#..', '##.', '#..', '###'],
  H: ['#.#', '#.#', '###', '#.#', '#.#'],
  I: ['###', '.#.', '.#.', '.#.', '###'],
  N: ['#.#', '###', '###', '###', '#.#'],
  O: ['###', '#.#', '#.#', '#.#', '###'],
  R: ['##.', '#.#', '##.', '#.#', '#.#'],
  T: ['###', '.#.', '.#.', '.#.', '.#.'],
  U: ['#.#', '#.#', '#.#', '#.#', '###'],
  V: ['#.#', '#.#', '#.#', '#.#', '.#.'],
  Y: ['#.#', '#.#', '.#.', '.#.', '.#.'],
  '.': ['...', '...', '...', '...', '.#.'],
  '/': ['..#', '..#', '.#.', '#..', '#..'],
  ' ': ['...', '...', '...', '...', '...'],
};

export function initTimesSquare(map) {
  const tsq = LANDMARKS.find((l) => l.id === 'tsq');
  buildPlaza(map, clearedTiles(tsq));

  const box = (x, z, w, h, d, y, hex, glow = false) => {
    const mat = glow ? new THREE.MeshBasicMaterial({ color: hex }) : new THREE.MeshLambertMaterial({ color: hex, flatShading: true });
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
    m.position.set(x, y + h / 2, z);
    map.world.add(m);
    return m;
  };

  // ---- the ad building, with the billboard hung on its south wall ----
  const ax = (AD.x0 + AD.x1) / 2;
  const aw = AD.x1 - AD.x0;
  box(ax, (AD.z0 + AD.z1) / 2, aw, AD.h, AD.z1 - AD.z0, GROUND_H, '#c4b3ef');
  box(ax, (AD.z0 + AD.z1) / 2, aw + 0.1, 0.15, AD.z1 - AD.z0 + 0.1, GROUND_H + AD.h, '#9a8bc9'); // roof cornice
  const front = AD.z1;
  box(ax, front + 0.06, SIGN.w + 0.2, SIGN.h + 0.2, 0.12, GROUND_H + SIGN.y - 0.1, '#ffffff'); // frame
  for (const dx of [-1, 0, 1]) box(ax + dx, front + 0.1, 0.1, 0.1, 0.2, GROUND_H + SIGN.y - 0.2, '#5a5d72'); // brackets
  // rows of lit windows and a strip of shop signs along the ground floor
  for (const y of [0.9, 1.5]) box(ax, front + 0.02, aw - 0.3, 0.12, 0.04, GROUND_H + y, '#fff3a0', true);
  const shops = box(ax, front + 0.02, aw - 0.2, 0.3, 0.04, GROUND_H + 0.3, NEON[1], true);

  const flash = [drawFlash('8BIT', NEON[0], NIGHT), drawFlash('.NYC', NIGHT, NEON[1]), drawFlash('8BIT', NEON[2], NIGHT), drawFlash('.NYC', NIGHT, NEON[3])];
  const adSmall = drawAdSmall();
  const adBig = drawAdBig();
  const face = new THREE.Mesh(new THREE.PlaneGeometry(SIGN.w, SIGN.h), new THREE.MeshBasicMaterial({ map: flash[0] }));
  face.position.set(ax, GROUND_H + SIGN.y + SIGN.h / 2, front + 0.13);
  map.world.add(face);
  const center = face.position.clone();

  // ---- One Times Square: a dark tower wrapped in flashing screens, the ball on its mast ----
  const tx = TOWER.x + 0.5;
  const tz = TOWER.z + 0.5;
  box(tx, tz, TOWER.w, TOWER.h, TOWER.w, GROUND_H, '#3b3f57');
  const bands = [0.8, 1.8, 2.8].map((y) => box(tx, tz, TOWER.w + 0.08, 0.6, TOWER.w + 0.08, GROUND_H + y, NEON[0], true));
  const top = GROUND_H + TOWER.h;
  box(tx, tz, 0.08, TOWER.mast + 0.3, 0.08, top, '#c9c9cf');
  const ball = buildBall();
  ball.mesh.position.set(tx, top + TOWER.mast, tz);
  map.world.add(ball.mesh);
  // the countdown, the drop at midnight and the fireworks (src/scripts/new-year.js)
  initNewYear(map, ball, { x: tx, z: tz, top, high: top + TOWER.mast });

  // ---- tapping the billboard: fly in while zoomed out, the contact form once it shows the ad ----
  const raycaster = new THREE.Raycaster();
  const ndc = new THREE.Vector2();
  const overSign = (ev) => {
    const rect = map.canvas.getBoundingClientRect();
    ndc.set(((ev.clientX - rect.left) / rect.width) * 2 - 1, -((ev.clientY - rect.top) / rect.height) * 2 + 1);
    raycaster.setFromCamera(ndc, map.camera);
    return raycaster.intersectObject(face).length > 0;
  };
  let pinPickedAt = -1; // a pin in front of the billboard wins the tap
  map.on('select', (id) => { if (id) pinPickedAt = performance.now(); });
  let downAt = null;
  map.canvas.addEventListener('pointerdown', (ev) => { downAt = { x: ev.clientX, y: ev.clientY }; });
  map.canvas.addEventListener('pointerup', (ev) => {
    if (!downAt || Math.hypot(ev.clientX - downAt.x, ev.clientY - downAt.y) > 6) return;
    if (performance.now() - pinPickedAt < 50 || !overSign(ev)) return;
    if (map.zoom >= AD_ZOOM) {
      window.dispatchEvent(new CustomEvent('ad:inquiry'));
    } else {
      // aim at the ground point behind the billboard so it lands mid-screen
      const dir = map.camera.getWorldDirection(new THREE.Vector3());
      map.flyTo(center.clone().addScaledVector(dir, center.y / -dir.y), FLY_ZOOM);
    }
  });
  map.canvas.addEventListener('pointermove', (ev) => {
    if (ev.pointerType === 'mouse' && !map.canvas.style.cursor && overSign(ev)) map.canvas.style.cursor = 'pointer';
  });

  // ---- flashing screens, the sparkling ball, and which face the billboard shows ----
  const right = new THREE.Vector3();
  const edge = new THREE.Vector3();
  let t = 0;
  let shown = -1;
  map.onFrame((dt) => {
    t += dt;
    const k = REDUCED_MOTION ? 0 : Math.floor(t / FLASH);
    if (k !== shown) {
      shown = k;
      bands.forEach((b, i) => b.material.color.set(NEON[(k + i) % NEON.length]));
      shops.material.color.set(NEON[(k + 1) % NEON.length]);
      ball.sparkle(k);
    }
    let tex = flash[k % flash.length];
    if (map.zoom >= AD_ZOOM) {
      // the full lettering once the billboard is big enough on screen to hold it
      right.setFromMatrixColumn(map.camera.matrixWorld, 0);
      const a = map.toScreen(center);
      const b = map.toScreen(edge.copy(center).addScaledVector(right, SIGN.w));
      const px = (Math.hypot(b.x - a.x, b.y - a.y) * map.canvas.width) / map.canvas.clientWidth;
      tex = px >= BIG_AD ? adBig : adSmall;
    }
    if (face.material.map !== tex) face.material.map = tex;
  });
}

// grey paving on every cleared tile, raised a little on a kerb so the plaza reads as one square
function buildPlaza(map, tiles) {
  const mesh = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshLambertMaterial({ flatShading: true }), tiles.length * 2);
  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const colour = new THREE.Color();
  tiles.forEach(({ col, row }, k) => {
    const { x, z } = tile(col + 0.5, row + 0.5);
    m.compose(new THREE.Vector3(x, GROUND_H + 0.03, z), q, new THREE.Vector3(1, 0.06, 1));
    mesh.setMatrixAt(k * 2, m);
    mesh.setColorAt(k * 2, colour.set(KERB));
    m.compose(new THREE.Vector3(x, GROUND_H + 0.08, z), q, new THREE.Vector3(0.92, 0.04, 0.92));
    mesh.setMatrixAt(k * 2 + 1, m);
    mesh.setColorAt(k * 2 + 1, colour.set(PAVING));
  });
  map.world.add(mesh);
}

// the New Year's Eve ball: a voxel sphere of crystal panels that twinkle in turn
function buildBall() {
  const cells = [];
  for (let x = -BALL_R; x <= BALL_R; x++) {
    for (let y = -BALL_R; y <= BALL_R; y++) {
      for (let z = -BALL_R; z <= BALL_R; z++) {
        const d = Math.hypot(x, y, z);
        if (d <= BALL_R + 0.3 && d > BALL_R - 1.2) cells.push([x, y, z]);
      }
    }
  }
  const mesh = new THREE.InstancedMesh(new THREE.BoxGeometry(BALL_VOX, BALL_VOX, BALL_VOX), new THREE.MeshBasicMaterial(), cells.length);
  const m = new THREE.Matrix4();
  cells.forEach(([x, y, z], k) => mesh.setMatrixAt(k, m.makeTranslation(x * BALL_VOX, y * BALL_VOX, z * BALL_VOX)));
  const colour = new THREE.Color();
  const sparkle = (k) => {
    cells.forEach((_, i) => mesh.setColorAt(i, colour.set(SPARKLE[(i * 7 + k * 3) % SPARKLE.length])));
    mesh.instanceColor.needsUpdate = true;
  };
  sparkle(0);
  return { mesh, sparkle };
}

function canvas(w, h) {
  const cv = document.createElement('canvas');
  cv.width = w;
  cv.height = h;
  return [cv, cv.getContext('2d')];
}

function glyphs(ctx, text, x, y) {
  [...text].forEach((ch, n) => {
    GLYPHS[ch].forEach((row, gy) => {
      [...row].forEach((px, gx) => px === '#' && ctx.fillRect(x + n * 4 + gx, y + gy, 1, 1));
    });
  });
}

// the white frame and dark border every face shares
function frame(ctx, w, h, bg) {
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, w, h);
  ctx.fillStyle = NIGHT;
  ctx.fillRect(1, 1, w - 2, h - 2);
  ctx.fillStyle = bg;
  ctx.fillRect(2, 2, w - 4, h - 4);
}

// 23 x 13 px: a neon ground and four 3 x 5 letters
function drawFlash(text, bg, fg) {
  const [cv, ctx] = canvas(23, 13);
  frame(ctx, 23, 13, bg);
  ctx.fillStyle = fg;
  glyphs(ctx, text, 4, 4);
  return texture(cv);
}

// 46 x 26 px: the ad in 3 x 5 letters, for a billboard still small on screen
function drawAdSmall() {
  const [cv, ctx] = canvas(46, 26);
  frame(ctx, 46, 26, NIGHT);
  stripes(ctx, 46, 26);
  ctx.fillStyle = '#9aa0c8';
  glyphs(ctx, 'AD', 4, 4);
  ctx.fillStyle = COIN;
  glyphs(ctx, 'YOUR AD/', 7, 11);
  glyphs(ctx, 'EVENT HERE', 3, 18);
  return texture(cv);
}

// 128 x 72 px: the ad in the site's pixel font, like the slot beside the header
function drawAdBig() {
  const [cv, ctx] = canvas(128, 72);
  frame(ctx, 128, 72, NIGHT);
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(3, 3, 122, 66);
  ctx.fillStyle = NIGHT;
  ctx.fillRect(5, 5, 118, 62);
  stripes(ctx, 128, 72);
  ctx.textBaseline = 'top';
  ctx.textAlign = 'center';
  ctx.font = '8px "Press Start 2P", monospace';
  const [tv, tx] = canvas(128, 72);
  tx.font = ctx.font;
  tx.textBaseline = 'top';
  tx.textAlign = 'center';
  tx.fillStyle = COIN;
  tx.fillText('YOUR AD/', 64, 26);
  tx.fillText('EVENT HERE', 64, 40);
  tx.fillStyle = '#9aa0c8';
  tx.textAlign = 'left';
  tx.fillText('AD', 9, 9);
  // snap anti-aliased edges to solid pixels, as for the map labels
  const img = tx.getImageData(0, 0, 128, 72);
  for (let k = 3; k < img.data.length; k += 4) img.data[k] = img.data[k] > 110 ? 255 : 0;
  tx.putImageData(img, 0, 0);
  ctx.drawImage(tv, 0, 0);
  return texture(cv);
}

// faint diagonal stripes, as on the ad slot
function stripes(ctx, w, h) {
  ctx.fillStyle = 'rgba(255,255,255,.06)';
  for (let y = 2; y < h - 2; y++) {
    for (let x = 2; x < w - 2; x++) if ((x + y) % 8 < 4) ctx.fillRect(x, y, 1, 1);
  }
}

function texture(cv) {
  const tex = new THREE.CanvasTexture(cv);
  tex.magFilter = THREE.NearestFilter;
  tex.minFilter = THREE.NearestFilter;
  tex.generateMipmaps = false;
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}
