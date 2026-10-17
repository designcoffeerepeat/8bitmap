// A source that reads a JSON snapshot written by one of the scripts in tools/.
// Listing sites cannot be called from the browser (no CORS, keys, or bot
// checks), so a fetch script pulls one day, places each event on the map and
// writes public/data/<file>; the page only reads that file.

export function snapshotSource({ id, name, url, file, optional = false, map = (ev) => ev }) {
  return {
    id,
    name,
    url,
    async fetchEvents() {
      const res = await fetch(`/data/${file}`);
      // An optional source has no snapshot until its first scheduled run.
      if (optional && res.status === 404) return [];
      if (!res.ok) throw new Error(`${name} snapshot returned ${res.status}`);
      const snap = await res.json();
      this.snapshot = { date: snap.date, fetchedAt: snap.fetchedAt, unplaced: snap.unplaced?.length ?? 0 };
      return snap.events.map(map);
    },
  };
}
