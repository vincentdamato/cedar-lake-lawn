import './style.css';
import 'maplibre-gl/dist/maplibre-gl.css';

import { CONFIG } from './config';
import {
  searchAddress,
  getParcelByObjectId,
  getParcelAtPoint,
  type ParcelResult,
  type AddressMatch,
} from './parcel';
import { geocode } from './geocode';
import { tierPrice, withTax, tierById } from './quote';
import { createMap, showParcel, clearParcel } from './map';
import { startAdjust, stopAdjust } from './adjust';
import { captureLead } from './leads';

const $ = (id: string) => document.getElementById(id) as HTMLElement;
document.title = `${CONFIG.BUSINESS_NAME} — Instant Lawn Quote · SE Wisconsin`;
const fmtPhone = (p: string) => `(${p.slice(0, 3)}) ${p.slice(3, 6)}-${p.slice(6)}`;
const escapeHtml = (s: string) =>
  s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c] as string);
const titleCase = (s: string) => s.charAt(0).toUpperCase() + s.slice(1).toLowerCase();
const phoneDisplay = fmtPhone(CONFIG.PHONE);
// standard sms: deep link (a stray "&" after "?" drops the prefill on some Android)
const smsHref = (body: string) => `sms:+1${CONFIG.PHONE}?body=${encodeURIComponent(body)}`;
// device hints, computed once
const TOUCH =
  window.matchMedia('(pointer: coarse)').matches ||
  navigator.maxTouchPoints > 0 ||
  /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);
const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

// --- static brand wiring -------------------------------------------------
$('brand').textContent = CONFIG.BUSINESS_NAME;
$('eyebrow').textContent = CONFIG.SERVICE_AREA;
{
  const nav = $('navnum') as HTMLAnchorElement;
  nav.textContent = phoneDisplay;
  nav.href = `tel:+1${CONFIG.PHONE}`;
}
// footer
$('footBrand').textContent = CONFIG.BUSINESS_NAME;
$('footArea').textContent = CONFIG.SERVICE_AREA;
{
  const fc = $('footCall') as HTMLAnchorElement;
  fc.textContent = `Call ${phoneDisplay}`;
  fc.href = `tel:+1${CONFIG.PHONE}`;
  ($('footText') as HTMLAnchorElement).href = smsHref(
    'Hi ' + CONFIG.BUSINESS_NAME + ' — I have a question about lawn care.'
  );
  $('footCopy').textContent = `© ${new Date().getFullYear()} ${CONFIG.BUSINESS_NAME}`;
}
{
  const call = $('ctaCall') as HTMLAnchorElement;
  call.textContent = `or call ${phoneDisplay}`;
  call.href = `tel:+1${CONFIG.PHONE}`;
  const fin = $('finalCall') as HTMLAnchorElement;
  fin.href = `tel:+1${CONFIG.PHONE}`;
  fin.textContent = `Call ${phoneDisplay}`;
  ($('heroText') as HTMLAnchorElement).href = smsHref(
    'Hi ' + CONFIG.BUSINESS_NAME + ' — I have a question about a lawn quote.'
  );
  $('offerPct').textContent = String(CONFIG.WELCOME_DISCOUNT_PCT);
  ($('switchText') as HTMLAnchorElement).href = smsHref(
    'Hi ' +
      CONFIG.BUSINESS_NAME +
      ` — I'd like to switch lawn services. I currently pay $____ for my lawn. Can you match it and take ${CONFIG.WELCOME_DISCOUNT_PCT}% off?`
  );
}
$('trustline').innerHTML = CONFIG.TRUST.map(
  (t) => `<span><span class="dot"></span>${t}</span>`
).join('');
$('serviceCards').innerHTML = CONFIG.TIERS.map(
  (t) =>
    `<div class="card"><div class="cname">${t.name}</div><div class="cinc">${t.inc}</div><div class="cblurb">${t.blurb}</div></div>`
).join('');
$('cadrow').innerHTML = CONFIG.CADENCES.map(
  (c, i) => `<button class="cad${i === 0 ? ' sel' : ''}" data-cad="${c}" type="button">${c}</button>`
).join('');

// --- state ---------------------------------------------------------------
let parcel: ParcelResult | null = null;
let selectedTier = CONFIG.TIERS[0].id;
let selectedCadence: string = CONFIG.CADENCES[0];
let adjusting = false;
let adjustedSqft: number | null = null; // set when the customer drags the lawn
const areaSqft = () => adjustedSqft ?? parcel?.mowableSqft ?? 0;
const isLarge = () => (adjustedSqft != null ? adjustedSqft > CONFIG.MOW_CAP_SQFT : !!parcel?.large);

