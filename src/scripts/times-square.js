// Times Square: a wide plaza along Broadway with One Times Square at the south end and, on the
// northeast corner, a wide building with a billboard hanging on its front wall.
// Zoomed out the billboard flashes 8BIT / .NYC and tapping it flies in. From AD_ZOOM in it shows
// YOUR AD/EVENT HERE, like the ad slot beside the header, and tapping it opens the contact form
// on Ad/Event Inquiry. A booked ad can later replace drawAd() with its own artwork.

import * as THREE from 'three';
import { latLngToWorld } from './map/geo.js';

const TSQ = latLngToWorld(40.7580, -73.9855); // Broadway and 7th Ave at 45th St (the landmark in geo.js)
const GROUND_H = 0.35;
const GRID = -0.5; // Manhattan's street grid, as for Madison Square Garden
// In the plaza's own frame (turned to the grid): -z is uptown along the avenues, +x is east.
const PLAZA = { w: 3.4, d: 6.6 };
const TOWER = { x: -0.8, z: 2.4, w: 0.8, h: 4.5 }; // One Times Square
const BLDG = { x: 0.5, z: -2.6, w: 4, d: 1.1, h: 5.6 }; // the billboard building, northeast corner
const SIGN = { w: 3.4, h: 1.9, y: 3.2 }; // world units; y is the bottom edge above the ground
const AD_ZOOM = 3; // from here in the billboard shows the ad
const BIG_AD = 120; // render px the billboard needs on screen before the full-size ad lettering fits
const FLY_ZOOM = 5.5; // zoom after tapping the billboard while zoomed out
const FLASH = 0.45; // seconds per flash frame
const REDUCED_MOTION = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

const NEON = ['#ff5c8a', '#4dd2ff', '#ffd23f', '#7cf07c'];
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
  const root = new THREE.Group();
  root.position.set(TSQ.x, 0, TSQ.z);
  root.rotation.y = GRID;
  map.world.add(root);
  const box = (x, z, w, h, d, y, hex, glow = false) => {
    const mat = glow ? new THREE.MeshBasicMaterial({ color: hex }) : new THREE.MeshLambertMaterial({ color: hex, flatShading: true });
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
    m.position.set(x, y + h / 2, z);
    root.add(m);
    return m;
  };

  // ---- the plaza: grey paving, the red TKTS steps and a few benches ----
  box(0, 0, PLAZA.w, 0.08, PLAZA.d, GROUND_H, '#8c8fa3');
  box(0, 0, PLAZA.w - 0.5, 0.02, PLAZA.d - 0.5, GROUND_H + 0.08, '#a9a6b8');
  for (let k = 0; k < 4; k++) box(0.6, -0.6 - k * 0.14, 1, 0.1 + k * 0.1, 0.16, GROUND_H + 0.08, '#d94a3a');
  for (const [x, z] of [[-1.1, -0.4], [-1.1, 0.6], [1.1, 0.9], [1.1, 1.8]]) box(x, z, 0.4, 0.08, 0.16, GROUND_H + 0.1, '#5a5d72');

  // ---- One Times Square: a dark tower wrapped in flashing screens ----
  box(TOWER.x, TOWER.z, TOWER.w, TOWER.h, TOWER.w, GROUND_H, '#3b3f57');
  const bands = [1, 2, 3].map((y) => box(TOWER.x, TOWER.z, TOWER.w + 0.08, 0.6, TOWER.w + 0.08, GROUND_H + y, NEON[0], true));

  // ---- the billboard building and its sign, hung on the wall facing the plaza ----
  box(BLDG.x, BLDG.z, BLDG.w, BLDG.h, BLDG.d, GROUND_H, '#c4b3ef');
  box(BLDG.x, BLDG.z, BLDG.w + 0.1, 0.15, BLDG.d + 0.1, GROUND_H + BLDG.h, '#9a8bc9'); // roof cornice
  const front = BLDG.z + BLDG.d / 2;
  box(BLDG.x, front + 0.06, SIGN.w + 0.2, SIGN.h + 0.2, 0.12, SIGN.y - 0.1, '#ffffff'); // frame
  for (const dx of [-1.2, 0, 1.2]) box(BLDG.x + dx, front + 0.1, 0.1, 0.1, 0.2, SIGN.y - 0.2, '#5a5d72'); // brackets
  // lit strip of shop signs along the ground floor
  box(BLDG.x, front + 0.02, BLDG.w - 0.2, 0.3, 0.04, GROUND_H + 0.6, NEON[1], true);

  const flash = [drawFlash('8BIT', NEON[0], NIGHT), drawFlash('.NYC', NIGHT, NEON[1]), drawFlash('8BIT', NEON[2], NIGHT), drawFlash('.NYC', NIGHT, NEON[3])];
  const adSmall = drawAdSmall();
  const adBig = drawAdBig();
  const face = new THREE.Mesh(new THREE.PlaneGeometry(SIGN.w, SIGN.h), new THREE.MeshBasicMaterial({ map: flash[0] }));
  face.position.set(BLDG.x, SIGN.y + SIGN.h / 2, front + 0.13);
  root.add(face);
  root.updateMatrixWorld(true);
  const center = face.getWorldPosition(new THREE.Vector3());

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

  // ---- flashing, and which face the billboard shows ----
  const right = new THREE.Vector3();
  const edge = new THREE.Vector3();
  let t = 0;
  map.onFrame((dt) => {
    t += dt;
    const k = REDUCED_MOTION ? 0 : Math.floor(t / FLASH);
    bands.forEach((b, i) => b.material.color.set(NEON[(k + i) % NEON.length]));
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
