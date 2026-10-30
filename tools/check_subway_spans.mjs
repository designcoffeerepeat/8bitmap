// Tries src/scripts/subway-spans.js on the MTA's live alerts: which headlines take a stretch of line out
// of service, and which stations they were matched to. The aul deploy workflow runs it to show in its log
// how the red stretches on the subway map will come out.
// Usage:  node tools/check_subway_spans.mjs alerts.json   (alerts.json: the MTA's GTFS-RT alerts feed as JSON)
import { readFileSync } from 'node:fs';
import { parseSpan, findSpan } from '../src/scripts/subway-spans.js';

const subway = JSON.parse(readFileSync(new URL('../src/scripts/map/subway.json', import.meta.url)));
const feed = JSON.parse(readFileSync(process.argv[2] ?? 'alerts.json'));
const text = (t) => (t?.translation ?? []).find((x) => x.language === 'en')?.text ?? t?.translation?.[0]?.text ?? '';
let parsed = 0;
let matched = 0;
for (const e of feed.entity ?? []) {
  const header = text(e.alert?.header_text).replace(/\s+/g, ' ');
  const span = parseSpan(header);
  if (!span) continue;
  parsed++;
  const routes = [...new Set((e.alert.informed_entity ?? []).map((x) => x.route_id).filter(Boolean))];
  const found = routes.map((r) => [r, findSpan(subway, r, span)]);
  if (found.some(([, s]) => s)) matched++;
  console.log(`${header.slice(0, 140)}\n  -> ${found.map(([r, s]) => `${r}: ${s ? `${s.from} to ${s.to} (${s.stations.length} stations)` : 'no match'}`).join('; ')}`);
}
console.log(`${parsed} headlines name a stretch out of service; ${matched} matched to stations`);
