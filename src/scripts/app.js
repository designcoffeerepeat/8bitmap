import { createMap } from './map/renderer.js';
import { loadEventsForDate, SOURCES } from './events/index.js';
import { CATEGORIES, MAIN_CATEGORIES, CATEGORY_LABELS } from './events/schema.js';
import { CATEGORY_COLORS } from './map/palette.js';
import NEIGHBORHOODS from './map/neighborhoods.json';
import { PLACES, MORE_LABELS, PARK_LABELS, ROAD_LABELS } from './map/places.js';
import nycgovSource from './events/sources/nycgov.js';
import { initMonster } from './monster.js';
import { initSunbather } from './sunbather.js';
import { initFlyingVan } from './flying-van.js';
import { initRooftopGrill } from './rooftop-grill.js';
import { initTimesSquare } from './times-square.js';
import { initSubway } from './subway.js';

// SeatGeek's wordmark (from seatgeek.com/press, via Simple Icons), shown with every
// event that uses SeatGeek data and linked to seatgeek.com in the event card.
const SEATGEEK_LOGO = '<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M11.866 11.277h-.177l-.703-.001v-.001c-1.337-.002-3.426-.009-3.845-.011v-7.37c2.111.089 4.044.121 4.044.121l.304 1.556c.001 0-.745.007-2.361-.03v1.394l1.486.022v1.31L9.128 8.25v1.452c.832.008 1.595.013 2.411.014l1.99-5.615c.3-.008 1.573-.041 1.886-.054l2.637 7.225c-.661.003-1.331-.009-1.993-.006l-.448-1.302c-.76.008-1.52.013-2.281.016l-.445 1.293c-.355 0-.685 0-1.019.004Zm2.607-4.625-.693 2.015c.461-.004.921-.009 1.38-.016l-.687-1.999Zm4.389-1.197c-.719.044-1.438.081-2.157.112l.307-1.594c1.904-.105 3.8-.271 5.694-.497l.306 1.645c-.719.071-1.439.134-2.16.192l-.01 5.953c-.66.006-1.32-.001-1.98.004V5.455ZM6.533 9.069c0 1.246-.901 2.401-2.674 2.401-1.61 0-2.42-.752-2.42-.752V8.699c1.101 1.043 3.266 1.745 3.266.482 0-.96-3.266-1.125-3.266-3.518 0-1.342 1.247-2.186 2.675-2.186 1.009 0 1.855.193 2.065.258l-.083 1.772c-.884-.521-2.801-.763-2.801.134 0 .992 3.239 1.002 3.238 3.428Zm14.861 11.155-1.957-3.596v3.433c-.673-.053-1.982-.133-1.982-.133V12.5l1.982.004c-.007 1.059.008 2.118 0 3.176l2.028-3.18h2.233l-2.314 3.569L24 20.525a90.598 90.598 0 0 0-2.606-.301ZM9.132 18.231c.892-.019 1.785-.029 2.678-.029l-.307 1.561c-.869.003-3.428.062-4.358.122v-7.374h4.038l.307 1.536s-.973-.007-2.358-.008v1.399l1.481-.013v1.323l-1.481.018v1.465Zm5.162-.001c.707.015 1.905.054 2.682.082l-.32 1.573a87.388 87.388 0 0 0-4.349-.121v-7.253l4.051.002.306 1.551-2.371-.015v1.389c.461.005.92.009 1.379.017v1.321c-.459-.011-.919-.018-1.379-.025l.001 1.479ZM3.617 15.549l2.604-.059v4.445s-.7.032-2.26.178C1.746 20.321 0 19.022 0 16.468c0-3.034 2.222-3.993 4.225-3.993.868 0 1.379.016 1.667.031l.328 1.723s-.58-.122-1.673-.122c-1.24 0-2.585.415-2.585 2.078 0 1.791.745 2.392 2.556 2.228l-.001-1.536-1.206.059.306-1.387Z"/></svg>';

const state = {
  events: [],
  catsOff: new Set(), // categories unticked in the Categories dropdown (new ones start ticked)
  sources: new Set(), // publisher ids switched on in the Sources dropdown
  selected: null,
  detailsOpen: false,
  tomorrow: false, // the header date switches between today's and tomorrow's listings
  inView: null, // ids of events on screen once the map leaves its home view; null lists every event
};

