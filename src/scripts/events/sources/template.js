// Template for a real listings source. Copy this file, fill in fetchEvents,
// and add the import to SOURCES in ../index.js.
//
// Most listing sites block direct browser requests (CORS), so in production
// each source should call a small backend endpoint or scheduled scraper that
// returns JSON. The browser only ever sees the cleaned-up records.

export default {
  id: 'example',
  name: 'Example Listings',
  url: 'https://example.com/events',

  // Return raw records; normalizeEvent() in ../schema.js turns them into the
  // shared event shape. Only `title`, `start` and `venue.lat/lng` are required.
  async fetchEvents({ date }) {
    const day = date.toISOString().slice(0, 10);
    const res = await fetch(`/api/sources/example?date=${day}`);
    if (!res.ok) throw new Error(`Example Listings returned ${res.status}`);
    const rows = await res.json();
    return rows.map((row) => ({
      id: row.id,
      title: row.name,
      category: mapCategory(row.genre),
      start: row.starts_at,
      end: row.ends_at,
      venue: {
        name: row.venue_name,
        address: row.venue_address,
        neighborhood: row.neighborhood,
        lat: row.latitude,
        lng: row.longitude,
      },
      price: row.free ? null : { min: row.price_low, max: row.price_high, currency: 'USD' },
      description: row.summary,
      details: row.body,
      url: row.link,
      tags: row.tags ?? [],
    }));
  },
};

function mapCategory(genre = '') {
  const g = genre.toLowerCase();
  if (/(concert|music|dj|jazz)/.test(g)) return 'music';
  if (/(gallery|museum|art)/.test(g)) return 'art';
  if (/(food|market|tasting)/.test(g)) return 'food';
  if (/(comedy|stand-?up)/.test(g)) return 'comedy';
  if (/(sport|game)/.test(g)) return 'sports';
  if (/(club|party|night)/.test(g)) return 'nightlife';
  if (/(film|movie|screening)/.test(g)) return 'film';
  return 'community';
}