// --- map -----------------------------------------------------------------
const map = createMap('map', CONFIG.MAP_CENTER, CONFIG.START_ZOOM);
map.on('click', (e) => {
  if (adjusting) return; // don't blow away an in-progress lawn edit
  lookupPoint(e.lngLat.lng, e.lngLat.lat);
});
// cooperative gestures block one-finger panning — but Terra Draw needs one-finger drag,
// so turn them off while adjusting and back on after
const coopGestures = (on: boolean) => {
  const c = (map as any).cooperativeGestures;
  if (c) on ? c.enable() : c.disable();
};

// --- elements ------------------------------------------------------------
const addr = $('addr') as HTMLInputElement;
const findBtn = $('findBtn') as HTMLButtonElement;
const adjustBtn = $('adjustBtn') as HTMLButtonElement;
const acList = $('acList');
const chip = $('chip');
const emptyEl = $('empty');
const resultEl = $('result');
const outAreaEl = $('outArea');
const loadingEl = $('loading');
const errEl = $('errstate');

// panel state machine + race guard (newer lookups win; failures get a retry)
let reqId = 0;
let retry: (() => void) | null = null;
type PanelState = 'empty' | 'loading' | 'result' | 'outarea' | 'error';
function setPanel(state: PanelState) {
  emptyEl.classList.toggle('hidden', state !== 'empty');
  loadingEl.classList.toggle('hidden', state !== 'loading');
  resultEl.classList.toggle('hidden', state !== 'result');
  outAreaEl.classList.toggle('hidden', state !== 'outarea');
  errEl.classList.toggle('hidden', state !== 'error');
  // on a phone, dismiss the keyboard and bring the answer into view so it isn't below the fold
  if (TOUCH && (state === 'result' || state === 'outarea' || state === 'error')) {
    addr.blur();
    const el = state === 'result' ? resultEl : state === 'outarea' ? outAreaEl : errEl;
    requestAnimationFrame(() =>
      el.scrollIntoView({ behavior: reduceMotion ? 'auto' : 'smooth', block: 'nearest' })
    );
  }
}
($('retryBtn') as HTMLButtonElement).addEventListener('click', () => retry?.());

// screen-reader live region: announce async results/errors that aren't focus-driven
function announce(msg: string) {
  $('sr').textContent = msg;
}

// --- address typeahead (authoritative, from parcel data) -----------------
let acItems: AddressMatch[] = [];
let acIndex = -1;
let acTimer: number | undefined;
let lastQuery = '';

function closeAC() {
  acList.classList.add('hidden');
  acList.innerHTML = '';
  acItems = [];
  acIndex = -1;
  addr.setAttribute('aria-expanded', 'false');
  addr.removeAttribute('aria-activedescendant');
}
function renderAC(items: AddressMatch[]) {
  acItems = items;
  if (!items.length) {
    closeAC();
    return;
  }
  acList.innerHTML = '';
  items.forEach((m, i) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'acitem';
    b.id = `ac-opt-${i}`;
    b.setAttribute('role', 'option');
    b.setAttribute('aria-selected', 'false');
    b.innerHTML = `<b>${escapeHtml(m.address)}</b><span>${escapeHtml(titleCase(m.county))} County</span>`;
    b.addEventListener('click', () => selectMatch(m));
    acList.appendChild(b);
  });
  acList.classList.remove('hidden');
  addr.setAttribute('aria-expanded', 'true');
  acIndex = -1;
  addr.removeAttribute('aria-activedescendant');
}
function highlightAC() {
  [...acList.children].forEach((c, i) => {
    const on = i === acIndex;
    c.classList.toggle('act', on);
    c.setAttribute('aria-selected', on ? 'true' : 'false');
  });
  const el = acList.children[acIndex] as HTMLElement | undefined;
  if (el) {
    el.scrollIntoView({ block: 'nearest' });
    addr.setAttribute('aria-activedescendant', el.id);
  } else {
    addr.removeAttribute('aria-activedescendant');
  }
}
async function runSuggest(q: string) {
  try {
    const items = await searchAddress(q);
    if (lastQuery === q) renderAC(items);
  } catch {
    if (lastQuery === q) closeAC(); // typeahead is best-effort — never throw to the UI
  }
}
addr.addEventListener('input', () => {
  const q = addr.value.trim();
  lastQuery = q;
  clearTimeout(acTimer);
  if (q.length < 3) {
    closeAC();
    return;
  }
  acTimer = setTimeout(() => runSuggest(q), 200);
});
addr.addEventListener('keydown', (e) => {
  const open = !acList.classList.contains('hidden') && acItems.length > 0;
  if (open && e.key === 'ArrowDown') {
    e.preventDefault();
    acIndex = Math.min(acIndex + 1, acItems.length - 1);
    highlightAC();
  } else if (open && e.key === 'ArrowUp') {
    e.preventDefault();
    acIndex = Math.max(acIndex - 1, 0);
    highlightAC();
  } else if (e.key === 'Enter') {
    if (open && acIndex >= 0) {
      e.preventDefault();
      selectMatch(acItems[acIndex]);
    } else {
      find();
    }
  } else if (e.key === 'Escape') {
    closeAC();
  }
});
document.addEventListener('click', (e) => {
  if (!(e.target as HTMLElement).closest('.acwrap')) closeAC();
});

