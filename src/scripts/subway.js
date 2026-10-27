// The Subway section of the + menu. SUBWAY MAP draws every line, thin and in its own colour, with a dot at
// each station; ACTIVE ALERTS / DELAYS and PLANNED WORK draw just the lines hit by the alerts in effect now,
// or the planned service changes for today and tomorrow, and list them with a link to the MTA's alerts page.
// In every mode, a stretch an alert takes out of service ("No [L] trains between 8 Av and Bedford Av") is
// drawn in red with a warning pin; tapping the pin shows the alert. Line paths and stations come from
// src/scripts/map/subway.json (tools/build_subway.py), alerts from /api/subway-alerts in worker/index.js.
// The chip beside the + button says what is shown and hides it when tapped.

import SUBWAY from './map/subway.json';
import { parseSpan, findSpan } from './subway-spans.js';

const MTA_ALERTS_PAGE = 'https://www.mta.info/alerts';
const MODES = { map: 'MAP', active: 'ACTIVE ALERTS', planned: 'PLANNED WORK' };
const STALE = 120 * 1000; // ask again after two minutes
const OUT_RED = '#ff2a2a';
// Express and shuttle route ids show their line's bullet.
const BULLET = { '6X': '6', '7X': '7', FX: 'F', GS: 'S', FS: 'S', H: 'S', SI: 'SIR' };
const ORDER = ['1', '2', '3', '4', '5', '6', '6X', '7', '7X', 'A', 'C', 'E', 'B', 'D', 'F', 'FX', 'M', 'G', 'J', 'Z', 'L', 'N', 'Q', 'R', 'W', 'GS', 'FS', 'H', 'SI'];
// Fallback colours when a route is missing from subway.json.
const COLORS = {
  1: '#EE352E', 2: '#EE352E', 3: '#EE352E', 4: '#00933C', 5: '#00933C', 6: '#00933C', 7: '#B933AD',
  A: '#0039A6', C: '#0039A6', E: '#0039A6', B: '#FF6319', D: '#FF6319', F: '#FF6319', M: '#FF6319',
  G: '#6CBE45', J: '#996633', Z: '#996633', L: '#A7A9AC', N: '#FCCC0A', Q: '#FCCC0A', R: '#FCCC0A', W: '#FCCC0A',
};

const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const rank = (r) => { const k = ORDER.indexOf(r); return k < 0 ? 99 : k; };
const colorOf = (r) => SUBWAY.routes[r]?.color ?? COLORS[BULLET[r] ?? r] ?? '#808183';
const textOf = (r) => SUBWAY.routes[r]?.text ?? (['N', 'Q', 'R', 'W'].includes(r) ? '#000000' : '#FFFFFF');
// a headline's [L] style bullets as coloured dots
const withBullets = (s) => esc(s).replace(/\[(\w{1,3})\]/g, (_, r) => bullet(r));

export function bullet(r) {
  return `<b class="sub-bullet" style="background:${colorOf(r)};color:${textOf(r)}">${esc(BULLET[r] ?? r)}</b>`;
}

