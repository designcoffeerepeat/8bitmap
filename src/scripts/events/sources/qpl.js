// Queens Public Library programs (https://www.queenslibrary.org/calendar).
//
// tools/fetch_qpl.py reads the library's calendar for the branches it lists
// (the Flushing area to start with), keeps in-person programs on the day and
// writes public/data/qpl-events.json. Branches are placed from their street
// address. Only title, time, branch, program type and a link back are kept.

import { snapshotSource } from './snapshot.js';

export default snapshotSource({
  id: 'qpl',
  name: 'Queens Public Library',
  url: 'https://www.queenslibrary.org/calendar',
  file: 'qpl-events.json',
  optional: true,
});
