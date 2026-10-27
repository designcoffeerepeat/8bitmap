// AMC Lincoln Square 13 IMAX (https://www.amctheatres.com/movie-theatres/new-york-city/amc-lincoln-square-13).
//
// tools/fetch_amc.py reads one day of the theatre's showtimes from AMC's official API and
// keeps only the IMAX showings, writing public/data/amc-events.json. It needs an
// AMC_API_KEY, so the file only exists once a run has had the key.

import { snapshotSource } from './snapshot.js';

export default snapshotSource({
  id: 'amc',
  name: 'AMC Lincoln Square IMAX',
  url: 'https://www.amctheatres.com/movie-theatres/new-york-city/amc-lincoln-square-13',
  file: 'amc-events.json',
  optional: true,
});
