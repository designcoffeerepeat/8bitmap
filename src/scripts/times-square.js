// Times Square: a dark tower with flashing screen bands and one big billboard on its roof.
// Zoomed out the billboard is a small flashing 8BIT / .NYC graphic; tapping it flies in.
// From AD_ZOOM in, an ad box like the one beside the header sits on the billboard and opens
// the contact form on Ad/Event Inquiry. A booked ad can later swap that box's text or image.

import * as THREE from 'three';
import { latLngToWorld } from './map/geo.js';

const TSQ = latLngToWorld(40.7580, -73.9855); // Broadway and 7th Ave at 45th St (the landmark tile in geo.js)
const GROUND_H = 0.35;
const GRID = -0.5; // Manhattan's street grid, as for Madison Square Garden
const TOWER = { w: 0.8, h: 6.4 }; // One Times Square
const SIGN = { w: 3, h: 1.7, lift: 0.3 }; // world units; lift is the gap above the roof
const AD_ZOOM = 3.4; // from here in the billboard shows the ad box
const FLY_ZOOM = 4.8; // zoom after tapping the billboard while zoomed out
const FLASH = 0.45; // seconds per flash frame
const AD_W = 120; // CSS px design size of the ad box; it is scaled to the billboard
const REDUCED_MOTION = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

const NEON = ['#ff5c8a', '#4dd2ff', '#ffd23f', '#7cf07c'];

// 3 x 5 pixel letters for the flashing graphic
const GLYPHS = {
  8: ['###', '#.#', '###', '#.#', '###'],
  B: ['##.', '#.#', '##.', '#.#', '##.'],
  I: ['###', '.#.', '.#.', '.#.', '###'],
  T: ['###', '.#.', '.#.', '.#.', '.#.'],
  N: ['#.#', '###', '###', '###', '#.#'],
  Y: ['#.#', '#.#', '.#.', '.#.', '.#.'],
  C: ['###', '#..', '#..', '#..', '###'],
  '.': ['...', '...', '...', '...', '.#.'],
};

