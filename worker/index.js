// Edge worker in front of the static Astro build (dist/, bound as ASSETS).
//   live (SITE=live, the default): the map is open to everyone.
//   dev (SITE=dev, set by the deploy-dev workflow): every path asks for the shared password (SITE_PASSWORD).
// The dev password keeps unreleased changes private; it is a shared password, not per-person accounts.
// It also handles the contact form (POST /api/contact, open to everyone) and marks pages for
// visitors who need to be asked about cookies (EU, EEA, UK, Switzerland) so analytics waits for a yes.

import { EmailMessage } from 'cloudflare:email';

const COOKIE = '8bm_auth';
const MAX_AGE = 60 * 60 * 24 * 30; // stay logged in for 30 days
const PUBLIC_PATHS = new Set(['/favicon.svg', '/robots.txt']);

// Countries where analytics cookies need consent first: the EU, the rest of the EEA, the UK and Switzerland.
const CONSENT_COUNTRIES = new Set([
  'AT', 'BE', 'BG', 'HR', 'CY', 'CZ', 'DK', 'EE', 'FI', 'FR', 'DE', 'GR', 'HU', 'IE', 'IT', 'LV', 'LT', 'LU',
  'MT', 'NL', 'PL', 'PT', 'RO', 'SK', 'SI', 'ES', 'SE', 'IS', 'LI', 'NO', 'GB', 'CH',
]);

// Contact form topics: Ad/Event Inquiry is for sales@, the rest for info@. Cloudflare can only send a
// Worker's email to verified destination addresses, so each copy goes straight to the inboxes those
// two addresses forward to (keep these in step with email-worker/index.js), marked with the address it was for.
const INBOXES = ['8bitnyc@proton.me', 'martin+8bitnyc@3h-i.com', 'peter+8bitnyc@3h-i.com'];
const TOPICS = {
  general: { label: 'General Questions', to: 'info@8bit.nyc', inboxes: INBOXES },
  comments: { label: 'Comments', to: 'info@8bit.nyc', inboxes: INBOXES },
  ad: { label: 'Ad/Event Inquiry', to: 'sales@8bit.nyc', inboxes: INBOXES },
};
const FORM_FROM = 'website@8bit.nyc';

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const path = url.pathname;
    const isDev = env.SITE === 'dev';
    const token = await tokenFor(env.SITE_PASSWORD || '');
    const askConsent = needsConsent(request);
    const analytics = !askConsent || readCookie(request, '8bm_consent') === 'yes';

    if (path === '/api/contact') {
      return request.method === 'POST' ? contact(request, env, url) : json({ error: 'Use POST.' }, 405);
    }
    if (path === '/api/subway-alerts') return subwayAlerts();
    if (path === '/api/weather') return weather();
    if (path === '/api/airport-security') return airportSecurity();

    // Live is public, so its old login and logout links just go to the map.
    if (!isDev && (path === '/login' || path === '/logout')) {
      return Response.redirect(`${url.origin}/`, 302);
    }

    if (path === '/login' && request.method === 'POST') {
      const form = await request.formData();
      const next = safeNext(form.get('next'));
      if (env.SITE_PASSWORD && form.get('password') === env.SITE_PASSWORD) {
        return new Response(null, {
          status: 303,
          headers: {
            Location: next,
            'Set-Cookie': `${COOKIE}=${token}; Path=/; Max-Age=${MAX_AGE}; HttpOnly; Secure; SameSite=Lax`,
          },
        });
      }
      return html(loginPage({ next, error: true, isDev, analytics }), 401);
    }

    if (path === '/login') {
      return html(loginPage({ next: safeNext(url.searchParams.get('next')), isDev, analytics }));
    }

    if (path === '/logout') {
      return new Response(null, {
        status: 303,
        headers: { Location: '/', 'Set-Cookie': `${COOKIE}=; Path=/; Max-Age=0; HttpOnly; Secure; SameSite=Lax` },
      });
    }

    if (!isDev || PUBLIC_PATHS.has(path) || readCookie(request, COOKIE) === token) {
      return decorate(await env.ASSETS.fetch(request), { isDev, askConsent });
    }

    if (request.method === 'GET' || request.method === 'HEAD') {
      return Response.redirect(`${url.origin}/login?next=${encodeURIComponent(path + url.search)}`, 302);
    }
    return new Response('Password required', { status: 401 });
  },
};

