import { createMap } from './map/renderer.js';
import { loadEventsForDate, SOURCES } from './events/index.js';
import { CATEGORIES, CATEGORY_LABELS } from './events/schema.js';
import { CATEGORY_COLORS } from './map/palette.js';
import NEIGHBORHOODS from './map/neighborhoods.json';
import nycgovSource from './events/sources/nycgov.js';

const LIST_PAGE = 8;

const state = {
  events: [],
  filter: 'all',
  sources: new Set(), // publisher ids switched on in the Sources dropdown
  selected: null,
  showAll: false,
  detailsOpen: false,
};

const $ = (sel) => document.querySelector(sel);
const el = {
  map: $('#map'),
  date: $('#today-date'),
  count: $('#today-count'),
  chips: $('#chips'),
  list: $('#event-list'),
  more: $('#show-more'),
  detail: $('#detail'),
  sheet: $('#panel'),
  sheetToggle: $('#panel-toggle'),
  status: $('#status'),
  srcBtn: $('#src-btn'),
  catBtn: $('#cat-btn'),
  catMenu: $('#cat-menu'),
  catSummary: $('#cat-summary'),
  srcMenu: $('#src-menu'),
  srcList: $('#src-list'),
  srcSummary: $('#src-summary'),
};

await document.fonts.load('8px "Press Start 2P"').catch(() => {});
const map = createMap(el.map, { pixelSize: 2 });

// Official neighborhood names appear once you zoom in past the borough labels.
for (const n of NEIGHBORHOODS) map.addAnchor(n.name, n.lat, n.lng, { className: 'hood', minZoom: 2.4 });
// Staten Island is off the map to the south; this sign sits in the harbour until it is drawn.
map.addAnchor('STATEN ISLAND\nCOMING SOON', 40.6725, -74.0420, { className: 'soon-sign' });

const today = new Date();
const { events, errors } = await loadEventsForDate(today);
state.events = events;
if (errors.length) el.status.textContent = `${errors.length} source(s) could not be loaded.`;

// The header shows the NYC day the listings cover, which can differ from the
// viewer's own date.
const snaps = SOURCES.filter((s) => s.snapshot);
const snap = nycgovSource.snapshot ?? snaps[0]?.snapshot;
const shownDay = snap ? new Date(`${snap.date}T12:00:00`) : today;
el.date.textContent = shownDay
  .toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })
  .toUpperCase();
if (snaps.length) {
  const latest = snaps.map((s) => s.snapshot.fetchedAt).sort().at(-1);
  const at = new Date(latest).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', timeZone: 'America/New_York' });
  const unplaced = snaps.reduce((n, s) => n + s.snapshot.unplaced, 0);
  $('.panel-foot').textContent = `LISTINGS FROM ${snaps.map((s) => s.name).join(', ')}, UPDATED ${at} NYC TIME. ${unplaced ? `${unplaced} WITHOUT A MAPPABLE ADDRESS NOT SHOWN. ` : ''}EVENTS OUTSIDE THE MAP AREA ARE NOT SHOWN.`.toUpperCase();
}
// Every publisher with events today, plus any registered source that returned none.
const publishers = new Map();
for (const e of events) {
  const p = publishers.get(e.publisher.id) ?? { ...e.publisher, count: 0 };
  p.count++;
  publishers.set(p.id, p);
}
for (const s of SOURCES) {
  if (![...publishers.values()].some((p) => p.id === s.id) && !events.some((e) => e.source.id === s.id)) {
    publishers.set(s.id, { id: s.id, name: s.name, url: s.url, count: 0 });
  }
}
state.sources = new Set(publishers.keys());

map.setEvents(events);
renderSources();
renderChips();
render();

map.on('select', (id) => select(id, { fromMap: true }));
map.on('hover', (id) => {
  document.querySelectorAll('.ev.is-hover').forEach((n) => n.classList.remove('is-hover'));
  if (id) document.querySelector(`.ev[data-id="${CSS.escape(id)}"]`)?.classList.add('is-hover');
});

