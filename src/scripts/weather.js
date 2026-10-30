// The weather button at the bottom left of the map: a pixel icon for the conditions now and the
// temperature. Tapping it opens a card with the chance of rain, whether to bring an umbrella,
// tomorrow's forecast and the WINTER MODE switch (snow on the streets and buildings, see
// setWinter in renderer.js). The forecast is the National Weather Service's for Central Park,
// through /api/weather in worker/index.js.

const FORECAST_PAGE = 'https://forecast.weather.gov/MapClick.php?lat=40.7829&lon=-73.9654';
const WINTER_KEY = '8bm_winter';
const REFRESH = 15 * 60 * 1000;

// 12 x 12 icons; each letter is a colour
const INK = { Y: '#ffd23f', O: '#ff9f1c', W: '#ffffff', G: '#c9d2e3', D: '#8c8fa3', B: '#4dd2ff', M: '#e8eef9' };
const ICONS = {
  sun: ['.....Y......', '..Y..Y..Y...', '...Y...Y....', '.....YY.....', '....YYYY....', 'YY.YYYYYY.YY', '....YYYY....', '.....YY.....', '...Y...Y....', '..Y..Y..Y...', '.....Y......', '............'],
  moon: ['............', '....MMM.....', '...MMM......', '..MMM.......', '..MMM.......', '..MMM.......', '..MMMM......', '...MMMM..M..', '....MMMMMM..', '.....MMMM...', '............', '............'],
  partly: ['..Y.........', 'Y.YY.Y......', '.YYYY.......', 'YYYYY.......', '.YYY.WWW....', '...WWWWWW...', '..WWWWWWWW..', '.WWWWWWWWWW.', '.GGGGGGGGGG.', '............', '............', '............'],
  cloud: ['............', '............', '....WWW.....', '...WWWWW....', '..WWWWWWWW..', '.WWWWWWWWWW.', 'WWWWWWWWWWWW', 'WWWWWWWWWWWW', '.GGGGGGGGGG.', '............', '............', '............'],
  rain: ['....GGG.....', '...GGGGG....', '..GGGGGGGG..', '.GGGGGGGGGG.', 'GGGGGGGGGGGG', '.DDDDDDDDDD.', '............', '.B..B..B..B.', 'B..B..B..B..', '............', '.B..B..B..B.', 'B..B..B..B..'],
  snow: ['....GGG.....', '...GGGGG....', '..GGGGGGGG..', '.GGGGGGGGGG.', 'GGGGGGGGGGGG', '.DDDDDDDDDD.', '............', '.W...W...W..', 'WWW.WWW.WWW.', '.W...W...W..', '...W...W....', '..WWW.WWW...'],
  storm: ['....DDD.....', '...DDDDD....', '..DDDDDDDD..', '.DDDDDDDDDD.', 'DDDDDDDDDDDD', '.....YY.....', '....YY......', '...YYYYY....', '.....YY.....', '....YY......', '...Y........', '............'],
  fog: ['............', '..GGGGGGGG..', '............', 'GGGGGGGGGG..', '............', '..GGGGGGGGGG', '............', 'GGGGGGGGGG..', '............', '..GGGGGGGG..', '............', '............'],
};

function kindOf(short = '', isDay = true) {
  const s = short.toLowerCase();
  if (/thunder/.test(s)) return 'storm';
  if (/snow|flurr|sleet|ice|wintry/.test(s)) return 'snow';
  if (/rain|shower|drizzle/.test(s)) return 'rain';
  if (/fog|haze|mist|smoke/.test(s)) return 'fog';
  if (/partly|mostly sunny|mostly clear/.test(s)) return 'partly';
  if (/cloud|overcast/.test(s)) return 'cloud';
  return isDay ? 'sun' : 'moon';
}

