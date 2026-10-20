// A source that reads a JSON snapshot written by one of the scripts in tools/.
// Listing sites cannot be called from the browser (no CORS, keys, or bot
// checks), so a fetch script pulls one day, places each event on the map and
// writes public/data/<file>; the page only reads that file. The next NYC day
// is written the same way to public/data/tomorrow/<file>.

export function snapshotSource({ id, name, url, file, optional = false, map = (ev) => ev }) {
  return {
    id,
    name,
    url,
    async fetchEvents({ tomorrow = false } = {}) {
      this.snapshot = null;
      const res = await fetch(`/data/${tomorrow ? 'tomorrow/' : ''}${file}`);
      // An optional source, or any source's tomorrow file, is missing until its first scheduled run.
      if ((optional || tomorrow) && res.status === 404) return [];
      if (!res.ok) throw new Error(`${name} snapshot returned ${res.status}`);
      const snap = await res.json();
      this.snapshot = { date: snap.date, fetchedAt: snap.fetchedAt, unplaced: snap.unplaced?.length ?? 0 };
      return snap.events.map(map);
    },
  };
}
