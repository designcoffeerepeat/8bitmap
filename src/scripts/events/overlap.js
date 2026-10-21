// Ticketmaster and SeatGeek list many of the same shows. When both have one,
// keep the SeatGeek listing and drop the Ticketmaster copy.
//
// The two sites word titles and venue names differently ("Hamilton (NY)" at
// "Richard Rodgers Theatre-NY" vs "Hamilton" at "Richard Rodgers Theatre"), and
// their venue coordinates can sit a few blocks apart, so a match is: same start
// time (within 15 minutes), the same venue by name or by position, and titles
// that share their words.

const PREFERRED = 'seatgeek';
const DROPPED = 'ticketmaster';

const TITLE_FILLER = new Set(['the', 'a', 'an', 'and', 'of', 'at', 'with', 'w', 'in', 'on', 'new', 'york', 'ny', 'nyc', 'live', 'tour', 'musical', 'presents', 'vs', 'v']);
const VENUE_FILLER = new Set(['the', 'at', 'of', 'and', 'new', 'york', 'ny', 'nyc', 'theatre', 'theater', 'center', 'centre']);

export function preferSeatGeek(events) {
  const preferred = events.filter((ev) => ev.source.id === PREFERRED);
  if (!preferred.length) return events;
  return events.filter((ev) => ev.source.id !== DROPPED || !preferred.some((p) => sameShow(ev, p)));
}

function sameShow(a, b) {
  if (Math.abs(new Date(a.start) - new Date(b.start)) > 15 * 60 * 1000) return false;
  if (!sameVenue(a.venue, b.venue)) return false;
  return sameTitle(a.title, b.title);
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
