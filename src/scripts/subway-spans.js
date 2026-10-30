// Where an alert takes a line out of service, worked out from its headline: "No [L] trains between 8 Av
// and Broadway Junction", "[A] trains are suspended between Howard Beach and Rockaway Park"... The two
// station names are matched against the stations that route stops at (subway.json, from the MTA's GTFS)
// and the stretch of line between them is returned, to be drawn in red. No DOM here, so the deploy
// workflow can try it against the live feed (tools/check_subway_spans.mjs).

const SPAN = [
  /\bno\s+(?:\[[^\]]+\]\s*)*(?:trains?|service)\s+(?:running\s+|operating\s+)?(?:in\s+either\s+direction\s+|in\s+both\s+directions\s+)?between\s+(.+?)\s+and\s+(.+?)(?=[.;,(]|\s+(?:due|while|because|for|from|on|in|until|through|as|during|after|weekends?|nights?|days?|-)\b|$)/i,
  /\b(?:trains?|service)\s+(?:is\s+|are\s+)?suspended\s+between\s+(.+?)\s+and\s+(.+?)(?=[.;,(]|\s+(?:due|while|because|for|from|on|in|until|through|as|during|after|-)\b|$)/i,
];

const WORDS = [
  [/\bavenues?\b|\bave?s?\b/g, 'av'],
  [/\bstreets?\b|\bsts?\b/g, 'st'],
  [/\bparkway\b|\bpkwy\b/g, 'pkwy'],
  [/\bboulevard\b|\bblvd\b/g, 'blvd'],
  [/\bsquare\b|\bsq\b/g, 'sq'],
  [/\broad\b|\brd\b/g, 'rd'],
  [/\bplace\b|\bpl\b/g, 'pl'],
  [/\bjunction\b|\bjct\b/g, 'jct'],
  [/\bcenter\b|\bctr\b/g, 'ctr'],
  [/\bheights\b|\bhts\b/g, 'hts'],
  [/\b(\d+)(?:st|nd|rd|th)\b/g, '$1'],
  [/\bstations?\b|\bthe\b/g, ''],
];

export function norm(name) {
  let s = String(name).toLowerCase().replace(/[–—/-]/g, ' ').replace(/[^a-z0-9 ]/g, ' ');
  for (const [re, to] of WORDS) s = s.replace(re, to);
  return s.replace(/\s+/g, ' ').trim();
}

// words that say what kind of street, not which one
const GENERIC = new Set(['av', 'st', 'pkwy', 'blvd', 'sq', 'rd', 'pl', 'jct', 'ctr', 'hts']);

// 0 to 1: how well an alert's station name fits a GTFS station name
function fit(want, have) {
  if (want === have) return 1;
  const a = want.split(' ').filter((w) => !GENERIC.has(w));
  const b = new Set(have.split(' ').filter((w) => !GENERIC.has(w)));
  const shared = a.filter((w) => b.has(w)).length;
  if (!shared) return 0;
  // "union sq" in "14 st union sq", "rockaway pkwy" in "canarsie rockaway pkwy"
  return shared / Math.max(a.length, b.size);
}

// The [route] bullets and the two station names in a headline, or null when it does not take a stretch out
export function parseSpan(header) {
  const text = String(header ?? '').replace(/\s+/g, ' ');
  for (const re of SPAN) {
    const m = text.match(re);
    if (m) return { from: m[1].replace(/\[|\]/g, '').trim(), to: m[2].replace(/\[|\]/g, '').trim() };
  }
  return null;
}

// The stretch of a route between two stations: { path: [[lat, lng]...], from, to } or null.
// subway is subway.json: { routes: { L: { paths, stops } }, stations: { id: [name, lat, lng] } }
export function findSpan(subway, route, span) {
  const r = subway.routes?.[route];
  if (!r?.stops || !span) return null;
  let best = null;
  r.stops.forEach((ids, k) => {
    const pick = (want) => {
      const w = norm(want);
      let top = { i: -1, s: 0 };
      ids.forEach((id, i) => {
        const s = fit(w, norm(subway.stations[id]?.[0] ?? ''));
        if (s > top.s) top = { i, s };
      });
      return top.s >= 0.5 ? top : null;
    };
    const a = pick(span.from);
    const b = pick(span.to);
    if (!a || !b || a.i === b.i) return;
    const score = a.s + b.s;
    if (!best || score > best.score) best = { k, a: Math.min(a.i, b.i), b: Math.max(a.i, b.i), score };
  });
  if (!best) return null;
  const ids = r.stops[best.k].slice(best.a, best.b + 1);
  const at = (id) => subway.stations[id];
  return {
    path: along(r.paths[best.k], [at(ids[0])[1], at(ids[0])[2]], [at(ids.at(-1))[1], at(ids.at(-1))[2]]),
    from: at(ids[0])[0],
    to: at(ids.at(-1))[0],
    stations: ids.map((id) => [at(id)[1], at(id)[2]]),
  };
}

// the part of a path between the points nearest two places
function along(path, p, q) {
  const near = (x) => {
    let k = 0;
    let d = Infinity;
    path.forEach(([lat, lng], i) => {
      const e = (lat - x[0]) ** 2 + ((lng - x[1]) * 0.76) ** 2;
      if (e < d) { d = e; k = i; }
    });
    return k;
  };
  const i = near(p);
  const j = near(q);
  const part = path.slice(Math.min(i, j), Math.max(i, j) + 1);
  // start and end on the stations themselves
  return i <= j ? [p, ...part, q] : [q, ...part, p];
}
