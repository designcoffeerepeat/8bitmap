// Event pipeline: ask every registered source for a day's events, normalise,
// drop anything off the map or on another day, de-duplicate, sort by time.
//
// To add a real listings site later, write a module in ./sources/ that exports
// { id, name, url, fetchEvents({ date, bounds }) } and add it to SOURCES.
// See ./sources/template.js.

import { normalizeEvent } from './schema.js';
import { inBounds, BOUNDS } from '../map/geo.js';
import dummySource from './sources/dummy.js';

export const SOURCES = [dummySource];

export async function loadEventsForDate(date = new Date()) {
  const results = await Promise.allSettled(
    SOURCES.map((s) => s.fetchEvents({ date, bounds: BOUNDS }).then((rows) => ({ s, rows }))),
  );

  const events = [];
  const errors = [];
  for (const r of results) {
    if (r.status === 'rejected') {
      errors.push(r.reason);
      continue;
    }
    for (const raw of r.value.rows) {
      const ev = normalizeEvent(raw, r.value.s);
      if (ev && inBounds(ev.venue.lat, ev.venue.lng) && sameDay(new Date(ev.start), date)) events.push(ev);
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
