// Eventbrite (https://www.eventbrite.com), for the NYC organizers in data/eventbrite-organizers.json.
//
// tools/fetch_eventbrite.py reads them from the official Eventbrite API (venues carry coordinates) and
// writes public/data/eventbrite-events.json. It needs an EVENTBRITE_TOKEN, so the file only exists once
// a run has had the key. Eventbrite's API terms ask for the title and a direct link to each event page.

import { snapshotSource } from './snapshot.js';

export default snapshotSource({
  id: 'eventbrite',
  name: 'Eventbrite',
  url: 'https://www.eventbrite.com/d/ny--new-york/events/',
  file: 'eventbrite-events.json',
  optional: true,
});
