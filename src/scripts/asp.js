// Alternate side parking, in the + menu: whether the street cleaning rules are suspended today and tomorrow
// (from NYC DOT's calendar in asp.json, made by tools/build_asp.py), a SHOW ON MAP switch that keeps that
// answer in a small chip at the bottom left, and links to the year's calendar (the #asp modal) and NYC DOT.
// The section header itself says today's answer, so a glance at the + menu is enough.

import ASP from './asp.json';

const SHOW_KEY = '8bm_asp_chip';

// YYYY-MM-DD in New York
const nyDay = () => new Date().toLocaleDateString('en-CA', { timeZone: 'America/New_York' });
function addDay(ymd) {
  const d = new Date(`${ymd}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
}
const weekday = (ymd) => new Date(`${ymd}T12:00:00Z`).getUTCDay();
const label = (ymd) => new Date(`${ymd}T12:00:00Z`).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', timeZone: 'UTC' }).toUpperCase();

// { off: true when the rules do not apply, short, why }
export function aspOn(ymd) {
  const hol = ASP[ymd];
  if (hol) return { off: true, short: 'SUSPENDED', why: `${hol.reason}. ${hol.meters ? 'Parking meters are in effect.' : 'Parking meters are suspended too.'}` };
  if (weekday(ymd) === 0) return { off: true, short: 'NO ASP', why: 'No alternate side parking on Sundays.' };
  return { off: false, short: 'IN EFFECT', why: 'Move your car for street cleaning as posted.' };
}

export function initAsp() {
  const out = document.getElementById('asp-out');
  const badge = document.getElementById('asp-badge');
  const chip = document.getElementById('asp-chip');
  const toggle = document.getElementById('asp-show');
  let show = false;
  try { show = localStorage.getItem(SHOW_KEY) === '1'; } catch {}

  function paint() {
    const today = nyDay();
    const tomorrow = addDay(today);
    const a = aspOn(today);
    const b = aspOn(tomorrow);
    badge.textContent = a.short;
    badge.classList.toggle('is-off', a.off);
    out.innerHTML = [['TODAY', today, a], ['TOMORROW', tomorrow, b]].map(([name, ymd, s]) => `
      <div class="asp-row${s.off ? ' is-off' : ''}">
        <p><span>${name} <small>${label(ymd)}</small></span><b>${s.short}</b></p>
        <small>${s.why}</small>
      </div>`).join('');
    toggle.setAttribute('aria-pressed', String(show));
    toggle.querySelector('b').textContent = show ? 'ON' : 'OFF';
    chip.hidden = !show;
    chip.innerHTML = `ASP TODAY <b class="${a.off ? 'is-off' : ''}">${a.short}</b><span>TMRW <b class="${b.off ? 'is-off' : ''}">${b.short}</b></span>`;
    // the year's calendar marks today
    document.querySelectorAll('.asp-day.is-today').forEach((d) => d.classList.remove('is-today'));
    document.querySelector(`.asp-day[data-day="${today}"]`)?.classList.add('is-today');
  }

  toggle.addEventListener('click', () => {
    show = !show;
    try { localStorage.setItem(SHOW_KEY, show ? '1' : '0'); } catch {}
    paint();
  });
  paint();
  // the day turns over at midnight in New York
  setInterval(paint, 60 * 1000);
}
