// DICE New York (https://dice.fm/browse/new_york-5bbf4db0f06331478e9b2c59).
//
// tools/fetch_dice.py reads the browse page and each category's first page,
// keeps the day's events, places each venue's address with NYC GeoSearch and
// writes public/data/dice-events.json.

import { snapshotSource } from './snapshot.js';

export default snapshotSource({
  id: 'dice',
  name: 'DICE',
  url: 'https://dice.fm/browse/new_york-5bbf4db0f06331478e9b2c59',
  file: 'dice-events.json',
});
