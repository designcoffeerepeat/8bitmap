// Forest Hills' own calendars: Commonpoint Queens' public events and Rove's Thursday trivia.
//
// tools/fetch_foresthills.py reads each schedule from its own website, places the venue
// from its address and writes public/data/foresthills-events.json. Each event names its venue
// (or Commonpoint Queens) as its publisher, so each has its own entry in the Sources dropdown.

import { snapshotSource } from './snapshot.js';

export default snapshotSource({
  id: 'foresthills',
  name: 'Forest Hills calendars',
  url: 'https://www.commonpoint.org/',
  file: 'foresthills-events.json',
  optional: true,
});
