// The one event shape the map and the list understand.
// Every source (dummy data today, scraped or API listings later) maps its raw
// records into this shape with normalizeEvent(), so the UI never has to know
// where an event came from.
//
// {
//   id:          string   unique across all sources, e.g. "dummy:msg-knicks"
//   title:       string
//   category:    one of CATEGORIES
//   start:       ISO 8601 string with offset, e.g. "2026-10-16T19:30:00-04:00"
//   end:         ISO 8601 string or null
//   venue: {
//     name:      string
//     address:   string
//     neighborhood: string
//     lat:       number
//     lng:       number
//   }
//   price:       { min: number, max: number, currency: "USD" } or null for free
//   priceUnknown: boolean  true when the listing gives no price
//   allDay:      boolean
//   description: string   short blurb shown in the list
//   details:     string   longer text revealed by "Show more"
//   url:         string   link to the original listing
//   source:      { id: string, name: string, url: string }  the module that loaded it
//   publisher:   { id: string, name: string, url: string }  who listed it; the Sources filter uses this
//   tags:        string[]
// }

export const CATEGORIES = ['music', 'art', 'food', 'comedy', 'sports', 'nightlife', 'community', 'film'];

export const CATEGORY_LABELS = {
  music: 'Music',
  art: 'Art',
  food: 'Food',
  comedy: 'Comedy',
  sports: 'Sports',
  nightlife: 'Nightlife',
  community: 'Community',
  film: 'Film',
};

export function normalizeEvent(raw, source) {
  const category = CATEGORIES.includes(raw.category) ? raw.category : 'community';
  const lat = Number(raw.venue?.lat);
  const lng = Number(raw.venue?.lng);
  if (!raw.title || !raw.start || !Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  return {
    id: `${source.id}:${raw.id ?? slug(raw.title + raw.start)}`,
    title: String(raw.title).trim(),
    category,
    start: raw.start,
    end: raw.end ?? null,
    venue: {
      name: raw.venue.name ?? 'Venue TBA',
      address: raw.venue.address ?? '',
      neighborhood: raw.venue.neighborhood ?? '',
      lat,
      lng,
    },
    price: raw.price ?? null,
    priceUnknown: Boolean(raw.priceUnknown),
    allDay: Boolean(raw.allDay),
    description: raw.description ?? '',
    details: raw.details ?? '',
    url: raw.url ?? source.url,
    source: { id: source.id, name: source.name, url: source.url },
    publisher: raw.publisher?.id ? raw.publisher : { id: source.id, name: source.name, url: source.url },
    tags: raw.tags ?? [],
  };
}

function slug(s) {
  return String(s).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 60);
}
