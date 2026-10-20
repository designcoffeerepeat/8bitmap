// A source that reads a JSON snapshot written by one of the scripts in tools/.
// Listing sites cannot be called from the browser (no CORS, keys, or bot
// checks), so a fetch script pulls one day, places each event on the map and
// writes public/data/<file>; the page only reads that file.
//
// A `listingOnly` source may only be shown as title, time and a link back to
// the listing, so anything else an older snapshot carries is dropped here.

export function snapshotSource({ id, name, url, file, optional = false, listingOnly = false, map = (ev) => ev }) {
  const trim = listingOnly ? (ev) => ({ ...ev, price: null, priceUnknown: false, description: '', details: '', tags: [] }) : (ev) => ev;
  return {
    id,
    name,
    url,
    listingOnly,
    async fetchEvents() {
      const res = await fetch(`/data/${file}`);
      // An optional source has no snapshot until its first scheduled run.
      if (optional && res.status === 404) return [];
      if (!res.ok) throw new Error(`${name} snapshot returned ${res.status}`);
      const snap = await res.json();
      this.snapshot = { date: snap.date, fetchedAt: snap.fetchedAt, unplaced: snap.unplaced?.length ?? 0 };
      return snap.events.map((ev) => trim(map(ev)));
    },
  };
}
