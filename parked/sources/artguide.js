// Artforum artguide New York (https://artguide.artforum.com/cities/new-york/).
//
// tools/fetch_artguide.py reads the site's public listings API, keeps New York
// exhibitions whose opening reception is on the day (listings carry coordinates
// and reception hours) and writes public/data/artguide-events.json.

import { snapshotSource } from './snapshot.js';

export default snapshotSource({
  id: 'artguide',
  name: 'Artforum artguide',
  url: 'https://artguide.artforum.com/cities/new-york/',
  file: 'artguide-events.json',
  optional: true,
});