// ---- controls ----------------------------------------------------------
$('#zoom-in').addEventListener('click', () => map.zoomBy(1.5));
$('#zoom-out').addEventListener('click', () => map.zoomBy(1 / 1.5));
$('#rot-l').addEventListener('click', () => map.rotateBy(Math.PI / 4));
$('#rot-r').addEventListener('click', () => map.rotateBy(-Math.PI / 4));
$('#home').addEventListener('click', () => map.home());
$('#pixel').addEventListener('click', (e) => {
  const next = { 2: 3, 3: 4, 4: 2 }[map.pixelSize] ?? 2;
  map.setPixelSize(next);
  e.currentTarget.querySelector('b').textContent = `${next}X`;
});
$('#pixel b').textContent = `${map.pixelSize}X`;
el.more.addEventListener('click', () => {
  state.showAll = !state.showAll;
  render();
});
el.sheetToggle.addEventListener('click', () => {
  const open = el.sheet.classList.toggle('is-open');
  el.sheetToggle.setAttribute('aria-expanded', String(open));
});
document.addEventListener('keydown', (e) => {
  if (e.key !== 'Escape' || document.querySelector('dialog[open]')) return;
  if (!el.srcMenu.hidden) {
    toggleSources(false);
    el.srcBtn.focus();
  } else if (!el.catMenu.hidden) {
    toggleCategories(false);
    el.catBtn.focus();
  } else if (state.selected) select(null);
});
el.srcBtn.addEventListener('click', () => {
  toggleCategories(false);
  toggleSources(el.srcMenu.hidden);
});
el.catBtn.addEventListener('click', () => {
  toggleSources(false);
  toggleCategories(el.catMenu.hidden);
});
document.addEventListener('pointerdown', (e) => {
  if (!el.srcMenu.hidden && !e.target.closest('.src-filter')) toggleSources(false);
  if (!el.catMenu.hidden && !e.target.closest('.cat-filter')) toggleCategories(false);
});
$('#src-all').addEventListener('click', () => setSources([...publishers.keys()]));
$('#src-none').addEventListener('click', () => setSources([]));
el.srcList.addEventListener('change', (e) => {
  const id = e.target.value;
  if (e.target.checked) state.sources.add(id);
  else state.sources.delete(id);
  sourcesChanged();
});

// ---- rendering -------------------------------------------------------------
function sourceEvents() {
  return state.events.filter((e) => state.sources.has(e.publisher.id));
}

function visibleEvents() {
  const list = sourceEvents();
  return state.filter === 'all' ? list : list.filter((e) => e.category === state.filter);
}

function renderSources() {
  el.srcList.innerHTML = [...publishers.values()].sort((a, b) => b.count - a.count || a.name.localeCompare(b.name)).map((p) => `
    <li><label class="src-item">
      <input type="checkbox" value="${esc(p.id)}"${state.sources.has(p.id) ? ' checked' : ''}><i aria-hidden="true"></i>${esc(p.name)}<span>${p.count}</span>
    </label></li>`).join('');
  const on = state.sources.size;
  el.srcSummary.textContent = on === publishers.size ? 'ALL' : `${on}/${publishers.size}`;
}

function toggleCategories(open) {
  el.catMenu.hidden = !open;
  el.catBtn.setAttribute('aria-expanded', String(open));
}

function toggleSources(open) {
  el.srcMenu.hidden = !open;
  el.srcBtn.setAttribute('aria-expanded', String(open));
}

function setSources(ids) {
  state.sources = new Set(ids);
  renderSources();
  sourcesChanged();
}

function sourcesChanged() {
  const on = state.sources.size;
  el.srcSummary.textContent = on === publishers.size ? 'ALL' : `${on}/${publishers.size}`;
  // drop a category filter that no longer has any events
  if (state.filter !== 'all' && !sourceEvents().some((e) => e.category === state.filter)) state.filter = 'all';
  state.showAll = false;
  if (state.selected && !visibleEvents().some((e) => e.id === state.selected)) select(null);
  renderChips();
  render();
}

function renderChips() {
  const counts = Object.fromEntries(CATEGORIES.map((c) => [c, 0]));
  const pool = sourceEvents();
  pool.forEach((e) => counts[e.category]++);
  const chips = [['all', 'All', pool.length, '#ffffff'],
    ...CATEGORIES.filter((c) => counts[c]).map((c) => [c, CATEGORY_LABELS[c], counts[c], CATEGORY_COLORS[c]])];
  const buttons = chips.map(([id, label, n, col]) => `
    <button class="chip" type="button" data-cat="${id}" aria-pressed="${state.filter === id}" style="--cat:${col}">
      <i aria-hidden="true"></i>${label}<span>${n}</span>
    </button>`).join('');
  // Desktop shows the chips in a row; phones show the same buttons in the CATEGORY dropdown.
  el.chips.innerHTML = buttons;
  el.catMenu.innerHTML = buttons;
  const current = chips.find(([id]) => id === state.filter) ?? chips[0];
  el.catSummary.textContent = current[1].toUpperCase();
  el.catBtn.style.setProperty('--cat', current[3]);
  document.querySelectorAll('#chips .chip, #cat-menu .chip').forEach((b) => b.addEventListener('click', () => {
    state.filter = b.dataset.cat;
    state.showAll = false;
    toggleCategories(false);
    if (state.selected && !visibleEvents().some((e) => e.id === state.selected)) select(null);
    renderChips();
    render();
  }));
}

