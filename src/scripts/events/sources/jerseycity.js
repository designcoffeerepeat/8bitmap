// Jersey City's own calendars: the city's Office of Cultural Affairs calendar, Art House
// Productions, Mana Contemporary and the Historic Downtown SID.
//
// tools/fetch_jerseycity.py reads each one from its own website and writes public/data/jerseycity-events.json.
// Each event names its calendar as its publisher, so each has its own entry in the Sources dropdown.

import { snapshotSource } from './snapshot.js';

export default snapshotSource({
  id: 'jerseycity',
  name: 'Jersey City calendars',
  url: 'https://jerseycityculture.org/events/calendar/',
  file: 'jerseycity-events.json',
  optional: true,
});
