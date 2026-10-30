// Security line pins over JFK, LaGuardia and Newark: a pin with a shield, which opens a card like an
// event's with each terminal's general and TSA PreCheck wait and a link to the airport's own page.
// The waits are the Port Authority's live checkpoint times, through /api/airport-security in worker/index.js.

const REFRESH = 5 * 60 * 1000;
const AIRPORTS = [
  { code: 'JFK', name: 'JFK Airport', lat: 40.6470, lng: -73.7830, site: 'https://www.jfkairport.com', label: 'JFKAIRPORT.COM' },
  { code: 'LGA', name: 'LaGuardia Airport', lat: 40.7765, lng: -73.8720, site: 'https://www.laguardiaairport.com', label: 'LAGUARDIAAIRPORT.COM' },
  { code: 'EWR', name: 'Newark Liberty Airport', lat: 40.6930, lng: -74.1770, site: 'https://www.newarkairport.com', label: 'NEWARKAIRPORT.COM' },
];
export const SECURITY_COLOR = '#4dd2ff';

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const wait = (m) => (m === null || m === undefined ? '<small>n/a</small>' : m <= 1 ? 'Under 2 min' : `${m} min`);

// onPins(list) gets the pins, each event-shaped with a card() that returns the card's HTML
export function initSecurity(onPins) {
  let data = null;

  function card(a) {
    const info = data?.airports?.[a.code];
    const rows = info?.terminals?.filter((t) => t.general !== null || t.precheck !== null) ?? [];
    const when = data ? new Date(data.updated).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', timeZone: 'America/New_York' }).replace(' ', '') : '';
    const body = rows.length
      ? `<table class="sec-table">
          <thead><tr><th>TERMINAL</th><th>GENERAL</th><th>PRECHECK</th></tr></thead>
          <tbody>${rows.map((t) => `<tr><td>${esc(t.name.replace(/^Terminal\s+/i, ''))}</td><td>${wait(t.general)}</td><td>${wait(t.precheck)}</td></tr>`).join('')}</tbody>
        </table>
        <p class="d-src">Live checkpoint waits from the Port Authority, as of ${when}. Lines can change quickly, so leave extra time.</p>`
      : `<p class="d-blurb">Live security wait times are not available right now. Check the airport's site before you head out, and plan on arriving 2 hours early for domestic flights and 3 for international.</p>`;
    return `
      <p class="d-cat"><i aria-hidden="true"></i>AIRPORT SECURITY</p>
      <h2>${esc(a.name)} security lines</h2>
      ${body}
      <div class="d-actions">
        <a class="btn" href="${a.site}" target="_blank" rel="noopener">WAIT TIMES AT ${a.label}</a>
        <a class="btn" href="https://www.tsa.gov/travel/security-screening" target="_blank" rel="noopener">TSA</a>
      </div>`;
  }

  function title(a) {
    const rows = data?.airports?.[a.code]?.terminals ?? [];
    const waits = rows.map((t) => t.general).filter((m) => m !== null);
    return waits.length ? `${a.code} security: ${Math.min(...waits)} to ${Math.max(...waits)} min` : `${a.code} security lines`;
  }

  function publish() {
    onPins(AIRPORTS.map((a) => ({
      id: `security:${a.code}`,
      title: title(a),
      category: 'security',
      color: SECURITY_COLOR,
      venue: { name: a.name, lat: a.lat, lng: a.lng },
      card: () => card(a),
    })));
  }

  async function load() {
    try {
      const r = await fetch('/api/airport-security');
      if (r.ok) data = await r.json();
    } catch {}
    publish();
  }

  publish();
  load();
  setInterval(load, REFRESH);
}
