// Red Hook's own calendars: Pioneer Works, the Waterfront Museum barge and Brooklyn Community Board 6.
//
// tools/fetch_redhook.py reads each one from its own website and writes public/data/redhook-events.json.
// Each event names its venue (or CB6, for the board's community calendar) as its publisher, so each
// has its own entry in the Sources dropdown.

import { snapshotSource } from './snapshot.js';

export default snapshotSource({
  id: 'redhook',
  name: 'Red Hook calendars',
  url: 'https://pioneerworks.org/calendar',
  file: 'redhook-events.json',
  optional: true,
});
