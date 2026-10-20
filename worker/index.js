// Edge gate in front of the static Astro build (dist/, bound as ASSETS).
// One shared password (SITE_PASSWORD) unlocks the map on both workers:
//   live (SITE=live, the default): visitors without the cookie see the coming soon page at /,
//     with a link to log in; every other path asks for the password.
//   dev (SITE=dev, set by the deploy-dev workflow): every path asks for the password.
// This keeps the map private for now; it is a shared password, not per-person accounts.

const COOKIE = '8bm_auth';
const MAX_AGE = 60 * 60 * 24 * 30; // stay logged in for 30 days
const PUBLIC_PATHS = new Set(['/favicon.svg', '/robots.txt']);

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const path = url.pathname;
    const isDev = env.SITE === 'dev';
    const token = await tokenFor(env.SITE_PASSWORD || '');

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
      return html(loginPage({ next, error: true, isDev }), 401);
    }

    if (path === '/login') {
      return html(loginPage({ next: safeNext(url.searchParams.get('next')), isDev }));
    }

    if (path === '/logout') {
      return new Response(null, {
        status: 303,
        headers: { Location: '/', 'Set-Cookie': `${COOKIE}=; Path=/; Max-Age=0; HttpOnly; Secure; SameSite=Lax` },
      });
    }

    if (PUBLIC_PATHS.has(path) || readCookie(request, COOKIE) === token) {
      const res = await env.ASSETS.fetch(request);
      return isDev ? markDev(res) : res;
    }

    if (!isDev && path === '/') {
      return html(comingSoonPage());
    }

    if (request.method === 'GET' || request.method === 'HEAD') {
      return Response.redirect(`${url.origin}/login?next=${encodeURIComponent(path + url.search)}`, 302);
    }
    return new Response('Password required', { status: 401 });
  },
};

// On dev, "DEV" goes into the page title and the brand box so the two sites are easy to tell apart.
function markDev(res) {
  if (!(res.headers.get('Content-Type') || '').includes('text/html')) return res;
  return new HTMLRewriter()
    .on('title', { element: (el) => el.append(' DEV') })
    .on('.brand h1', { element: (el) => el.append('<em class="dev-tag">DEV</em>', { html: true }) })
    .transform(res);
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

// Same Google Analytics tag as src/pages/index.astro.
const HEAD = `<meta charset="utf-8">
<!-- Google Analytics -->
<script async src="https://www.googletagmanager.com/gtag/js?id=G-TRZEWQT50E"></script>
<script>
  window.dataLayer = window.dataLayer || [];
  function gtag(){dataLayer.push(arguments);}
  gtag('js', new Date());
  gtag('config', 'G-TRZEWQT50E');
</script>
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

function comingSoonPage() {
  return `<!doctype html>
<html lang="en">
<head>
${HEAD}
<title>8-Bit NYC: Coming Soon</title>
<meta name="description" content="An 8-bit voxel map of New York City showing today's events. Coming soon.">
</head>
<body>
<main class="box">
  ${BRAND}
  <h2>COMING SOON<span class="blink" aria-hidden="true">_</span></h2>
  <p>A pixel map of New York City with everything happening today, pinned block by block.</p>
  <p class="small">HAVE THE PASSWORD? <a href="/login">LOG IN HERE</a></p>
</main>
</body>
</html>`;
}

function loginPage({ next, error = false, isDev }) {
  return `<!doctype html>
<html lang="en">
<head>
${HEAD}
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