// --- lookups -------------------------------------------------------------
function selectMatch(m: AddressMatch) {
  closeAC();
  addr.value = m.address;
  addr.blur();
  runLookup(() => getParcelByObjectId(m.objectId), () => selectMatch(m));
}
function lookupPoint(lng: number, lat: number) {
  runLookup(() => getParcelAtPoint(lng, lat), () => lookupPoint(lng, lat));
}
async function runLookup(fetcher: () => Promise<ParcelResult>, again: () => void) {
  const id = ++reqId;
  retry = again;
  findBtn.disabled = false; // un-stick the Find button if this supersedes a find()
  findBtn.textContent = 'Find my lawn';
  setPanel('loading');
  chip.textContent = 'Measuring your lawn…';
  try {
    const r = await fetcher();
    if (id === reqId) render(r);
  } catch {
    if (id === reqId) {
      setPanel('error');
      chip.textContent = 'Map service is busy — try again.';
      announce('Sorry — the map service didn’t respond. Please try again.');
    }
  }
}
async function find() {
  const q = addr.value.trim();
  if (!q) return;
  closeAC();
  const id = ++reqId;
  retry = find;
  setPanel('loading');
  findBtn.disabled = true;
  findBtn.textContent = 'Pricing…';
  try {
    const matches = await searchAddress(q);
    if (id !== reqId) return;
    if (matches.length) {
      addr.value = matches[0].address;
      const r = await getParcelByObjectId(matches[0].objectId);
      if (id === reqId) render(r);
      return;
    }
    const g = await geocode(q);
    if (id !== reqId) return;
    if (g) {
      const r = await getParcelAtPoint(g.lng, g.lat);
      if (id === reqId) render(r);
    } else {
      showOutArea(
        "We couldn't find that address.",
        'Check the spelling and try again, or tap your house on the map and we’ll measure from there.',
        'Couldn’t find that address — try the spelling, or tap the map.'
      );
    }
  } catch {
    if (id === reqId) {
      setPanel('error');
      chip.textContent = 'Address lookup is busy — try again.';
      announce('Sorry — address lookup didn’t respond. Please try again.');
    }
  } finally {
    if (id === reqId) {
      findBtn.disabled = false;
      findBtn.textContent = 'Get my price';
    }
  }
}
findBtn.addEventListener('click', find);

// "Use my location" — geolocate and snap to the parcel (ideal for someone in their yard)
const locBtn = $('locBtn') as HTMLButtonElement;
if ('geolocation' in navigator) {
  locBtn.classList.remove('hidden');
  locBtn.addEventListener('click', () => {
    locBtn.disabled = true;
    closeAC();
    chip.textContent = 'Getting your location…';
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        locBtn.disabled = false;
        lookupPoint(pos.coords.longitude, pos.coords.latitude);
      },
      () => {
        locBtn.disabled = false;
        chip.textContent = 'Couldn’t get your location — type your address instead.';
        addr.focus();
      },
      { enableHighAccuracy: true, timeout: 8000, maximumAge: 60000 }
    );
  });
}

// --- render --------------------------------------------------------------
function render(r: ParcelResult) {
  if (adjusting) {
    adjusting = false;
    adjustBtn.classList.remove('active');
    coopGestures(true);
    stopAdjust();
  }
  adjustedSqft = null;
  parcel = r;
  if (!r.served) {
    showOutArea(r.county ? `We're not in ${titleCase(r.county)} County yet.` : "We couldn't find that address.");
    return;
  }
  showParcel(map, r.geometry);
  setPanel('result');
  chip.textContent =
    (r.large ? 'Big lot — we’ll confirm the exact mowable area with you.' : 'Lawn area estimated from your lot.') +
    (TOUCH ? ' Use two fingers to move the map.' : '');
  updatePanel();
}

