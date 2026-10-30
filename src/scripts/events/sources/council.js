// NYC Council hearings and Stated Meetings (https://legistar.council.nyc.gov/Calendar.aspx).
//
// tools/fetch_council.py reads one day from the Council's Legistar Web API and writes
// public/data/council-events.json, placing each meeting at City Hall or 250 Broadway. It needs a
// NYC_COUNCIL_TOKEN, so the file only exists once a run has had the key.

import { snapshotSource } from './snapshot.js';

export default snapshotSource({
  id: 'council',
  name: 'NYC Council',
  url: 'https://legistar.council.nyc.gov/Calendar.aspx',
  file: 'council-events.json',
  optional: true,
});
