# 8-Bit NYC

An interactive 8-bit (voxel, pixelated) map of New York City showing today's events as pins.
Built with [Astro](https://astro.build) and [three.js](https://threejs.org), deployed on Cloudflare Pages.

## Run it locally

You need [Node.js](https://nodejs.org) 22 or newer and [VS Code](https://code.visualstudio.com).

```sh
git clone https://github.com/designcoffeerepeat/8bitmap.git
cd 8bitmap
code .            # open in VS Code; accept the recommended extensions when asked
npm install
npm run dev       # http://localhost:4321
```

In VS Code you can also press F5 (Run and Debug, "Development server") to start the dev server.

| Command           | What it does                                  |
| ----------------- | --------------------------------------------- |
| `npm run dev`     | Local dev server with hot reload              |
| `npm run build`   | Production build into `dist/`                 |
| `npm run preview` | Serve the `dist/` build locally to check it   |

## Deploying

Cloudflare Pages is connected to this GitHub repo. Every push to `main` deploys the live site,
and every pull request gets its own preview URL. Build settings in Cloudflare:

- Framework preset: Astro
- Build command: `npm run build`
- Build output directory: `dist`
- Node version comes from `.node-version` (22)

## Layout

```
src/pages/index.astro             page shell and HUD markup
src/styles/global.css             all styles (arcade look, mobile bottom sheet)
src/scripts/app.js                UI: filters, Today list, event card, map controls
src/scripts/map/geo.js            NYC tile grid: shorelines, parks, bridges, skyline peaks, lat/lng to tile
src/scripts/map/renderer.js       three.js scene: voxel land and buildings, pins, labels, camera, picking
src/scripts/map/palette.js        colours for the city and for event categories
src/scripts/events/schema.js      the one event shape every source maps into
src/scripts/events/index.js       loads all sources, filters to today and the map area, de-duplicates, sorts
src/scripts/events/sources/       one file per event source (dummy.js is sample data, template.js a starting point)
public/                           static files copied as-is (favicon)
```

## Adding a real event source

1. Copy `src/scripts/events/sources/template.js` to a new file and fill in `fetchEvents({ date, bounds })`.
   Return raw records with at least `title`, `start` (ISO time) and `venue.lat` / `venue.lng`.
2. Add the import to `SOURCES` in `src/scripts/events/index.js`.

Most listing sites block browser requests, so real sources should call a small backend that returns JSON.
On Cloudflare Pages that can be a Pages Function in a `functions/` folder at the repo root.
Events outside the map bounds or not on the requested day are dropped automatically,
and the same show listed on several sites is merged by title, venue and start time.

## Tuning the map

- Shorelines, parks and islands are `[lat, lng]` polygons at the top of `geo.js`.
- Skyline heights come from `PEAKS` in `geo.js` (centre, spread, height).
- Tile size is `CELL` in `geo.js`; pixel chunkiness is the PX button (2x, 3x, 4x).