// HTML pages get data-consent="required" on <html> for visitors who must be asked about cookies,
// which keeps Google Analytics off until they accept (see src/pages/index.astro).
// On dev, "DEV" also goes into the page title and the brand box so the two sites are easy to tell apart.
function decorate(res, { isDev, askConsent }) {
  if (!(res.headers.get('Content-Type') || '').includes('text/html') || (!isDev && !askConsent)) return res;
  let rewriter = new HTMLRewriter();
  if (askConsent) rewriter = rewriter.on('html', { element: (el) => el.setAttribute('data-consent', 'required') });
  if (isDev) {
    rewriter = rewriter
      .on('title', { element: (el) => el.append(' DEV') })
      .on('.brand h1', { element: (el) => el.append('<em class="dev-tag">DEV</em>', { html: true }) });
  }
  const out = rewriter.transform(res);
  // the page differs by country now, so no shared caches
  const headers = new Headers(out.headers);
  headers.set('Cache-Control', 'private, no-cache');
  return new Response(out.body, { status: out.status, statusText: out.statusText, headers });
}

function needsConsent(request) {
  const country = request.cf?.country || request.headers.get('CF-IPCountry') || '';
  return CONSENT_COUNTRIES.has(country.toUpperCase());
}

// POST /api/contact with JSON { topic, name, email, message, website }; website is a honeypot.
async function contact(request, env, url) {
  const origin = request.headers.get('Origin');
  if (origin && origin !== url.origin) return json({ error: 'Not allowed.' }, 403);
  let data;
  try {
    data = await request.json();
  } catch {
    return json({ error: 'Something went wrong. Please try again.' }, 400);
  }
  const field = (key, max) => String(data?.[key] ?? '').trim().slice(0, max);
  const topic = TOPICS[field('topic', 20)] || TOPICS.general;
  const name = field('name', 100).replace(/[\r\n]+/g, ' ');
  const email = field('email', 200);
  const message = field('message', 5000);
  if (field('website', 200)) return json({ ok: true }); // a bot filled in the hidden field: pretend it worked
  if (!name || !message) return json({ error: 'Please fill in your name and a message.' }, 400);
  if (!/^[^\s@<>",;]+@[^\s@<>",;]+\.[^\s@<>",;]+$/.test(email)) return json({ error: 'Please check your email address.' }, 400);
  if (!env.MAIL) return json({ error: 'The contact form is not set up yet.' }, 503);

  const subject = `[${topic.to}] ${topic.label} from ${name}`;
  const body = [
    `Topic: ${topic.label}`,
    `For: ${topic.to}`,
    `Name: ${name}`,
    `Email: ${email}`,
    `Sent from: ${url.host}`,
    '',
    message,
    '',
    '--',
    `Sent with the contact form on ${url.host}. Reply to this email to answer ${name}.`,
  ].join('\r\n');

  const results = await Promise.allSettled(topic.inboxes.map((inbox) =>
    env.MAIL.send(new EmailMessage(FORM_FROM, inbox, mime({ to: inbox, replyTo: email, subject, body, route: topic.to })))));
  results.forEach((r, i) => r.status === 'rejected' && console.error(`Contact mail to ${topic.inboxes[i]} failed:`, r.reason));
  if (!results.some((r) => r.status === 'fulfilled')) {
    return json({ error: 'Your message could not be sent right now.' }, 502);
  }
  return json({ ok: true });
}

function mime({ to, replyTo, subject, body, route }) {
  return [
    `From: 8bit.nyc Website <${FORM_FROM}>`,
    `To: ${to}`,
    `Reply-To: ${replyTo}`,
    `Subject: ${encodeHeader(subject)}`,
    `Date: ${new Date().toUTCString()}`,
    `Message-ID: <${crypto.randomUUID()}@8bit.nyc>`,
    `X-8bit-Route: ${route}`,
    'MIME-Version: 1.0',
    'Content-Type: text/plain; charset=utf-8',
    'Content-Transfer-Encoding: base64',
    '',
    base64(body).replace(/.{76}/g, '$&\r\n'),
  ].join('\r\n');
}

function encodeHeader(text) {
  return /^[\x20-\x7e]*$/.test(text) ? text : `=?UTF-8?B?${base64(text)}?=`;
}

function base64(text) {
  let bin = '';
  for (const b of new TextEncoder().encode(text)) bin += String.fromCharCode(b);
  return btoa(bin);
}

// ---- subway alerts ----------------------------------------------------------------------------
// The MTA's live subway alerts feed (GTFS-realtime as JSON, no key needed), boiled down to what the
// map's Subway Alerts menu shows: which lines each alert affects and its headline, split into
// active alerts and delays (in effect now) and planned work (in effect now or within SOON).
// Kept for CACHE_SECONDS at the edge so visitors do not each ask the MTA.
const MTA_ALERTS = 'https://api-endpoint.mta.info/Dataservice/mtagtfsfeeds/camsys%2Fsubway-alerts.json';
const CACHE_SECONDS = 120;
const SOON = 36 * 3600; // planned work starting by the end of tomorrow

async function subwayAlerts() {
  const cache = caches.default;
  const key = new Request('https://cache.8bit.nyc/api/subway-alerts');
  const hit = await cache.match(key);
  if (hit) return hit;
  let feed;
  try {
    const r = await fetch(MTA_ALERTS, { headers: { Accept: 'application/json' } });
    if (!r.ok) throw new Error(`MTA answered ${r.status}`);
    feed = await r.json();
  } catch (e) {
    return json({ error: 'Subway alerts are not available right now.', detail: String(e.message || e) }, 502);
  }
  const res = json(boilAlerts(feed, Math.floor(Date.now() / 1000)));
  res.headers.set('Cache-Control', `public, max-age=${CACHE_SECONDS}`);
  await cache.put(key, res.clone());
  return res;
}

function boilAlerts(feed, now) {
  const text = (t) => {
    const tr = t?.translation ?? [];
    return (tr.find((x) => x.language === 'en') ?? tr.find((x) => !x.language) ?? tr[0])?.text?.trim() ?? '';
  };
  const out = { updated: now, active: [], planned: [] };
  for (const e of feed?.entity ?? []) {
    const a = e.alert;
    if (!a) continue;
    const routes = [...new Set((a.informed_entity ?? []).map((x) => x.route_id).filter(Boolean))];
    if (!routes.length) continue;
    const mercury = a['transit_realtime.mercury_alert'] ?? a.mercury_alert ?? {};
    const type = mercury.alert_type ?? '';
    const planned = /planned/i.test(type);
    const periods = (a.active_period ?? []).map((p) => [Number(p.start) || 0, Number(p.end) || Infinity]);
    const live = !periods.length || periods.some(([s, f]) => s <= now && now < f);
    const soon = periods.some(([s, f]) => s < now + SOON && now < f);
    if (planned ? !(live || soon) : !live) continue;
    const start = periods.filter(([, f]) => now < f).map(([s]) => s).sort((x, y) => x - y)[0] ?? null;
    (planned ? out.planned : out.active).push({ id: e.id, routes, type, header: text(a.header_text), live, start });
  }
  for (const k of ['active', 'planned']) out[k].sort((x, y) => (x.start ?? 0) - (y.start ?? 0));
  return out;
}

// ---- weather ------------------------------------------------------------------------------------
// The National Weather Service's hourly forecast for Central Park (public domain, no key), boiled down
// for the weather button: now, the rest of today, tomorrow, and whether to bring an umbrella.
// Kept for WEATHER_SECONDS at the edge.
const NWS_POINT = 'https://api.weather.gov/points/40.7829,-73.9654';
const NWS_HEADERS = { 'User-Agent': '8bit.nyc (info@8bit.nyc)', Accept: 'application/geo+json' };
const WEATHER_SECONDS = 900;

async function weather() {
  const cache = caches.default;
  const key = new Request('https://cache.8bit.nyc/api/weather');
  const hit = await cache.match(key);
  if (hit) return hit;
  let periods;
  try {
    const point = await (await fetch(NWS_POINT, { headers: NWS_HEADERS })).json();
    const r = await fetch(point.properties.forecastHourly, { headers: NWS_HEADERS });
    if (!r.ok) throw new Error(`NWS answered ${r.status}`);
    periods = (await r.json()).properties.periods;
  } catch (e) {
    return json({ error: 'The weather is not available right now.', detail: String(e.message || e) }, 502);
  }
  const res = json(boilWeather(periods, Date.now()));
  res.headers.set('Cache-Control', `public, max-age=${WEATHER_SECONDS}`);
  await cache.put(key, res.clone());
  return res;
}

function boilWeather(periods, now) {
  const hours = periods
    .filter((p) => Date.parse(p.endTime) > now)
    .map((p) => ({
      day: p.startTime.slice(0, 10), // the NY date, since NWS times carry the local offset
      hour: Number(p.startTime.slice(11, 13)),
      temp: p.temperature,
      pop: p.probabilityOfPrecipitation?.value ?? 0,
      short: p.shortForecast,
      isDay: p.isDaytime,
      wind: p.windSpeed,
    }));
  const cur = hours[0];
  const summary = (day) => {
    const h = hours.filter((x) => x.day === day);
    if (!h.length) return null;
    const wettest = h.reduce((a, b) => (b.pop > a.pop ? b : a));
    return {
      day,
      high: Math.max(...h.map((x) => x.temp)),
      low: Math.min(...h.map((x) => x.temp)),
      pop: wettest.pop,
      wetHour: wettest.pop >= 20 ? wettest.hour : null,
      short: (h.find((x) => x.hour === 14) ?? h[Math.floor(h.length / 2)]).short,
    };
  };
  const today = summary(cur.day);
  const next = hours.find((x) => x.day !== cur.day);
  const tomorrow = next ? summary(next.day) : null;
  const umbrella = today.pop >= 40 ? 'yes' : today.pop >= 20 ? 'maybe' : 'no';
  return { updated: now, now: cur, today, tomorrow, umbrella };
}

// ---- airport security lines --------------------------------------------------------------------
// The Port Authority's live security checkpoint wait times for JFK, LaGuardia and Newark (the feed behind
// the wait times on jfkairport.com, laguardiaairport.com and newarkairport.com), boiled down to each
// terminal's general and TSA PreCheck lines. Kept for SECURITY_SECONDS at the edge.
const SECURITY_FEED = 'https://avi-prod-mpp-webapp-api.azurewebsites.net/api/v1/SecurityWaitTimesPoints/';
const AIRPORT_SITES = { JFK: 'https://www.jfkairport.com', LGA: 'https://www.laguardiaairport.com', EWR: 'https://www.newarkairport.com' };
const SECURITY_SECONDS = 300;

async function airportSecurity() {
  const cache = caches.default;
  const key = new Request('https://cache.8bit.nyc/api/airport-security');
  const hit = await cache.match(key);
  if (hit) return hit;
  const out = { updated: Date.now(), airports: {} };
  await Promise.all(Object.entries(AIRPORT_SITES).map(async ([code, site]) => {
    try {
      const r = await fetch(SECURITY_FEED + code, { headers: { Accept: 'application/json', Referer: `${site}/`, Origin: site, 'User-Agent': '8bit.nyc (info@8bit.nyc)' } });
      if (!r.ok) throw new Error(`${code} answered ${r.status}`);
      out.airports[code] = boilSecurity(await r.json());
    } catch (e) {
      out.airports[code] = { error: String(e.message || e), terminals: [] };
    }
  }));
  const res = json(out);
  res.headers.set('Cache-Control', `public, max-age=${SECURITY_SECONDS}`);
  await cache.put(key, res.clone());
  return res;
}

// [{ terminal, checkpoint, queueType: 'Reg' | 'TSAPre', timeInMinutes, queueOpen, ... }] becomes
// { terminals: [{ name, general, precheck }] } with minutes, or null where a line is closed or not reported
function boilSecurity(list) {
  const rows = Array.isArray(list) ? list : list?.data ?? list?.items ?? [];
  const terms = new Map();
  for (const x of rows) {
    const t = String(x.terminal ?? x.Terminal ?? x.title ?? '').trim();
    if (!t) continue;
    const name = /^\w{1,2}$/.test(t) ? `Terminal ${t.toUpperCase()}` : t;
    const pre = /pre/i.test(String(x.queueType ?? x.QueueType ?? x.type ?? ''));
    const open = (x.queueOpen ?? x.isWaitTimeAvailable ?? true) !== false && !/closed/i.test(String(x.status ?? ''));
    const raw = x.timeInMinutes ?? x.waitTimeMinutes ?? x.waitTime ?? (x.timeInSeconds != null ? Number(x.timeInSeconds) / 60 : null);
    const min = open && raw !== null && raw !== '' && Number.isFinite(Number(raw)) ? Math.round(Number(raw)) : null;
    const row = terms.get(name) ?? { name, general: null, precheck: null };
    const k = pre ? 'precheck' : 'general';
    // a terminal with more than one checkpoint shows its shortest line
    if (min !== null) row[k] = row[k] === null ? min : Math.min(row[k], min);
    terms.set(name, row);
  }
  return { terminals: [...terms.values()].sort((a, b) => a.name.localeCompare(b.name, 'en', { numeric: true })) };
}

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' },
  });
}