function renderTiers() {
  if (!parcel) return;
  const el = $('tiers');
  el.innerHTML = '';
  const sqft = areaSqft();
  for (const t of CONFIG.TIERS) {
    const p = tierPrice(sqft, t.add);
    const row = document.createElement('div');
    row.className = 'tier' + (t.id === selectedTier ? ' sel' : '');
    row.setAttribute('role', 'button');
    row.tabIndex = 0;
    row.innerHTML = `<div><div class="tname">${t.name}</div><div class="tinc">${t.inc}</div></div><div class="tprice">$${p}</div>`;
    const pick = () => {
      selectedTier = t.id;
      updatePanel();
    };
    row.addEventListener('click', pick);
    row.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        pick();
      }
    });
    el.appendChild(row);
  }
}

function smsBody(price: number): string {
  const t = tierById(selectedTier)!;
  const large = isLarge();
  const sizeLine = large
    ? `\nProperty: ${(parcel?.acres ?? 0).toFixed(2)} ac lot (large — please confirm mowable area)`
    : `\nLawn: ~${Math.round(areaSqft()).toLocaleString()} sq ft${adjustedSqft != null ? ' (adjusted on map)' : ''}`;
  const oneTime = selectedCadence === 'One-time';
  const closing = large
    ? `\nPlease confirm the price for my property. When can you come out?`
    : oneTime
      ? `\nI'd like to book a one-time cut at this price. When can you come out?`
      : `\nI agree to begin service at this price. When can you start?`;
  const taxNote =
    CONFIG.SHOW_TAX && !large
      ? ` (+ ${Math.round(CONFIG.TAX_RATE * 100)}% WI tax ≈ $${withTax(price).toFixed(2)})`
      : '';
  return (
    `Hi ${CONFIG.BUSINESS_NAME} — I'd like to start service.` +
    `\nAddress: ${parcel?.address || addr.value || '(my address)'}` +
    `\nService: ${t.name} — $${price}/cut${taxNote}` +
    `\nSchedule: ${selectedCadence}` +
    sizeLine +
    closing
  );
}

function updatePanel() {
  if (!parcel || !parcel.served) return;
  $('smsFallback').classList.add('hidden'); // reset desktop fallback on any change
  const t = tierById(selectedTier)!;
  const adjusted = adjustedSqft != null;
  const sqft = areaSqft();
  const price = tierPrice(sqft, t.add);
  const large = isLarge();

  $('areaLine').innerHTML = large
    ? `Large property <span class="badge est">${parcel.acres.toFixed(2)} ac lot</span>`
    : `≈ ${Math.round(sqft).toLocaleString()} sq ft of lawn <span class="badge ${adjusted ? 'exact' : 'est'}">${adjusted ? 'Adjusted' : 'Estimate'}</span>`;
  $('price').textContent = '$' + price;
  $('perLabel').textContent = (large ? 'starting · ' : 'per cut · ') + t.name;
  $('taxnote').textContent = CONFIG.SHOW_TAX
    ? `+ ${Math.round(CONFIG.TAX_RATE * 100)}% WI service tax · about $${withTax(price).toFixed(2)} with tax`
    : '';
  $('srcnote').textContent = adjusted
    ? 'You adjusted the lawn on the map — priced on what you drew.'
    : large
      ? 'Big lot — a starting price. We confirm the exact mowable area on-site.'
      : 'Estimated from your lot, measured on county maps. We confirm on-site.';
  adjustBtn.textContent = adjusted ? 'Re-adjust the lawn →' : 'Not quite right? Adjust the lawn →';

  renderTiers();

  const oneTime = selectedCadence === 'One-time';
  const cta = $('ctaText') as HTMLAnchorElement;
  cta.textContent = 'Text to book · ' + t.name;
  $('agreenote').textContent = large
    ? `Texting sends your address for a ${t.name} quote starting at $${price}/cut, ${selectedCadence.toLowerCase()}. We confirm the exact price for your property. No contract.`
    : oneTime
      ? `Texting sends your address to book a one-time ${t.name} at $${price}/cut. No contract, no commitment.`
      : `Texting sends your address and confirms you’d like to start ${t.name} at $${price}/cut, ${selectedCadence.toLowerCase()}. No contract — skip or stop anytime.`;
  cta.href = smsHref(smsBody(price));
  announce(
    `$${price} ${large ? 'starting ' : ''}per cut, ${t.name}, ` +
      (large ? 'large property — we confirm on site.' : `about ${Math.round(sqft).toLocaleString()} square feet.`)
  );
}

