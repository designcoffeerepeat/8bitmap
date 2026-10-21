// @ts-check
import { defineConfig } from 'astro/config';
import { rm } from 'node:fs/promises';
import { LIVE_HIDDEN } from './src/scripts/events/live.js';

// Live builds also drop the snapshots of sources hidden on live, so they are not served at all.
// The dev workflow sets PUBLIC_SITE=dev and keeps every file.
const dropLiveHidden = {
  name: 'drop-live-hidden-sources',
  hooks: {
    'astro:build:done': async ({ dir }) => {
      if (process.env.PUBLIC_SITE === 'dev') return;
      for (const id of LIVE_HIDDEN) {
        for (const day of ['', 'tomorrow/']) await rm(new URL(`data/${day}${id}-events.json`, dir), { force: true });
      }
    },
  },
};

// Static build: `npm run build` writes plain files to dist/, which Cloudflare Pages serves.
export default defineConfig({
  output: 'static',
  integrations: [dropLiveHidden],
  // three.js alone is about 600 kB minified; that is expected for this app.
  vite: { build: { chunkSizeWarningLimit: 900 } },
});