// The cookie holds a hash of the password, so changing SITE_PASSWORD logs everyone out.
async function tokenFor(password) {
  const bytes = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(`8bitmap:${password}`));
  return [...new Uint8Array(bytes)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

function readCookie(request, name) {
  const header = request.headers.get('Cookie') || '';
  for (const part of header.split(';')) {
    const [key, ...rest] = part.trim().split('=');
    if (key === name) return rest.join('=');
  }
  return null;
}

// Only same-site paths, so the login form can't be used to bounce people elsewhere.
function safeNext(value) {
  const next = typeof value === 'string' ? value : '';
  return next.startsWith('/') && !next.startsWith('//') ? next : '/';
}

function escapeHtml(text) {
  return String(text).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
}

function html(body, status = 200) {
  return new Response(body, {
    status,
    headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' },
  });
}

const PIN = `data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 13 19' shape-rendering='crispEdges'%3E%3Cpath fill='%23ed1c24' d='M4 0h5v1h2v1h1v2h1v5h-1v2h-1v1h-1v2H9v2H8v2H7v1H6v-1H5v-2H4v-2H3v-2H2v-1H1V9H0V4h1V2h1V1h2z'/%3E%3Cpath fill='%23ffffff' d='M5 4h3v1h1v3H8v1H5V8H4V5h1z'/%3E%3C/svg%3E`;

// Same Google Analytics tag as src/pages/index.astro, left out for visitors who have not accepted cookies.
const GA = `<!-- Google Analytics -->
<script async src="https://www.googletagmanager.com/gtag/js?id=G-TRZEWQT50E"></script>
<script>
  window.dataLayer = window.dataLayer || [];
  function gtag(){dataLayer.push(arguments);}
  gtag('js', new Date());
  gtag('config', 'G-TRZEWQT50E');
</script>`;

const HEAD = `<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<link rel="icon" type="image/svg+xml" href="/favicon.svg">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Press+Start+2P&family=VT323&display=swap">
<style>
  :root {
    --night: #1d2340; --night-2: #2b335e; --ink: #f4f1ff; --dim: #a9aed8;
    --frame: #ffffff; --coin: #ffd23f; --pin: #ed1c24;
    --font-pixel: "Press Start 2P", "Courier New", monospace;
    --font-body: "VT323", "Courier New", monospace;
    color-scheme: dark;
  }
  *, *::before, *::after { box-sizing: border-box; }
  html, body { min-height: 100%; margin: 0; }
  body {
    background: var(--night);
    background-image: radial-gradient(var(--night-2) 2px, transparent 2px);
    background-size: 24px 24px;
    color: var(--ink); font-family: var(--font-body); font-size: 22px; line-height: 1.2;
    -webkit-font-smoothing: none;
    min-height: 100vh; display: grid; place-items: center; padding: 24px 16px;
  }
  :focus-visible { outline: 3px solid var(--coin); outline-offset: 3px; }
  .box {
    background: var(--night); border: 3px solid var(--frame);
    box-shadow: 0 0 0 3px var(--night), 8px 8px 0 3px rgba(0,0,0,.45);
    width: min(520px, 100%); padding: 32px 28px 28px; text-align: center;
    display: grid; gap: 22px; justify-items: center;
  }
  h1 { margin: 0; font: 22px/1 var(--font-pixel); letter-spacing: 1px; display: flex; align-items: center; gap: 12px; }
  h1 img { width: 19px; height: 28px; image-rendering: pixelated; }
  h1 b { color: var(--coin); font-weight: 400; }
  h2 { margin: 0; font: 16px/1.5 var(--font-pixel); color: var(--coin); letter-spacing: 2px; }
  p { margin: 0; color: var(--dim); max-width: 34ch; }
  .btn {
    display: inline-block; font: 12px/1 var(--font-pixel); letter-spacing: 1px; text-decoration: none;
    background: var(--coin); color: var(--night); border: 3px solid var(--frame); padding: 14px 18px;
    box-shadow: 4px 4px 0 0 rgba(0,0,0,.5); cursor: pointer;
  }
  .btn:hover { background: var(--frame); }
  .btn:active { transform: translate(2px, 2px); box-shadow: 2px 2px 0 0 rgba(0,0,0,.5); }
  .small { font: 9px/1.6 var(--font-pixel); color: var(--dim); letter-spacing: 1px; }
  .small a { color: var(--ink); }
  .blink { animation: blink 1s steps(1) infinite; }
  @keyframes blink { 50% { opacity: 0; } }
  @media (prefers-reduced-motion: reduce) { .blink { animation: none; } }
  form { display: grid; gap: 14px; width: 100%; justify-items: center; }
  label { font: 10px/1 var(--font-pixel); letter-spacing: 1px; color: var(--dim); }
  input {
    width: min(280px, 100%); font: 26px/1 var(--font-body); color: var(--ink); text-align: center;
    background: var(--night-2); border: 3px solid var(--frame); padding: 8px 10px; border-radius: 0;
  }
  .error { font: 10px/1.6 var(--font-pixel); color: var(--pin); }
</style>`;

const BRAND = `<h1><img alt="" src="${PIN}"><span>8bit<b>.nyc</b></span></h1>`;

function loginPage({ next, error = false, isDev, analytics }) {
  return `<!doctype html>
<html lang="en">
<head>
${HEAD}
${analytics ? GA : ''}
<meta name="robots" content="noindex">
<title>8bit.nyc: Log In</title>
</head>
<body>
<main class="box">
  ${BRAND}
  <h2>${isDev ? 'DEV SITE' : 'PREVIEW'}</h2>
  <form method="post" action="/login">
    <input type="hidden" name="next" value="${escapeHtml(next)}">
    <label for="password">ENTER PASSWORD</label>
    <input id="password" name="password" type="password" autocomplete="current-password" required autofocus>
    ${error ? '<p class="error" role="alert">WRONG PASSWORD. TRY AGAIN.</p>' : ''}
    <button class="btn" type="submit">PRESS START</button>
  </form>
  ${isDev ? '' : '<p class="small"><a href="/">BACK</a></p>'}
</main>
</body>
</html>`;
}
