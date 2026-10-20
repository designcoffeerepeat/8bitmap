// Artwrld New York openings (https://www.artwrld.com/city/new-york/openings).
//
// tools/fetch_artwrld.py reads the openings page, keeps the gallery and museum
// exhibitions that open on the day (with the reception time when one is given)
// and writes public/data/artwrld-events.json.

import { snapshotSource } from './snapshot.js';

export default snapshotSource({
  id: 'artwrld',
  name: 'Artwrld',
  url: 'https://www.artwrld.com/city/new-york/openings',
  file: 'artwrld-events.json',
  optional: true,
});