const $ = (sel) => document.querySelector(sel);
const el = {
  map: $('#map'),
  date: $('#today-date'),
  count: $('#today-count'),
  list: $('#event-list'),
  detail: $('#detail'),
  sheet: $('#panel'),
  sheetToggle: $('#panel-toggle'),
  status: $('#status'),
  srcBtn: $('#src-btn'),
  catBtn: $('#cat-btn'),
  catMenu: $('#cat-menu'),
  catSummary: $('#cat-summary'),
  catList: $('#cat-list'),
  srcMenu: $('#src-menu'),
  srcList: $('#src-list'),
  srcSummary: $('#src-summary'),
  listTitle: $('#list-title'),
  listHint: $('#list-hint'),
  listReset: $('#list-reset'),
  hoodBtn: $('#hood-btn'),
  hoodMenu: $('#hood-menu'),
  hoodSearch: $('#hood-search'),
  hoodList: $('#hood-list'),
  hoodSecBtn: $('#hood-sec-btn'),
  subSecBtn: $('#sub-sec-btn'),
};

// The + dropdown: each borough (or New Jersey) first, then its neighborhoods A to Z. A borough zooms out enough to
// show all of it; a neighborhood zooms in past where the neighborhood names appear (2.4).
const BOROUGH_VIEWS = {
  Manhattan: { lat: 40.7685, lng: -73.9772, zoom: 1.6 },
  Brooklyn: { lat: 40.6500, lng: -73.9500, zoom: 1.6 },
  Queens: { lat: 40.7050, lng: -73.8200, zoom: 1.4 },
  Bronx: { lat: 40.8450, lng: -73.8700, zoom: 1.8 },
  'Staten Island': { lat: 40.5800, lng: -74.1450, zoom: 1.8 },
  'New Jersey': { lat: 40.7300, lng: -74.0450, zoom: 2.4 },
};
const HOOD_ZOOM = 2.7;
const HOOD_GROUPS = Object.entries(BOROUGH_VIEWS).map(([borough, view]) => ({
  borough,
  view,
  hoods: [...NEIGHBORHOODS, { name: 'Hoboken', borough: 'New Jersey', lat: 40.7440, lng: -74.0324 }, { name: 'Jersey City', borough: 'New Jersey', lat: 40.7178, lng: -74.0431 }]
    .filter((n) => n.borough === borough)
    .sort((a, b) => a.name.localeCompare(b.name, 'en', { sensitivity: 'base' })),
}));

await document.fonts.load('8px "Press Start 2P"').catch(() => {});
const map = createMap(el.map, { pixelSize: 2 });

// ?at=lat,lng,zoom opens the map on that spot, for sharing a view.
const at = new URLSearchParams(location.search).get('at')?.split(',').map(Number);
if (at?.length === 3 && at.every(Number.isFinite)) map.focusLatLng(at[0], at[1], at[2]);

// Official neighborhood names appear once you zoom in past the borough labels.
for (const n of NEIGHBORHOODS) map.addAnchor(n.name, n.lat, n.lng, { className: 'hood', minZoom: 2.4 });
// Big parks and highways get their names from the borough view in; landmarks and venues closer in.
for (const p of PARK_LABELS) map.addAnchor(p.name, p.lat, p.lng, { className: 'park-name', minZoom: 1.5 });
for (const r of ROAD_LABELS) map.addAnchor(r.name, r.lat, r.lng, { className: 'road-name', minZoom: 2.2 });
for (const p of [...PLACES, ...MORE_LABELS]) map.addAnchor(p.name, p.lat, p.lng, { className: 'poi', minZoom: 3 });

// The monster easter egg (site menu, or by itself after two minutes).
initMonster(map);
// Full-zoom easter eggs: a sunbather on Brighton Beach, a flying van over the Lower East Side
// and a rooftop cookout on the Upper West Side.
initSunbather(map);
initFlyingVan(map);
initRooftopGrill(map);
// Times Square: the plaza, the billboard building (an ad/event space like the one beside the header)
// and One Times Square with the New Year's Eve ball.
initTimesSquare(map);
// Subway alerts in the + menu: the lines affected by today's active alerts or planned work.
initSubway(map);

