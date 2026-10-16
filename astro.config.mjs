// @ts-check
import { defineConfig } from 'astro/config';

// Static build: `npm run build` writes plain files to dist/, which Cloudflare Pages serves.
export default defineConfig({
  output: 'static',
  // three.js alone is about 600 kB minified; that is expected for this app.
  vite: { build: { chunkSizeWarningLimit: 900 } },
});