export function initTimesSquare(map) {
  const top = GROUND_H + TOWER.h;
  const signY = top + SIGN.lift + SIGN.h / 2;
  const center = new THREE.Vector3(TSQ.x, signY, TSQ.z);

  // ---- tower, screen bands and billboard legs ----
  const root = new THREE.Group();
  root.position.set(TSQ.x, 0, TSQ.z);
  root.rotation.y = GRID;
  map.world.add(root);
  const box = (w, h, d, y, hex) => {
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), new THREE.MeshLambertMaterial({ color: hex, flatShading: true }));
    m.position.y = y + h / 2;
    root.add(m);
    return m;
  };
  box(1.2, 0.2, 1.2, GROUND_H - 0.05, '#4a4d63'); // the plaza
  box(TOWER.w, TOWER.h, TOWER.w, GROUND_H, '#3b3f57');
  const bands = [1.2, 2.4, 3.6, 4.8].map((y) => {
    const band = box(TOWER.w + 0.08, 0.55, TOWER.w + 0.08, GROUND_H + y, NEON[0]);
    band.material = new THREE.MeshBasicMaterial({ color: NEON[0] }); // screens glow, so no shading
    return band;
  });
  for (const dx of [-0.5, 0.5]) box(0.08, SIGN.lift + 0.3, 0.08, top, '#8c8fa3').position.x = dx;

  // ---- the billboard face, a sprite so it always faces the camera ----
  const frames = [drawFlash('8BIT', NEON[0], '#1d2340'), drawFlash('.NYC', '#1d2340', NEON[1]), drawFlash('8BIT', NEON[2], '#1d2340'), drawFlash('.NYC', '#1d2340', NEON[3])];
  const blank = drawBlank();
  const sign = new THREE.Sprite(new THREE.SpriteMaterial({ map: frames[0] }));
  sign.scale.set(SIGN.w, SIGN.h, 1);
  sign.position.copy(center);
  map.world.add(sign);

  // ---- the HTML layer over the billboard: a hit area zoomed out, the ad box zoomed in ----
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'tsq-ad';
  btn.innerHTML = '<span class="ad box is-empty"><small>AD</small><strong>YOUR AD/<br>EVENT HERE</strong></span>';
  map.canvas.parentElement.querySelector('.map-anchors').appendChild(btn);
  let adMode = null;
  btn.addEventListener('click', () => {
    if (adMode) window.dispatchEvent(new CustomEvent('ad:inquiry'));
    else {
      // aim at the ground point behind the billboard so it lands mid-screen
      const dir = map.camera.getWorldDirection(new THREE.Vector3());
      map.flyTo(center.clone().addScaledVector(dir, center.y / -dir.y), FLY_ZOOM);
    }
  });
  // scrolling over the billboard still zooms the map
  btn.addEventListener('wheel', (e) => {
    e.preventDefault();
    map.canvas.dispatchEvent(new WheelEvent('wheel', e));
  }, { passive: false });

  const right = new THREE.Vector3();
  const edge = new THREE.Vector3();
  let t = 0;
  let shown = -1;
  map.onFrame((dt) => {
    t += dt;
    const ad = map.zoom >= AD_ZOOM;
    if (ad !== adMode) {
      adMode = ad;
      btn.classList.toggle('is-ad', ad);
      btn.setAttribute('aria-label', ad ? 'Advertise your ad or event on the Times Square billboard: contact us' : 'Times Square billboard: zoom in');
      shown = -1;
    }
    const k = REDUCED_MOTION ? 0 : Math.floor(t / FLASH);
    if (k !== shown) {
      shown = k;
      sign.material.map = ad ? blank : frames[k % frames.length];
      bands.forEach((b, i) => b.material.color.set(NEON[(k + i) % NEON.length]));
    }

    // size the button to the billboard on screen
    right.setFromMatrixColumn(map.camera.matrixWorld, 0);
    const c = map.toScreen(center);
    const e = map.toScreen(edge.copy(center).addScaledVector(right, SIGN.w / 2));
    const w = Math.hypot(e.x - c.x, e.y - c.y) * 2;
    const vw = map.canvas.clientWidth;
    const vh = map.canvas.clientHeight;
    const show = !c.behind && c.x > -w && c.x < vw + w && c.y > -w && c.y < vh + w;
    if (btn.hidden === show) btn.hidden = !show;
    if (!show) return;
    btn.style.width = `${AD_W}px`;
    btn.style.height = `${(AD_W * SIGN.h) / SIGN.w}px`;
    btn.style.transform = `translate(${c.x}px, ${c.y}px) translate(-50%, -50%) scale(${w / AD_W})`;
  });
}

// 23 x 13 px: a light frame, a neon ground and four 3 x 5 letters
function drawFlash(text, bg, fg) {
  const cv = document.createElement('canvas');
  cv.width = 23;
  cv.height = 13;
  const ctx = cv.getContext('2d');
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, cv.width, cv.height);
  ctx.fillStyle = '#1d2340';
  ctx.fillRect(1, 1, cv.width - 2, cv.height - 2);
  ctx.fillStyle = bg;
  ctx.fillRect(2, 2, cv.width - 4, cv.height - 4);
  ctx.fillStyle = fg;
  [...text].forEach((ch, n) => {
    GLYPHS[ch].forEach((row, y) => {
      [...row].forEach((px, x) => px === '#' && ctx.fillRect(4 + n * 4 + x, 4 + y, 1, 1));
    });
  });
  return texture(cv);
}

// the dark screen behind the ad box
function drawBlank() {
  const cv = document.createElement('canvas');
  cv.width = 4;
  cv.height = 4;
  const ctx = cv.getContext('2d');
  ctx.fillStyle = '#1d2340';
  ctx.fillRect(0, 0, 4, 4);
  return texture(cv);
}

function texture(cv) {
  const tex = new THREE.CanvasTexture(cv);
  tex.magFilter = THREE.NearestFilter;
  tex.minFilter = THREE.NearestFilter;
  tex.generateMipmaps = false;
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}
