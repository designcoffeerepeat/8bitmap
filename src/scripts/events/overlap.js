// Many shows are listed on more than one site. When two sources list the same
// event, keep the one listing that carries the most information (description,
// price, exact time, link, address) and drop the rest. This runs on the merged
// list, so a source added later is covered without any extra code.
//
// One fixed rule from MK: when Ticketmaster and SeatGeek both list a show, the
// SeatGeek listing wins, however the two compare. Another source can still win
// over both if it carries more.
//
// Sites word titles and venue names differently ("Hamilton (NY)" at "Richard
// Rodgers Theatre-NY" vs "Hamilton" at "Richard Rodgers Theatre"), and their
// venue coordinates can sit a few blocks apart, so a match is: same start time
// (within 15 minutes), the same venue by name or by position, and titles that
// share their words. A listing with no exact time (all day, or midnight) matches
// a timed one on the same day only when the titles match outright.

const OVER = { ticketmaster: 'seatgeek' };

const WINDOW = 15 * 60 * 1000;
const DAY = 24 * 60 * 60 * 1000;

const TITLE_FILLER = new Set(['the', 'a', 'an', 'and', 'of', 'at', 'with', 'w', 'in', 'on', 'new', 'york', 'ny', 'nyc', 'live', 'tour', 'musical', 'presents', 'vs', 'v']);
const VENUE_FILLER = new Set(['the', 'at', 'of', 'and', 'new', 'york', 'ny', 'nyc', 'theatre', 'theater', 'center', 'centre']);

export function mergeDuplicates(events) {
  const kept = new Set(duplicateGroups(events).map((group) => (group.length === 1 ? group[0] : pick(group))));
  return events.filter((ev) => kept.has(ev));
}

// Listings grouped so each group is one real event.
export function duplicateGroups(events) {
  const items = events.map((ev) => ({ ev, t: new Date(ev.start).getTime(), timed: hasTime(ev) }));
  items.sort((a, b) => a.t - b.t);

  // Union every pair of listings that look like the same event.
  const parent = items.map((_, i) => i);
  const root = (i) => (parent[i] === i ? i : (parent[i] = root(parent[i])));
  for (let i = 0; i < items.length; i++) {
    for (let j = i + 1; j < items.length && items[j].t - items[i].t <= DAY; j++) {
      if (root(i) !== root(j) && sameEvent(items[i], items[j])) parent[root(j)] = root(i);
    }
  }

  const groups = new Map();
  items.forEach((it, i) => {
    const r = root(i);
    if (!groups.has(r)) groups.set(r, []);
    groups.get(r).push(it.ev);
  });
  return [...groups.values()];
}

// The richest listing in a group, after the fixed source rules.
export function pick(group) {
  const ids = new Set(group.map((ev) => ev.source.id));
  const eligible = group.filter((ev) => !(OVER[ev.source.id] && ids.has(OVER[ev.source.id])));
  return eligible.reduce((best, ev) => (richness(ev) > richness(best) ? ev : best));
}

export function richness(ev) {
  let score = 0;
  // A one-word blurb such as "concert" says nothing the category does not.
  const text = `${ev.description} ${ev.details}`.trim();
  if (text.length >= 25) score += 3 + Math.min(text.length, 600) / 200;
  if (ev.details) score += 1;
  if (ev.price || !ev.priceUnknown) score += 2;
  if (ev.price && ev.price.max > ev.price.min) score += 0.5;
  if (hasTime(ev)) score += 2;
  if (ev.end) score += 1;
  if (ev.url) score += 2;
  if (ev.venue.address) score += 1;
  if (ev.venue.neighborhood) score += 0.5;
  if (ev.tags?.length) score += 0.5;
  if (ev.listingOnly) score -= 3;
  return score;
}

function sameEvent(a, b) {
  const x = a.ev;
  const y = b.ev;
  // The same listing site does not list one event twice; this is for cross-source copies.
  if (x.source.id === y.source.id && x.publisher.id === y.publisher.id) return false;
  if (!sameVenue(x.venue, y.venue)) return false;
  if (a.timed && b.timed) return Math.abs(a.t - b.t) <= WINDOW && sameTitle(x.title, y.title);
  return x.start.slice(0, 10) === y.start.slice(0, 10) && sameWords(x.title, y.title);
}

function hasTime(ev) {
  return !ev.allDay && !/T00:00(:00)?/.test(ev.start);
}

function sameVenue(a, b) {
  const metres = distance(a, b);
  if (metres < 75) return true;
  if (metres > 1000) return false;
  return subset(words(a.name, VENUE_FILLER), words(b.name, VENUE_FILLER));
}

function sameTitle(a, b) {
  const x = words(a, TITLE_FILLER);
  const y = words(b, TITLE_FILLER);
  const shared = [...x].filter((w) => y.has(w)).length;
  return shared >= 2 || (shared > 0 && shared === Math.min(x.size, y.size));
}

function sameWords(a, b) {
  const x = words(a, TITLE_FILLER);
  const y = words(b, TITLE_FILLER);
  return x.size > 0 && x.size === y.size && [...x].every((w) => y.has(w));
}

function subset(x, y) {
  const [small, big] = x.size <= y.size ? [x, y] : [y, x];
  return small.size > 0 && [...small].every((w) => big.has(w));
}

function words(s, filler) {
  const plain = String(s).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/['’]/g, '');
  return new Set(plain.split(/[^a-z0-9]+/).filter((w) => w && !filler.has(w)));
}

function distance(a, b) {
  const dLat = (a.lat - b.lat) * 111_000;
  const dLng = (a.lng - b.lng) * 111_000 * Math.cos((a.lat * Math.PI) / 180);
  return Math.hypot(dLat, dLng);
}
