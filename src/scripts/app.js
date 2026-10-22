import { createMap } from './map/renderer.js';
import { loadEventsForDate, SOURCES } from './events/index.js';
import { CATEGORIES, MAIN_CATEGORIES, CATEGORY_LABELS } from './events/schema.js';
import { CATEGORY_COLORS } from './map/palette.js';
import NEIGHBORHOODS from './map/neighborhoods.json';
import nycgovSource from './events/sources/nycgov.js';
import { initMonster } from './monster.js';
import { initSunbather } from './sunbather.js';
import { initFlyingVan } from './flying-van.js';
import { initRooftopGrill } from './rooftop-grill.js';

const LIST_PAGE = 8;

// SeatGeek's wordmark (from seatgeek.com/press, via Simple Icons), shown with every
// event that uses SeatGeek data and linked to seatgeek.com in the event card.
const SEATGEEK_LOGO = '<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M11.866 11.277h-.177l-.703-.001v-.001c-1.337-.002-3.426-.009-3.845-.011v-7.37c2.111.089 4.044.121 4.044.121l.304 1.556c.001 0-.745.007-2.361-.03v1.394l1.486.022v1.31L9.128 8.25v1.452c.832.008 1.595.013 2.411.014l1.99-5.615c.3-.008 1.573-.041 1.886-.054l2.637 7.225c-.661.003-1.331-.009-1.993-.006l-.448-1.302c-.76.008-1.52.013-2.281.016l-.445 1.293c-.355 0-.685 0-1.019.004Zm2.607-4.625-.693 2.015c.461-.004.921-.009 1.38-.016l-.687-1.999Zm4.389-1.197c-.719.044-1.438.081-2.157.112l.307-1.594c1.904-.105 3.8-.271 5.694-.497l.306 1.645c-.719.071-1.439.134-2.16.192l-.01 5.953c-.66.006-1.32-.001-1.98.004V5.455ZM6.533 9.069c0 1.246-.901 2.401-2.674 2.401-1.61 0-2.42-.752-2.42-.752V8.699c1.101 1.043 3.266 1.745 3.266.482 0-.96-3.266-1.125-3.266-3.518 0-1.342 1.247-2.186 2.675-2.186 1.009 0 1.855.193 2.065.258l-.083 1.772c-.884-.521-2.801-.763-2.801.134 0 .992 3.239 1.002 3.238 3.428Zm14.861 11.155-1.957-3.596v3.433c-.673-.053-1.982-.133-1.982-.133V12.5l1.982.004c-.007 1.059.008 2.118 0 3.176l2.028-3.18h2.233l-2.314 3.569L24 20.525a90.598 90.598 0 0 0-2.606-.301ZM9.132 18.231c.892-.019 1.785-.029 2.678-.029l-.307 1.561c-.869.003-3.428.062-4.358.122v-7.374h4.038l.307 1.536s-.973-.007-2.358-.008v1.399l1.481-.013v1.323l-1.481.018v1.465Zm5.162-.001c.707.015 1.905.054 2.682.082l-.32 1.573a87.388 87.388 0 0 0-4.349-.121v-7.253l4.051.002.306 1.551-2.371-.015v1.389c.461.005.92.009 1.379.017v1.321c-.459-.011-.919-.018-1.379-.025l.001 1.479ZM3.617 15.549l2.604-.059v4.445s-.7.032-2.26.178C1.746 20.321 0 19.022 0 16.468c0-3.034 2.222-3.993 4.225-3.993.868 0 1.379.016 1.667.031l.328 1.723s-.58-.122-1.673-.122c-1.24 0-2.585.415-2.585 2.078 0 1.791.745 2.392 2.556 2.228l-.001-1.536-1.206.059.306-1.387Z"/></svg>';

const state = {
  events: [],
  catsOff: new Set(), // categories unticked in the Categories dropdown (new ones start ticked)
  sources: new Set(), // publisher ids switched on in the Sources dropdown
  selected: null,
  showAll: false,
  detailsOpen: false,
  tomorrow: false, // the header date switches between today's and tomorrow's listings
};

const $ = (sel) => document.querySelector(sel);
const el = {
  map: $('#map'),
  date: $('#today-date'),
  count: $('#today-count'),
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
  catList: $('#cat-list'),
  srcMenu: $('#src-menu'),
  srcList: $('#src-list'),
  srcSummary: $('#src-summary'),
  listTitle: $('#list-title'),
};

await document.fonts.load('8px "Press Start 2P"').catch(() => {});
const map = createMap(el.map, { pixelSize: 2 });

// Official neighborhood names appear once you zoom in past the borough labels.
for (const n of NEIGHBORHOODS) map.addAnchor(n.name, n.lat, n.lng, { className: 'hood', minZoom: 2.4 });

// The monster easter egg (site menu, or by itself after two minutes).
initMonster(map);
// Full-zoom easter eggs: a sunbather on Brighton Beach, a flying van over the Lower East Side
// and a rooftop cookout on the Upper West Side.
initSunbather(map);
initFlyingVan(map);
initRooftopGrill(map);

// Every publisher with events on the shown day, plus any registered source that returned none.
let publishers = new Map();
// The NYC day today's listings cover (YYYY-MM-DD); tomorrow is the day after it.
let todayDay = null;
let loading = 0;

await loadDay(false);

map.on('select', (id) => select(id, { fromMap: true }));
map.on('hover', (id) => {
  document.querySelectorAll('.ev.is-hover').forEach((n) => n.classList.remove('is-hover'));
  if (id) document.querySelector(`.ev[data-id="${CSS.escape(id)}"]`)?.classList.add('is-hover');
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
  state.showAll = false;
  map.select(null);
  map.setEvents(events);
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

// The Sources dropdown is always A to Z by name (MK's rule), whatever sources are added later.
function renderSources() {
  el.srcList.innerHTML = [...publishers.values()].sort((a, b) => a.name.localeCompare(b.name, 'en', { sensitivity: 'base', numeric: true })).map((p) => `
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
  state.showAll = false;
  if (state.selected && !visibleEvents().some((e) => e.id === state.selected)) select(null);
  renderCategories();
  render();
}

function setCategories(off) {
  state.catsOff = new Set(off);
  categoriesChanged();
}

function categoriesChanged() {
  state.showAll = false;
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
  const list = visibleEvents();
  map.setVisible(list.map((e) => e.id));
  el.count.textContent = `${list.length} ${list.length === 1 ? 'EVENT' : 'EVENTS'} ${state.tomorrow ? 'TOMORROW' : 'TODAY'}`;

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
        <span class="ev-tags"><span class="tag">${CATEGORY_LABELS[e.category]}</span>${e.source.id === 'seatgeek' ? `<span class="sg-mark" title="Data from SeatGeek">${SEATGEEK_LOGO}</span>` : ''}${e.listingOnly ? '' : `<span class="price">${fmtPrice(e)}</span>`}</span>
      </button>
    </li>`;
  }).join('') || `<li class="empty">${!state.events.length && state.tomorrow ? "Tomorrow's listings are not in yet." : state.sources.size ? `No events in the ticked categories ${state.tomorrow ? 'tomorrow' : 'today'}.` : 'No sources selected. Pick some under SOURCES.'}</li>`;

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