function icon(kind) {
  const rects = ICONS[kind].flatMap((row, y) => [...row].map((c, x) => (INK[c] ? `<rect x="${x}" y="${y}" width="1" height="1" fill="${INK[c]}"/>` : '')));
  return `<svg viewBox="0 0 12 12" aria-hidden="true" shape-rendering="crispEdges">${rects.join('')}</svg>`;
}

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const hourName = (h) => (h === 0 ? 'midnight' : h === 12 ? 'noon' : h < 12 ? `${h} am` : `${h - 12} pm`);
const UMBRELLA = {
  yes: ['YES', 'Bring an umbrella.'],
  maybe: ['MAYBE', 'A small one would not hurt.'],
  no: ['NO', 'Leave the umbrella at home.'],
};

export function initWeather(map) {
  const btn = document.getElementById('wx-btn');
  const card = document.getElementById('wx-card');
  let data = null;

  let winter = false;
  try { winter = localStorage.getItem(WINTER_KEY) === '1'; } catch {}
  if (winter) map.setWinter(true);

  async function load() {
    try {
      const r = await fetch('/api/weather');
      data = r.ok ? await r.json() : null;
    } catch { data = null; }
    paintButton();
    if (!card.hidden) paintCard();
  }

  function paintButton() {
    if (!data?.now) {
      btn.innerHTML = `${icon('cloud')}<span>--°</span>`;
      btn.title = 'Weather';
      return;
    }
    btn.innerHTML = `${icon(kindOf(data.now.short, data.now.isDay))}<span>${data.now.temp}°</span>`;
    btn.title = `${data.now.short}, ${data.now.temp}°F`;
  }

  function paintCard() {
    const toggle = `<button class="wx-winter" type="button" aria-pressed="${winter}">WINTER MODE<b>${winter ? 'ON' : 'OFF'}</b></button>`;
    const link = `<a class="sub-link" href="${FORECAST_PAGE}" target="_blank" rel="noopener">FULL FORECAST AT WEATHER.GOV</a>`;
    if (!data?.now) {
      card.innerHTML = `<p class="wx-head">NYC WEATHER</p><p class="sub-note">The weather is not available right now.</p>${toggle}${link}`;
      return;
    }
    const { now, today, tomorrow, umbrella } = data;
    const [answer, advice] = UMBRELLA[umbrella] ?? UMBRELLA.no;
    const rainWhen = today.wetHour !== null && today.pop >= 20 ? `, most likely around ${hourName(today.wetHour)}` : '';
    card.innerHTML = `
      <p class="wx-head">NYC WEATHER NOW</p>
      <div class="wx-now">${icon(kindOf(now.short, now.isDay))}<div><strong>${now.temp}°F</strong><span>${esc(now.short)}</span></div></div>
      <dl class="wx-facts">
        <div><dt>TODAY</dt><dd>High ${today.high}° · Low ${today.low}°</dd></div>
        <div><dt>CHANCE OF RAIN</dt><dd>${today.pop}% for the rest of today${rainWhen}</dd></div>
        <div><dt>UMBRELLA?</dt><dd><b class="wx-${umbrella}">${answer}</b> ${advice}</dd></div>
        ${tomorrow ? `<div><dt>TOMORROW</dt><dd>${esc(tomorrow.short)}, ${tomorrow.high}° / ${tomorrow.low}°, ${tomorrow.pop}% rain</dd></div>` : ''}
      </dl>
      ${toggle}${link}`;
  }

  function open(on) {
    card.hidden = !on;
    btn.setAttribute('aria-expanded', String(on));
    if (on) paintCard();
  }

  btn.addEventListener('click', () => open(card.hidden));
  card.addEventListener('click', (e) => {
    if (!e.target.closest('.wx-winter')) return;
    winter = !winter;
    map.setWinter(winter);
    try { localStorage.setItem(WINTER_KEY, winter ? '1' : '0'); } catch {}
    paintCard();
  });
  document.addEventListener('pointerdown', (e) => {
    if (!card.hidden && !e.target.closest('.wx')) open(false);
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && !card.hidden) { open(false); btn.focus(); }
  });

  paintButton();
  load();
  setInterval(load, REFRESH);
}
