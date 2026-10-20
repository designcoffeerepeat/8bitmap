// NYC.gov Events Calendar (https://www.nyc.gov/main/events/).
//
// The city's calendar API needs a server-side request (it is keyed and does
// not allow other sites to call it from the browser), and its listings carry
// no coordinates. tools/fetch_nycgov.py pulls one day of events, places each
// one (NYC Parks coordinates, else NYC City Planning GeoSearch) and writes
// public/data/nycgov-events.json (and public/data/tomorrow/ for the next day),
// which this source reads.

export default {
  id: 'nycgov',
  name: 'NYC.gov Events',
  url: 'https://www.nyc.gov/main/events/',

  async fetchEvents({ tomorrow = false } = {}) {
    this.snapshot = null;
    const res = await fetch(`/data/${tomorrow ? 'tomorrow/' : ''}nycgov-events.json`);
    if (tomorrow && res.status === 404) return [];
    if (!res.ok) throw new Error(`NYC.gov snapshot returned ${res.status}`);
    const snap = await res.json();
    this.snapshot = { date: snap.date, fetchedAt: snap.fetchedAt, unplaced: snap.unplaced?.length ?? 0 };
    // NYC.gov republishes NYC Parks listings; show those as their own source.
    return snap.events.map((ev) => (/nycgovparks\.org/.test(ev.website ?? '')
      ? { ...ev, publisher: { id: 'nycparks', name: 'NYC Parks', url: 'https://www.nycgovparks.org/events' } }
      : ev));
  },
};
