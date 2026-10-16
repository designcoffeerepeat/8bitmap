// NYC.gov Events Calendar (https://www.nyc.gov/main/events/).
//
// The city's calendar API needs a server-side request (it is keyed and does
// not allow other sites to call it from the browser), and its listings carry
// no coordinates. tools/fetch_nycgov.py pulls one day of events, places each
// one (NYC Parks coordinates, else NYC City Planning GeoSearch) and writes
// public/data/nycgov-events.json, which this source reads.

export default {
  id: 'nycgov',
  name: 'NYC.gov Events',
  url: 'https://www.nyc.gov/main/events/',

  async fetchEvents() {
    const res = await fetch('/data/nycgov-events.json');
    if (!res.ok) throw new Error(`NYC.gov snapshot returned ${res.status}`);
    const snap = await res.json();
    this.snapshot = { date: snap.date, fetchedAt: snap.fetchedAt, unplaced: snap.unplaced?.length ?? 0 };
    return snap.events;
  },
};