// Every publisher with events on the shown day, plus any registered source that returned none.
let publishers = new Map();
// The NYC day today's listings cover (YYYY-MM-DD); tomorrow is the day after it.
let todayDay = null;
let loading = 0;

await loadDay(false);

map.on('select', (id) => select(id, { fromMap: true }));
// Zoomed or moved away from home, the list shows only the events on screen.
map.on('view', () => {
  state.inView = map.atHome() ? null : map.eventsInView();
  render();
});
map.on('hover', (id) => {
  document.querySelectorAll('.ev.is-hover').forEach((n) => n.classList.remove('is-hover'));
  // Hovering a pin scrolls the list to its listing and highlights it.
  const row = id && document.querySelector(`.ev[data-id="${CSS.escape(id)}"]`);
  if (row) {
    row.classList.add('is-hover');
    row.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }
});

// ---- controls ----------------------------------------------------------
el.date.addEventListener('click', () => loadDay(!state.tomorrow));
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
el.listReset.addEventListener('click', () => {
  map.home();
  state.inView = null;
  render();
  el.list.closest('.list-wrap').scrollTop = 0;
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
  } else if (!el.hoodMenu.hidden) {
    toggleHoods(false);
    el.hoodBtn.focus();
  } else if (state.selected) select(null);
});
el.srcBtn.addEventListener('click', () => {
  toggleCategories(false);
  toggleHoods(false);
  toggleSources(el.srcMenu.hidden);
});
el.catBtn.addEventListener('click', () => {
  toggleSources(false);
  toggleHoods(false);
  toggleCategories(el.catMenu.hidden);
});
el.hoodBtn.addEventListener('click', () => {
  toggleSources(false);
  toggleCategories(false);
  toggleHoods(el.hoodMenu.hidden);
});
document.addEventListener('pointerdown', (e) => {
  if (!el.srcMenu.hidden && !e.target.closest('.src-filter')) toggleSources(false);
  if (!el.catMenu.hidden && !e.target.closest('.cat-filter')) toggleCategories(false);
  if (!el.hoodMenu.hidden && !e.target.closest('.hood-filter')) toggleHoods(false);
});
for (const b of [el.hoodSecBtn, el.subSecBtn]) {
  b.addEventListener('click', () => openSection(b, b.getAttribute('aria-expanded') !== 'true'));
}
el.hoodSearch.addEventListener('input', renderHoods);
// Enter in the search box goes to the first match.
el.hoodSearch.addEventListener('keydown', (e) => {
  if (e.key !== 'Enter') return;
  e.preventDefault();
  el.hoodList.querySelector('.hood-go')?.click();
});
el.hoodList.addEventListener('click', (e) => {
  const b = e.target.closest('.hood-go');
  if (!b) return;
  goToPlace(b.dataset.name, +b.dataset.lat, +b.dataset.lng, +b.dataset.zoom);
});
$('#src-all').addEventListener('click', () => setSources([...publishers.keys()]));
$('#src-none').addEventListener('click', () => setSources([]));
$('#cat-all').addEventListener('click', () => setCategories([]));
$('#cat-none').addEventListener('click', () => setCategories(CATEGORIES));
el.catList.addEventListener('change', (e) => {
  const id = e.target.value;
  if (e.target.checked) state.catsOff.delete(id);
  else state.catsOff.add(id);
  categoriesChanged();
});
// Tapping a category's name shows only that category; tapping it again when it is the only one brings all back.
el.catList.addEventListener('click', (e) => {
  const c = e.target.closest('.cat-only')?.dataset.cat;
  if (!c) return;
  const onlyThis = state.catsOff.size === CATEGORIES.length - 1 && !state.catsOff.has(c);
  setCategories(onlyThis ? [] : CATEGORIES.filter((x) => x !== c));
  toggleCategories(false);
});
el.srcList.addEventListener('change', (e) => {
  const id = e.target.value;
  if (e.target.checked) state.sources.add(id);
  else state.sources.delete(id);
  sourcesChanged();
});