export function initSubway(map) {
  const out = document.getElementById('sub-out');
  const chip = document.getElementById('sub-chip');
  const secBtn = document.getElementById('sub-sec-btn');
  const modeBtns = [...document.querySelectorAll('.sub-mode[data-mode]')];
  let data = null;
  let fetchedAt = 0;
  let pending = null;
  let mode = null;
  let pins = []; // warning pins on the map
  // The lines are drawn a set number of render pixels wide, so they are redrawn when the zoom changes:
  // each drawing step is kept and replayed at the new width.
  let ops = [];
  let drawnAt = 0;
  const line = (path, color, px, order) => {
    const op = () => map.addOverlayLine(path, { color, width: px * map.worldPerPixel, order });
    ops.push(op);
    op();
  };
  map.on('view', () => {
    if (!ops.length || Math.abs(map.zoom / drawnAt - 1) < 0.15) return;
    map.removeOverlay();
    drawnAt = map.zoom;
    for (const op of ops) op();
  });

  function load() {
    if (data && Date.now() - fetchedAt < STALE) return Promise.resolve(data);
    pending ??= fetch('/api/subway-alerts')
      .then((r) => (r.ok ? r.json() : null))
      .catch(() => null)
      .then((d) => {
        pending = null;
        if (d) { data = d; fetchedAt = Date.now(); }
        return d ?? data;
      });
    return pending;
  }

  // the routes an alert list touches, each with the headlines that mention it
  function byRoute(list) {
    const routes = new Map();
    for (const a of list) for (const r of a.routes) {
      if (!routes.has(r)) routes.set(r, []);
      if (a.header && !routes.get(r).includes(a.header)) routes.get(r).push(a.header);
    }
    return [...routes.entries()].sort((x, y) => rank(x[0]) - rank(y[0]));
  }

  // stretches out of service: one per route and station pair, with the alerts that say so
  function outages(list) {
    const found = new Map();
    for (const a of list) {
      const span = parseSpan(a.header);
      if (!span) continue;
      for (const r of a.routes) {
        const s = findSpan(SUBWAY, r, span);
        if (!s) continue;
        const key = `${s.from}|${s.to}`;
        const o = found.get(key) ?? { ...s, routes: [], alerts: [] };
        if (!o.routes.includes(r)) o.routes.push(r);
        if (!o.alerts.includes(a)) o.alerts.push(a);
        found.set(key, o);
      }
    }
    return [...found.values()];
  }

  function counts() {
    for (const b of modeBtns) {
      if (b.dataset.mode === 'map') continue;
      const n = data ? byRoute(data[b.dataset.mode]).length : null;
      b.querySelector('span').textContent = n === null ? '' : `${n} LINE${n === 1 ? '' : 'S'}`;
    }
  }

  secBtn.addEventListener('click', () => {
    if (secBtn.getAttribute('aria-expanded') !== 'true') return;
    load().then(() => { counts(); if (mode) render(); });
  });

  for (const b of modeBtns) b.addEventListener('click', () => show(mode === b.dataset.mode ? null : b.dataset.mode));
  chip.addEventListener('click', () => show(null));

  function clear() {
    map.removeOverlay();
    ops = [];
    drawnAt = map.zoom;
    map.dimBase(0);
    for (const p of pins) map.removeAnchor(p);
    pins = [];
  }

  // widths in render pixels
  function drawLines(routes, { width, casing }) {
    if (casing) for (const r of routes) for (const path of SUBWAY.routes[r]?.paths ?? []) line(path, '#ffffff', casing, 0);
    for (const r of routes) for (const path of SUBWAY.routes[r]?.paths ?? []) line(path, colorOf(r), width, 1);
  }

  function drawOutages(list) {
    for (const o of list) {
      line(o.path, '#ffffff', 5, 3);
      line(o.path, OUT_RED, 3, 4);
      ops.push(() => map.addOverlayPoints(o.stations, { color: '#ffffff', size: 3, order: 5 }));
      ops.at(-1)();
      // the warning pin sits on the middle station of the stretch
      const [lat, lng] = o.stations[Math.floor(o.stations.length / 2)];
      const pin = map.addAnchor('', lat, lng, { className: 'sub-warn' });
      pin.innerHTML = `
        <button type="button" class="sub-warn-btn" aria-label="Service alert: ${esc(o.from)} to ${esc(o.to)}">!</button>
        <div class="sub-warn-box box" hidden>
          <p class="sub-warn-head">${o.routes.map(bullet).join('')} NO SERVICE</p>
          <p class="sub-warn-span">${esc(o.from)} to ${esc(o.to)}</p>
          ${o.alerts.map((a) => `<p class="sub-warn-text">${withBullets(a.header)}</p>`).join('')}
          <a class="sub-link" href="${MTA_ALERTS_PAGE}" target="_blank" rel="noopener">MORE INFO AT MTA.INFO</a>
        </div>`;
      const box = pin.querySelector('.sub-warn-box');
      pin.querySelector('.sub-warn-btn').addEventListener('click', (e) => {
        e.stopPropagation();
        const open = box.hidden;
        for (const p of pins) { p.querySelector('.sub-warn-box').hidden = true; p.classList.remove('is-open'); }
        box.hidden = !open;
        pin.classList.toggle('is-open', open);
      });
      // keep map drags and taps from starting under the pin
      pin.addEventListener('pointerdown', (e) => e.stopPropagation());
      pins.push(pin);
    }
  }

  async function show(m) {
    mode = m;
    clear();
    for (const b of modeBtns) b.classList.toggle('is-on', b.dataset.mode === mode);
    chip.hidden = !mode;
    if (!mode) { out.innerHTML = ''; return; }
    chip.innerHTML = `SUBWAY: ${MODES[mode]} <i aria-hidden="true">X</i>`;
    if (mode === 'map') {
      // every line and station right away; the red stretches follow once the alerts are in
      map.dimBase(0.3);
      drawLines(Object.keys(SUBWAY.routes).sort((a, b) => rank(a) - rank(b)), { width: 2 });
      drawStations();
    }
    out.innerHTML = '<p class="sub-note">Loading...</p>';
    await load();
    counts();
    if (mode !== m) return;
    render();
    if (!data) return;
    if (mode === 'map') {
      drawOutages(outages(data.active.filter((a) => a.live)));
      return;
    }
    const routes = byRoute(data[mode]);
    if (!routes.length) return;
    map.dimBase(0.5);
    drawLines(routes.map(([r]) => r), { width: 3, casing: 5 });
    drawOutages(outages(data[mode]));
  }

  function drawStations() {
    const pts = Object.values(SUBWAY.stations ?? {}).map(([, lat, lng]) => [lat, lng]);
    if (!pts.length) return;
    ops.push(() => {
      map.addOverlayPoints(pts, { color: '#1d2340', size: 4, order: 2 });
      map.addOverlayPoints(pts, { color: '#ffffff', size: 2, order: 2.5 });
    });
    ops.at(-1)();
  }

  function render() {
    const link = `<a class="sub-link" href="${MTA_ALERTS_PAGE}" target="_blank" rel="noopener">MORE INFO AT MTA.INFO</a>`;
    if (!data) {
      out.innerHTML = `<p class="sub-note">${mode === 'map' ? 'Every line and station. ' : ''}Subway alerts are not available right now.</p>${link}`;
      return;
    }
    if (mode === 'map') {
      const n = outages(data.active.filter((a) => a.live)).length;
      out.innerHTML = `<p class="sub-note">Every line and station.${n ? ` <b class="sub-out-n">${n} stretch${n === 1 ? '' : 'es'} out of service</b>, in red; tap a ! pin for details.` : ' No lines are out of service right now.'}</p>${link}`;
      return;
    }
    const routes = byRoute(data[mode]);
    if (!routes.length) {
      out.innerHTML = `<p class="sub-note">${mode === 'active' ? 'No active alerts or delays right now.' : 'No planned work today or tomorrow.'}</p>${link}`;
      return;
    }
    out.innerHTML = `<ul class="sub-list">${routes.map(([r, heads]) => `
      <li>${bullet(r)}<span title="${esc(heads.join('\n\n'))}">${esc(heads[0] ?? '')}${heads.length > 1 ? ` <em>+${heads.length - 1} more</em>` : ''}</span></li>`).join('')}
    </ul>${link}`;
  }

  // a tap anywhere else closes an open warning
  document.addEventListener('pointerdown', (e) => {
    if (e.target.closest('.sub-warn')) return;
    for (const p of pins) { p.querySelector('.sub-warn-box').hidden = true; p.classList.remove('is-open'); }
  });
}
