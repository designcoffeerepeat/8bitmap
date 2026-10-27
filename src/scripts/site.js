// Site chrome outside the map: the menu in the title box (including MONSTER ATTACK!), the Contact / About / Privacy / Terms
// modals, the empty ad slot and Times Square billboard (open Contact on Ad/Event Inquiry) and the cookie banner.
// Loaded on its own so it works while the map and events are still loading.

const $ = (sel) => document.querySelector(sel);
const menuBtn = $('#menu-btn');
const menu = $('#site-menu');
const MODALS = ['contact', 'about', 'privacy', 'terms', 'disclaimer', 'asp'];

// ---- menu ----------------------------------------------------------------------
function toggleMenu(open) {
  menu.hidden = !open;
  menuBtn.setAttribute('aria-expanded', String(open));
}
menuBtn.addEventListener('click', () => toggleMenu(menu.hidden));
document.addEventListener('pointerdown', (e) => {
  if (!menu.hidden && !e.target.closest('.brand')) toggleMenu(false);
});
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && !menu.hidden) {
    toggleMenu(false);
    menuBtn.focus();
  }
});

// MONSTER ATTACK! starts the attack, and a second click calls it off. src/scripts/monster.js
// takes over once the map is ready; until then the click just queues (or unqueues) it.
const monsterBtn = $('#launch-monster');
monsterBtn.addEventListener('click', () => {
  toggleMenu(false);
  if (window.monsterToggle) return window.monsterToggle();
  window.monsterQueued = !window.monsterQueued;
  monsterBtn.setAttribute('aria-pressed', String(window.monsterQueued));
});
window.addEventListener('monster:state', (e) => monsterBtn.setAttribute('aria-pressed', String(e.detail.on)));

// ---- modals ----------------------------------------------------------------------
// Each modal also has a hash (#contact, #about, #privacy, #terms, #disclaimer, #asp) so it can be linked to directly.
function openModal(name, { topic } = {}) {
  const dialog = $(`#modal-${name}`);
  if (!dialog) return;
  toggleMenu(false);
  document.querySelectorAll('dialog.modal[open]').forEach((d) => d !== dialog && d.close());
  if (name === 'contact') prepareContact(topic);
  if (!dialog.open) dialog.showModal();
  dialog.querySelector('.modal-body').scrollTop = 0;
  if (location.hash !== `#${name}`) history.replaceState(null, '', `#${name}`);
}

document.addEventListener('click', (e) => {
  const link = e.target.closest('[data-modal]');
  if (!link) return;
  e.preventDefault();
  openModal(link.dataset.modal);
});

for (const dialog of document.querySelectorAll('dialog.modal')) {
  dialog.querySelector('.modal-close').addEventListener('click', () => dialog.close());
  // a click on the dimmed backdrop lands on the dialog element itself
  dialog.addEventListener('click', (e) => e.target === dialog && dialog.close());
  dialog.addEventListener('close', () => {
    if (!document.querySelector('dialog.modal[open]') && MODALS.includes(location.hash.slice(1))) {
      history.replaceState(null, '', location.pathname + location.search);
    }
  });
}

function openFromHash() {
  const name = location.hash.slice(1);
  if (MODALS.includes(name)) openModal(name);
}
window.addEventListener('hashchange', openFromHash);
openFromHash();

// ---- ad slot ----------------------------------------------------------------------
$('#ad-slot.is-empty')?.addEventListener('click', () => openModal('contact', { topic: 'ad' }));
// the Times Square billboard on the map (src/scripts/times-square.js) asks for the same form
window.addEventListener('ad:inquiry', () => openModal('contact', { topic: 'ad' }));

// ---- contact form ----------------------------------------------------------------------
const form = $('#contact-form');
const topic = $('#cf-topic');
const status = $('#cf-status');
const submit = form.querySelector('button[type="submit"]');

function prepareContact(preset) {
  if (preset) topic.value = preset;
  showAdInfo();
}
function showAdInfo() {
  $('#ad-info').hidden = topic.value !== 'ad';
}
topic.addEventListener('change', showAdInfo);

form.addEventListener('submit', async (e) => {
  e.preventDefault();
  const data = Object.fromEntries(new FormData(form));
  const missing = [['name', 'your name'], ['email', 'your email'], ['message', 'a message']]
    .find(([key]) => !String(data[key] ?? '').trim());
  if (missing) return setStatus(`Please add ${missing[1]}.`, true);
  if (!form.elements.email.checkValidity()) return setStatus('Please check your email address.', true);

  submit.disabled = true;
  setStatus('SENDING...');
  try {
    const res = await fetch('/api/contact', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(body.error || 'send failed');
    form.reset();
    showAdInfo();
    setStatus('THANKS! YOUR MESSAGE IS ON ITS WAY.');
  } catch (err) {
    const to = data.topic === 'ad' ? 'sales@8bit.nyc' : 'info@8bit.nyc';
    setStatus(`${err.message === 'send failed' ? 'That did not go through.' : err.message} You can also email ${to}.`, true);
  } finally {
    submit.disabled = false;
  }
});

function setStatus(text, isError = false) {
  status.textContent = text;
  status.classList.toggle('is-error', isError);
}

// ---- cookie consent ----------------------------------------------------------------------
// Only asked of visitors the edge worker marks as EU, EEA, UK or Switzerland (see index.astro).
// The choice lives in a first-party cookie for a year so the worker's own pages can read it too.
const consent = window.siteConsent ?? { required: false, choice: null };
const banner = $('#consent');
const settings = $('#cookie-settings');

if (consent.required) {
  settings.hidden = false;
  if (!consent.choice) banner.hidden = false;
}
settings.addEventListener('click', () => {
  toggleMenu(false);
  banner.hidden = false;
  banner.querySelector('[data-consent="yes"]').focus();
});
banner.addEventListener('click', (e) => {
  const choice = e.target.closest('[data-consent]')?.dataset.consent;
  if (!choice) return;
  document.cookie = `8bm_consent=${choice}; Path=/; Max-Age=${60 * 60 * 24 * 365}; SameSite=Lax; Secure`;
  banner.hidden = true;
  if (choice === 'yes') window.loadAnalytics?.();
  // Saying no after a yes: clear Google's cookies and reload without the tag.
  else if (window.loadAnalytics?.done) {
    for (const name of document.cookie.split('; ').map((c) => c.split('=')[0]).filter((n) => n.startsWith('_ga'))) {
      for (const domain of ['', `; Domain=${location.hostname}`, `; Domain=.${location.hostname.split('.').slice(-2).join('.')}`]) {
        document.cookie = `${name}=; Path=/; Max-Age=0${domain}`;
      }
    }
    location.reload();
  }
});