// ---- loading a day -----------------------------------------------------------
// Swaps every pin, list row and count for the chosen day's events.
async function loadDay(tomorrow) {
  const run = ++loading;
  el.count.textContent = 'LOADING';
  el.date.disabled = true;
  const day = tomorrow ? nextDay(todayDay ?? nycToday()) : null;
  const { events, errors } = await loadEventsForDate(tomorrow ? new Date(Date.now() + 864e5) : new Date(), { tomorrow, day });
  if (run !== loading) return;
  el.date.disabled = false;

  state.tomorrow = tomorrow;
  state.events = events;
  el.status.textContent = errors.length ? `${errors.length} source(s) could not be loaded.` : '';

  // The header shows the NYC day the listings cover, which can differ from the
  // viewer's own date.
  const snaps = SOURCES.filter((s) => s.snapshot);
  const snap = nycgovSource.snapshot ?? snaps[0]?.snapshot;
  if (!tomorrow) todayDay = snap?.date ?? nycToday();
  const shownDay = tomorrow ? day : todayDay;
  const label = new Date(`${shownDay}T12:00:00`).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' }).toUpperCase();
  el.date.innerHTML = tomorrow ? `<b aria-hidden="true">&lt;</b>${label}` : `${label}<b aria-hidden="true">&gt;</b>`;
  el.date.setAttribute('aria-label', `${label}. Show ${tomorrow ? 'today' : 'tomorrow'}'s events`);
  el.date.title = tomorrow ? 'Back to today' : "See tomorrow's events";
  el.date.setAttribute('aria-pressed', String(tomorrow));
  el.listTitle.textContent = tomorrow ? 'TOMORROW' : 'TODAY';
  const foot = $('.panel-foot');
  if (snaps.length) {
    const latest = snaps.map((s) => s.snapshot.fetchedAt).sort().at(-1);
    const at = new Date(latest).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', timeZone: 'America/New_York' });
    const unplaced = snaps.reduce((n, s) => n + s.snapshot.unplaced, 0);
    foot.textContent = `LISTINGS FROM ${snaps.map((s) => s.name).join(', ')}, UPDATED ${at} NYC TIME. ${unplaced ? `${unplaced} WITHOUT A MAPPABLE ADDRESS NOT SHOWN. ` : ''}EVENTS OUTSIDE THE MAP AREA ARE NOT SHOWN.`.toUpperCase();
  } else if (tomorrow) {
    foot.textContent = "TOMORROW'S LISTINGS ARE NOT IN YET. THEY ARRIVE WITH THE NEXT SCHEDULED UPDATE.";
  }

  // Keep any source the viewer switched off switched off on the other day.
  const off = new Set([...publishers.keys()].filter((id) => !state.sources.has(id)));
  publishers = new Map();
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
  state.sources = new Set([...publishers.keys()].filter((id) => !off.has(id)));

  state.selected = null;
  state.detailsOpen = false;
  map.select(null);
  map.setEvents(events);
  if (state.inView) state.inView = map.eventsInView();
  renderSources();
  renderCategories();
  render();
}

