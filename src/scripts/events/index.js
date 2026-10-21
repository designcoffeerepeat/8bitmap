// Event pipeline: ask every registered source for a day's events, normalise,
// drop anything off the map or on another day, de-duplicate, sort by time.
//
// To add a real listings site later, write a module in ./sources/ that exports
// { id, name, url, fetchEvents({ date, bounds }) } and add it to SOURCES.
// See ./sources/template.js.

import { normalizeEvent } from './schema.js';
import { inBounds, BOUNDS } from '../map/geo.js';
import nycgovSource from './sources/nycgov.js';
import raSource from './sources/ra.js';
import skintSource from './sources/skint.js';
import donycSource from './sources/donyc.js';
import lumaSource from './sources/luma.js';
import permitsSource from './sources/permits.js';
import ticketmasterSource from './sources/ticketmaster.js';
import seatgeekSource from './sources/seatgeek.js';
import diceSource from './sources/dice.js';
import artwrldSource from './sources/artwrld.js';
import artguideSource from './sources/artguide.js';
import artrabbitSource from './sources/artrabbit.js';
import { LIVE_HIDDEN } from './live.js';

// ./sources/dummy.js holds sample events for offline testing.
const ALL_SOURCES = [nycgovSource, donycSource, raSource, skintSource, lumaSource, permitsSource, ticketmasterSource, seatgeekSource, diceSource, artwrldSource, artguideSource, artrabbitSource];

// Live builds (anything not built with PUBLIC_SITE=dev) leave out the sources in ./live.js.
const IS_DEV = import.meta.env.PUBLIC_SITE === 'dev';
export const SOURCES = IS_DEV ? ALL_SOURCES : ALL_SOURCES.filter((s) => !LIVE_HIDDEN.includes(s.id));

// `tomorrow` reads the next-day snapshots; `day` (YYYY-MM-DD) then drops any
// snapshot left over from an earlier run that covers some other day.
export async function loadEventsForDate(date = new Date(), { tomorrow = false, day: onlyDay = null } = {}) {
  const results = await Promise.allSettled(
    SOURCES.map((s) => s.fetchEvents({ date, bounds: BOUNDS, tomorrow }).then((rows) => ({ s, rows }))),
  );

  const events = [];
  const errors = [];
  for (const r of results) {
    if (r.status === 'rejected') {
      errors.push(r.reason);
      continue;
    }
    // A snapshot source names the NYC day it covers; match on the listing's own
    // local date so the result does not depend on the viewer's time zone.
    // `listedDay` keeps an after-midnight party on the night it is listed for.
    const day = r.value.s.snapshot?.date;
    if (onlyDay && day !== onlyDay) {
      r.value.s.snapshot = null;
      continue;
    }
    for (const raw of r.value.rows) {
      const ev = normalizeEvent(raw, r.value.s);
      const onDay = ev && (day ? (raw.listedDay ?? ev.start.slice(0, 10)) === day : sameDay(new Date(ev.start), date));
      if (ev && onDay && inBounds(ev.venue.lat, ev.venue.lng)) events.push(ev);
    }
  }

  return { events: dedupe(events).sort((a, b) => new Date(a.start) - new Date(b.start)), errors };
}

function sameDay(a, b) {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

// The same show often appears on several listing sites.
function dedupe(events) {
  const seen = new Map();
  for (const ev of events) {
    const key = `${ev.title.toLowerCase()}|${ev.venue.name.toLowerCase()}|${ev.start.slice(0, 16)}`;
    if (!seen.has(key)) seen.set(key, ev);
  }
  return [...seen.values()];
}