$('cadrow').addEventListener('click', (e) => {
  const b = (e.target as HTMLElement).closest('.cad') as HTMLElement | null;
  if (!b) return;
  selectedCadence = b.dataset.cad as string;
  document.querySelectorAll('#cadrow .cad').forEach((x) => x.classList.toggle('sel', x === b));
  updatePanel();
});

// Capture the lead on "Text to book" tap (so it's not lost if the text never sends),
// and on desktop — where sms: links do nothing — reveal a copy-the-message fallback.
($('ctaText') as HTMLAnchorElement).addEventListener('click', (e) => {
  if (!parcel?.served) return;
  const t = tierById(selectedTier)!;
  const price = tierPrice(areaSqft(), t.add);
  captureLead({
    type: 'quote',
    address: parcel.address || addr.value,
    county: parcel.county,
    areaSqft: Math.round(areaSqft()),
    tier: t.name,
    price,
    cadence: selectedCadence,
  });
  if (!TOUCH) {
    e.preventDefault();
    const sfNum = $('sfNum') as HTMLAnchorElement;
    sfNum.textContent = phoneDisplay;
    sfNum.href = `tel:+1${CONFIG.PHONE}`;
    $('sfMsg').textContent = smsBody(price);
    $('smsFallback').classList.remove('hidden');
  }
});
($('sfCopy') as HTMLButtonElement).addEventListener('click', async () => {
  try {
    await navigator.clipboard.writeText($('sfMsg').textContent || '');
    $('sfCopy').textContent = 'Copied ✓';
  } catch {
    $('sfCopy').textContent = 'Select the text above and copy it';
  }
});

// --- out-of-area capture -------------------------------------------------
function showOutArea(head?: string, body?: string, chipText?: string) {
  setPanel('outarea');
  clearParcel(map);
  if (head) $('oaHead').textContent = head;
  if (body) $('oaBody').textContent = body;
  $('oaDone').classList.add('hidden');
  const form = $('oaForm') as HTMLFormElement;
  form.classList.remove('hidden');
  const ob = form.querySelector('button') as HTMLButtonElement | null;
  if (ob) ob.disabled = false;
  chip.textContent = chipText || 'Outside our service area for now.';
  announce(head || 'Outside our service area — leave your info and we’ll reach out.');
}
($('oaForm') as HTMLFormElement).addEventListener('submit', async (e) => {
  e.preventDefault();
  const contact = ($('oaContact') as HTMLInputElement).value.trim();
  if (!contact) return;
  const btn = ($('oaForm') as HTMLFormElement).querySelector('button') as HTMLButtonElement;
  btn.disabled = true;
  const ok = await captureLead({ type: 'interest', contact, address: addr.value, county: parcel?.county ?? null });
  btn.disabled = false;
  // only claim success if it actually went through; otherwise give a real way to reach us
  $('oaDone').textContent = ok
    ? `Thanks — we'll be in touch. You can also text us anytime at ${phoneDisplay}.`
    : `Couldn't submit that just now — please text us at ${phoneDisplay} and we'll add you to the list.`;
  $('oaDone').classList.remove('hidden');
  if (ok) ($('oaForm') as HTMLElement).classList.add('hidden');
  announce($('oaDone').textContent || '');
});

// --- drag-to-adjust the lawn ---------------------------------------------
adjustBtn.addEventListener('click', () => {
  if (!parcel?.served) return;
  if (!adjusting) {
    adjusting = true;
    adjustBtn.textContent = 'Done adjusting';
    adjustBtn.classList.add('active');
    chip.textContent = 'Drag the dots to match your lawn. Drag a midpoint to add a corner.';
    clearParcel(map);
    coopGestures(false); // let one finger drag a vertex
    startAdjust(map, parcel.geometry, areaSqft(), (sqft) => {
      adjustedSqft = sqft;
      repriceLive();
    });
  } else {
    finishAdjust();
  }
});
function finishAdjust() {
  if (!adjusting) return;
  adjusting = false;
  adjustBtn.classList.remove('active');
  coopGestures(true);
  const res = stopAdjust();
  if (res && parcel) {
    adjustedSqft = res.sqft;
    parcel.geometry = res.geometry; // keep the adjusted shape on screen
    showParcel(map, res.geometry);
    chip.textContent = 'Lawn adjusted by you.';
  }
  updatePanel();
}
function repriceLive() {
  if (!parcel) return;
  const t = tierById(selectedTier)!;
  $('price').textContent = '$' + tierPrice(areaSqft(), t.add);
  $('areaLine').innerHTML =
    `≈ ${Math.round(areaSqft()).toLocaleString()} sq ft of lawn <span class="badge est">Adjusting…</span>`;
}
