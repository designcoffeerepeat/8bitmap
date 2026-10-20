// Sources kept off the live site and shown only on dev, until their sites agree to be
// listed (see the legal notes in the project research). Ids match ./sources/*.js; each
// source's snapshots are public/data/<id>-events.json and public/data/tomorrow/<id>-events.json,
// which astro.config.mjs also drops from the live build. The dev workflow builds with
// PUBLIC_SITE=dev to keep them.
export const LIVE_HIDDEN = ['ra', 'skint'];
