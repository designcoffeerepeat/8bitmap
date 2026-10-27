// Subway alerts, in the Subway Alerts section of the + menu. ACTIVE ALERTS / DELAYS shows the alerts in
// effect now and PLANNED WORK the planned service changes for today and tomorrow, both from the MTA's
// live feed through /api/subway-alerts in worker/index.js. Picking one draws the affected lines on the
// map's overlay layer (line paths from src/scripts/map/subway.json, made by tools/build_subway.py),
// fades the city under them and lists the lines with a link to the MTA's alerts page for details.
// The chip beside the + button says which alerts are shown and hides the lines when tapped.

import SUBWAY from './map/subway.json';

const MTA_ALERTS_PAGE = 'https://www.mta.info/alerts';
const MODES = { active: 'ACTIVE ALERTS', planned: 'PLANNED WORK' };
const STALE = 120 * 1000; // ask again after two minutes
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

export function bullet(r) {
  return `<b class="sub-bullet" style="background:${colorOf(r)};color:${textOf(r)}">${esc(BULLET[r] ?? r)}</b>`;
}

export function initSubway(map) {
  const out = document.getElementById('sub-out');
  const chip = document.getElementById('sub-chip');
  const secBtn = document.getElementById('sub-sec-btn');
  const modeBtns = [...document.querySelectorAll('.sub-mode')];
  let data = null;
  let fetchedAt = 0;
  let pending = null;
  let mode = null;

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

  function counts() {
    for (const b of modeBtns) {
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

  async function show(m) {
    mode = m;
    map.removeOverlay();
    map.dimBase(0);
    for (const b of modeBtns) b.classList.toggle('is-on', b.dataset.mode === mode);
    chip.hidden = !mode;
    if (!mode) { out.innerHTML = ''; return; }
    chip.innerHTML = `SUBWAY: ${MODES[mode]} <i aria-hidden="true">X</i>`;
    out.innerHTML = '<p class="sub-note">Loading...</p>';
    await load();
    counts();
    if (mode !== m) return;
    render();
    if (!data) return;
    const routes = byRoute(data[mode]);
    if (!routes.length) return;
    map.dimBase(0.5);
    // a white casing under each line, then the line in its own colour on top
    for (const [r] of routes) {
      for (const path of SUBWAY.routes[r]?.paths ?? []) map.addOverlayLine(path, { color: '#ffffff', width: 1.3, order: 0 });
    }
    for (const [r] of routes) {
      for (const path of SUBWAY.routes[r]?.paths ?? []) map.addOverlayLine(path, { color: colorOf(r), width: 0.8, order: 1 });
    }
  }

  function render() {
    const link = `<a class="sub-link" href="${MTA_ALERTS_PAGE}" target="_blank" rel="noopener">MORE INFO AT MTA.INFO</a>`;
    if (!data) {
      out.innerHTML = `<p class="sub-note">Subway alerts are not available right now.</p>${link}`;
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
}
