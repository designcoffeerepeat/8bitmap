// Edge gate in front of the static Astro build (dist/, bound as ASSETS).
// One shared password (SITE_PASSWORD) unlocks the map on both workers:
//   live (SITE=live, the default): visitors without the cookie see the coming soon page at /,
//     with a link to the dev site; every other path asks for the password.
//   dev (SITE=dev, set by the deploy-dev workflow): every path asks for the password.
// This keeps the map private for now; it is a shared password, not per-person accounts.
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

    if (PUBLIC_PATHS.has(path) || readCookie(request, COOKIE) === token) {
      return decorate(await env.ASSETS.fetch(request), { isDev, askConsent });
    }

    if (!isDev && path === '/') {
      return html(comingSoonPage({ devUrl: env.DEV_URL, analytics }));
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
    `From: 8-Bit NYC Website <${FORM_FROM}>`,
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

const BRAND = `<h1><img alt="" src="${PIN}">8-BIT <b>NYC</b></h1>`;

function comingSoonPage({ devUrl, analytics }) {
  const dev = devUrl ? escapeHtml(devUrl) : '/login';
  return `<!doctype html>
<html lang="en">
<head>
${HEAD}
${analytics ? GA : ''}
<title>8-Bit NYC: Coming Soon</title>
<meta name="description" content="An 8-bit voxel map of New York City showing today's events. Coming soon.">
</head>
<body>
<main class="box">
  ${BRAND}
  <h2>COMING SOON<span class="blink" aria-hidden="true">_</span></h2>
  <p>A pixel map of New York City with everything happening today, pinned block by block.</p>
  <a class="btn" href="${dev}">ENTER DEV SITE</a>
  <p class="small">PASSWORD REQUIRED<br>ALREADY HAVE IT? <a href="/login">LOG IN HERE</a></p>
</main>
</body>
</html>`;
}

function loginPage({ next, error = false, isDev, analytics }) {
  return `<!doctype html>
<html lang="en">
<head>
${HEAD}
${analytics ? GA : ''}
<meta name="robots" content="noindex">
<title>8-Bit NYC: Log In</title>
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