function render() {
  const list = visibleEvents();
  map.setVisible(list.map((e) => e.id));
  el.count.textContent = `${list.length} ${list.length === 1 ? 'EVENT' : 'EVENTS'} TODAY`;

  const shown = state.showAll ? list : list.slice(0, LIST_PAGE);
  const now = Date.now();
  el.list.innerHTML = shown.map((e) => {
    const live = new Date(e.start) <= now && (!e.end || new Date(e.end) > now);
    return `
    <li>
      <button class="ev${e.id === state.selected ? ' is-selected' : ''}" type="button" data-id="${esc(e.id)}" style="--cat:${CATEGORY_COLORS[e.category]}">
        <span class="ev-time">${e.allDay ? 'ALL DAY' : fmtTime(e.start)}${live ? '<em>NOW</em>' : ''}</span>
        <span class="ev-title">${esc(e.title)}</span>
        <span class="ev-meta">${esc([e.venue.name, e.venue.neighborhood].filter(Boolean).join(' · '))}</span>
        <span class="ev-tags"><span class="tag">${CATEGORY_LABELS[e.category]}</span><span class="price">${fmtPrice(e)}</span></span>
      </button>
    </li>`;
  }).join('') || `<li class="empty">${state.sources.size ? 'No events in this category today.' : 'No sources selected. Pick some under SOURCES.'}</li>`;

  el.list.querySelectorAll('.ev').forEach((b) => {
    b.addEventListener('click', () => select(b.dataset.id));
    b.addEventListener('mouseenter', () => map.highlight(b.dataset.id));
    b.addEventListener('mouseleave', () => map.highlight(null));
  });

  const hidden = list.length - shown.length;
  el.more.hidden = list.length <= LIST_PAGE;
  el.more.textContent = state.showAll ? 'SHOW FEWER' : `SHOW ${hidden} MORE`;
  renderDetail();
}

function renderDetail() {
  const e = state.events.find((x) => x.id === state.selected);
  el.detail.hidden = !e;
  if (!e) return;
  const maps = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${e.venue.name}, ${e.venue.address}, New York`)}`;
  el.detail.style.setProperty('--cat', CATEGORY_COLORS[e.category]);
  el.detail.innerHTML = `
    <button class="close" type="button" id="detail-close" aria-label="Close event">X</button>
    <p class="d-cat"><i aria-hidden="true"></i>${CATEGORY_LABELS[e.category]}</p>
    <h2>${esc(e.title)}</h2>
    <dl>
      <div><dt>WHEN</dt><dd>${e.allDay ? 'All day' : `${fmtTime(e.start)}${e.end ? ` to ${fmtTime(e.end)}` : ''}`}</dd></div>
      <div><dt>WHERE</dt><dd>${esc(e.venue.name)}<br><small>${esc([e.venue.address !== e.venue.name ? e.venue.address : '', e.venue.neighborhood].filter(Boolean).join(', '))}</small></dd></div>
      <div><dt>PRICE</dt><dd>${fmtPrice(e)}</dd></div>
    </dl>
    <p class="d-blurb">${esc(e.description)}</p>
    <div class="d-more" ${state.detailsOpen ? '' : 'hidden'}>
      <p>${esc(e.details)}</p>
      ${e.tags.length ? `<p class="d-tags">${e.tags.map((t) => `<span>#${esc(t)}</span>`).join(' ')}</p>` : ''}
      <p class="d-src">Listed by ${esc(e.source.name)}</p>
    </div>
    <div class="d-actions">
      <button type="button" class="btn" id="detail-more" aria-expanded="${state.detailsOpen}">${state.detailsOpen ? 'SHOW LESS' : 'SHOW MORE'}</button>
      ${e.url ? `<a class="btn" href="${esc(e.url)}" target="_blank" rel="noopener">LISTING</a>` : ''}
      <a class="btn" href="${maps}" target="_blank" rel="noopener">DIRECTIONS</a>
    </div>`;
  $('#detail-close').addEventListener('click', () => select(null));
  $('#detail-more').addEventListener('click', () => {
    state.detailsOpen = !state.detailsOpen;
    renderDetail();
  });
}

function select(id, { fromMap = false } = {}) {
  state.selected = id;
  state.detailsOpen = false;
  map.select(id);
  if (id) {
    map.focusEvent(id);
    // make sure the card is in the list and visible
    const idx = visibleEvents().findIndex((e) => e.id === id);
    if (idx >= LIST_PAGE && !state.showAll) state.showAll = true;
  }
  render();
  if (id && fromMap) {
    document.querySelector(`.ev[data-id="${CSS.escape(id)}"]`)?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }
}

// ---- formatting --------------------------------------------------------------
function fmtTime(iso) {
  return new Date(iso).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', timeZone: 'America/New_York' }).replace(' ', '');
}
function fmtPrice(e) {
  if (e.priceUnknown) return 'SEE LISTING';
  const p = e.price;
  if (!p || (p.min === 0 && p.max === 0)) return 'FREE';
  return p.min === p.max ? `$${p.min}` : `$${p.min}-${p.max}`;
}
function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