function nycToday() {
  return new Date().toLocaleDateString('en-CA', { timeZone: 'America/New_York' });
}
function nextDay(ymd) {
  const d = new Date(`${ymd}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
}

// ---- rendering -------------------------------------------------------------
function sourceEvents() {
  return state.events.filter((e) => state.sources.has(e.publisher.id));
}

function visibleEvents() {
  const list = sourceEvents();
  return list.filter((e) => !state.catsOff.has(e.category));
}

// The events in the list: the visible ones, cut down to the map's view once it leaves home.
function listedEvents() {
  const list = visibleEvents();
  return state.inView ? list.filter((e) => state.inView.has(e.id)) : list;
}

// The Sources dropdown is always A to Z by name, skipping a leading "The" (MK's rule), whatever sources are added later.
function sortName(name) {
  return name.replace(/^the\s+/i, '');
}

function renderSources() {
  el.srcList.innerHTML = [...publishers.values()].sort((a, b) => sortName(a.name).localeCompare(sortName(b.name), 'en', { sensitivity: 'base', numeric: true })).map((p) => `
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

// The + menu opens with its two sections (Neighborhoods, Subway Alerts) folded; each header opens its own.
function toggleHoods(open) {
  el.hoodMenu.hidden = !open;
  el.hoodBtn.setAttribute('aria-expanded', String(open));
  if (!open) return;
  openSection(el.hoodSecBtn, false);
  openSection(el.subSecBtn, false);
}

function openSection(btn, open) {
  btn.setAttribute('aria-expanded', String(open));
  document.getElementById(btn.getAttribute('aria-controls')).hidden = !open;
  if (!open || btn !== el.hoodSecBtn) return;
  el.hoodSearch.value = '';
  renderHoods();
  el.hoodList.scrollTop = 0;
  // Phones skip the focus so the keyboard does not cover the list.
  if (matchMedia('(hover: hover)').matches) el.hoodSearch.focus();
}

// The last place picked is marked in the list the next time it opens.
let pickedPlace = null;

function renderHoods() {
  const q = el.hoodSearch.value.trim().toLowerCase();
  const item = (name, lat, lng, zoom, cls = '') => `
    <li><button class="hood-go${cls}${name === pickedPlace ? ' is-on' : ''}" type="button" data-name="${esc(name)}" data-lat="${lat}" data-lng="${lng}" data-zoom="${zoom}">${esc(name)}</button></li>`;
  el.hoodList.innerHTML = HOOD_GROUPS.map((g) => {
    const boroHit = !q || g.borough.toLowerCase().includes(q);
    const hoods = q ? g.hoods.filter((n) => n.name.toLowerCase().includes(q)) : g.hoods;
    if (!boroHit && !hoods.length) return '';
    const label = g.borough === 'Bronx' ? 'THE BRONX' : g.borough.toUpperCase();
    return `<li class="hood-boro" aria-hidden="true">${label}</li>`
      + (boroHit ? item(`All of ${g.borough === 'Bronx' ? 'the Bronx' : g.borough}`, g.view.lat, g.view.lng, g.view.zoom, ' is-boro') : '')
      + hoods.map((n) => item(n.name, n.lat, n.lng, HOOD_ZOOM)).join('');
  }).join('') || '<li class="hood-empty">No neighborhood by that name.</li>';
}

function goToPlace(name, lat, lng, zoom) {
  pickedPlace = name;
  toggleHoods(false);
  if (state.selected) select(null);
  map.focusLatLng(lat, lng, zoom);
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
  if (state.selected && !visibleEvents().some((e) => e.id === state.selected)) select(null);
  renderCategories();
  render();
}

function setCategories(off) {
  state.catsOff = new Set(off);
  categoriesChanged();
}

function categoriesChanged() {
  if (state.selected && !visibleEvents().some((e) => e.id === state.selected)) select(null);
  renderCategories();
  render();
}

// The five main categories always show first; the rest follow when the day has events in them.
function renderCategories() {
  const counts = Object.fromEntries(CATEGORIES.map((c) => [c, 0]));
  sourceEvents().forEach((e) => counts[e.category]++);
  const rest = CATEGORIES.filter((c) => !MAIN_CATEGORIES.includes(c) && (counts[c] || state.catsOff.has(c)));
  el.catList.innerHTML = [...MAIN_CATEGORIES, ...rest].map((c) => `
    <li class="cat-item" style="--cat:${CATEGORY_COLORS[c]}">
      <label class="src-item cat-check" title="Add or remove ${CATEGORY_LABELS[c]}"><input type="checkbox" value="${c}"${state.catsOff.has(c) ? '' : ' checked'} aria-label="${CATEGORY_LABELS[c]}"><i aria-hidden="true"></i></label>
      <button class="cat-only" type="button" data-cat="${c}" title="Show only ${CATEGORY_LABELS[c]}"><em aria-hidden="true"></em>${CATEGORY_LABELS[c]}<small>ONLY</small><span>${counts[c]}</span></button>
    </li>`).join('');
  const on = CATEGORIES.filter((c) => !state.catsOff.has(c)).length;
  el.catSummary.textContent = on === CATEGORIES.length ? 'ALL' : on === 1 ? CATEGORY_LABELS[CATEGORIES.find((c) => !state.catsOff.has(c))].toUpperCase() : `${on}/${CATEGORIES.length}`;
}

function render() {
  const all = visibleEvents();
  map.setVisible(all.map((e) => e.id));
  el.count.textContent = `${all.length} ${all.length === 1 ? 'EVENT' : 'EVENTS'} ${state.tomorrow ? 'TOMORROW' : 'TODAY'}`;
  const list = listedEvents();
  el.listHint.textContent = state.inView ? `${list.length} IN VIEW` : 'TAP A PIN OR A ROW';
  el.listReset.hidden = !state.inView;

  const now = Date.now();
  el.list.innerHTML = list.map((e) => {
    const live = new Date(e.start) <= now && (!e.end || new Date(e.end) > now);
    return `
    <li>
      <button class="ev${e.id === state.selected ? ' is-selected' : ''}" type="button" data-id="${esc(e.id)}" style="--cat:${CATEGORY_COLORS[e.category]}">
        <span class="ev-time">${e.allDay ? 'ALL DAY' : fmtTime(e.start)}${live ? '<em>NOW</em>' : ''}</span>
        <span class="ev-title">${esc(e.title)}</span>
        <span class="ev-meta">${esc([e.venue.name, e.venue.neighborhood].filter(Boolean).join(' · '))}</span>
        <span class="ev-tags"><span class="tag">${CATEGORY_LABELS[e.category]}</span>${e.source.id === 'seatgeek' ? `<span class="sg-mark" title="Data from SeatGeek">${SEATGEEK_LOGO}</span>` : ''}${e.listingOnly ? '' : `<span class="price">${fmtPrice(e)}</span>`}</span>
      </button>
    </li>`;
  }).join('') || `<li class="empty">${state.inView && all.length ? 'No events in this part of the map.' : !state.events.length && state.tomorrow ? "Tomorrow's listings are not in yet." : state.sources.size ? `No events in the ticked categories ${state.tomorrow ? 'tomorrow' : 'today'}.` : 'No sources selected. Pick some under SOURCES.'}</li>`;

  el.list.querySelectorAll('.ev').forEach((b) => {
    b.addEventListener('click', () => select(b.dataset.id));
    b.addEventListener('mouseenter', () => map.highlight(b.dataset.id));
    b.addEventListener('mouseleave', () => map.highlight(null));
  });

  renderDetail();
}

function renderDetail() {
  const e = state.events.find((x) => x.id === state.selected);
  el.detail.hidden = !e;
  if (!e) return;
  const maps = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${e.venue.name}, ${e.venue.address}, New York`)}`;
  el.detail.style.setProperty('--cat', CATEGORY_COLORS[e.category]);
  const seatgeek = e.source.id === 'seatgeek'
    ? `<a class="sg-logo" href="https://seatgeek.com" target="_blank" rel="noopener" aria-label="SeatGeek" title="Event data from SeatGeek">${SEATGEEK_LOGO}</a>`
    : '';
  // Some sources may only be shown as title, time and a link back to them.
  if (e.listingOnly) {
    el.detail.innerHTML = `
    <button class="close" type="button" id="detail-close" aria-label="Close event">X</button>
    <p class="d-cat"><i aria-hidden="true"></i>${CATEGORY_LABELS[e.category]}</p>
    <h2>${esc(e.title)}</h2>
    <dl>
      <div><dt>WHEN</dt><dd>${e.allDay ? 'All day' : `${fmtTime(e.start)}${e.end ? ` to ${fmtTime(e.end)}` : ''}`}</dd></div>
      <div><dt>WHERE</dt><dd>${esc(e.venue.name)}</dd></div>
    </dl>
    <p class="d-src">Details at ${esc(e.source.name)}</p>
    <div class="d-actions">
      ${e.url ? `<a class="btn" href="${esc(e.url)}" target="_blank" rel="noopener">LISTING</a>` : ''}
      <a class="btn" href="${maps}" target="_blank" rel="noopener">DIRECTIONS</a>
    </div>`;
    $('#detail-close').addEventListener('click', () => select(null));
    return;
  }
  el.detail.innerHTML = `
    <button class="close" type="button" id="detail-close" aria-label="Close event">X</button>
    <p class="d-cat"><i aria-hidden="true"></i>${CATEGORY_LABELS[e.category]}</p>
    <h2>${esc(e.title)}</h2>
    <dl>
      <div><dt>WHEN</dt><dd>${e.allDay ? 'All day' : `${fmtTime(e.start)}${e.end ? ` to ${fmtTime(e.end)}` : ''}`}</dd></div>
      <div><dt>WHERE</dt><dd>${esc(e.venue.name)}<br><small>${esc([e.venue.address !== e.venue.name ? e.venue.address : '', e.venue.address?.includes(e.venue.neighborhood) ? '' : e.venue.neighborhood].filter(Boolean).join(', '))}</small></dd></div>
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
      ${seatgeek}
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
  if (id) map.focusEvent(id);
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
