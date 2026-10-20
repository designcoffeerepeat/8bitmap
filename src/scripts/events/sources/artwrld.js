// Artwrld New York (https://www.artwrld.com/city/new-york/openings).
//
// tools/fetch_artwrld.py reads the openings, exhibitions and events pages, keeps
// the day's gallery openings, the museum shows on view and the day's art events,
// and writes public/data/artwrld-events.json.

import { snapshotSource } from './snapshot.js';

export default snapshotSource({
  id: 'artwrld',
  name: 'Artwrld',
  url: 'https://www.artwrld.com/city/new-york/openings',
  file: 'artwrld-events.json',
  optional: true,
});
