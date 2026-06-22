# CLAUDE.md — Cedar Lake Lawn Co. / Instant Lawn Quote

Project context for Claude Code. Read this before making changes.

## What this is

A web app for a local SE-Wisconsin residential lawn-care service (Washington, Waukesha,
Ozaukee counties). A homeowner types their address; the app pulls their **actual lot
from county parcel data**, estimates the mowable lawn, shows a real tiered price with WI
tax, and books by text. The customer can **drag the lawn polygon to adjust** the area.
The "Text to book" button opens their messaging app pre-filled with address, service,
price, cadence, and an agreement line (the no-contract record) and records the lead. No
accounts to use it; no API keys.

> This is **v2**. The original single-file v1 (Leaflet, hand-traced polygon, no build) is
> archived in `legacy/index.html`. The live app is the Vite project in **`app/`**.

## Stack & layout

Everything is in **`app/`** — Vite + TypeScript, no framework.

- `app/src/config.ts` — **all tunable business values** (the only place to change them).
- `app/src/counties.ts` — served counties + the WI statewide parcel ArcGIS endpoint.
- `app/src/parcel.ts` — address typeahead, parcel lookup, point-snap, mowable-area math.
- `app/src/geocode.ts` — US Census geocoder (keyless) "Find" fallback.
- `app/src/quote.ts` — pricing (base, tiers, tax). Has unit tests.
- `app/src/map.ts` — MapLibre GL map (Esri World Imagery raster, no key) + parcel render.
- `app/src/adjust.ts` — drag-to-adjust via **Terra Draw** (MapLibre adapter).
- `app/src/net.ts` — `fetchJson` with an `AbortController` timeout (CONFIG.FETCH_TIMEOUT_MS).
- `app/src/leads.ts` — `captureLead` (POST to `VITE_LEAD_ENDPOINT`, `keepalive`, returns success).
- `app/src/main.ts` — wires it all: typeahead, lookups, panel state machine, render, adjust.
- `app/index.html` + `app/src/style.css` — markup + brand styles.
- Tests: `app/src/*.test.ts` (Vitest) — `npm test`.

Geo data (all keyless, hit directly from the browser): WI statewide parcel ArcGIS
FeatureServer, US Census geocoder, Esri World Imagery tiles, Google Fonts.

## Hard constraints — do not break without asking

1. **No API keys, no required accounts, no backend.** All data sources are keyless public
   services. If a feature needs a key, gate it behind config/env, never hardcode it.
2. **No `localStorage` / `sessionStorage`.** Use in-memory state.
3. **Every business value in `CONFIG`** (`app/src/config.ts`). Nothing tunable hardcoded.
4. **Preserve the brand & tone:** green palette (CSS vars), Bricolage Grotesque (display)
   + Hanken Grotesk (body). Voice is **warm, professional, neighborly, low-pressure** —
   "a friendly local company you can count on," competitive/affordable, "we'd love to earn
   your business." Not combative, no "fighting the big guys," no exclamation marks, no emojis.
5. **Always compute parcel area from geometry** (turf), never from county acreage attributes
   (`GISACRES` is null in some counties).
6. **Keep external calls resilient:** route through `net.ts` (timeout) and keep graceful
   degradation (error panel + retry; book-by-text still works on a typed address).

## Pricing model

`app/src/config.ts`:

    base mowable = min( lot_sqft × COVERAGE_FACTOR , MOW_CAP_SQFT )   (capped; big lots flagged)
    base price   = max( MIN_PRICE , mowable_sqft × RATE_PER_SQFT )
    tier price   = round( base + tier.add , ROUND_TO )

Lots over `CONFIRM_ACRES` (or that hit the cap) show a "starting price, confirm on-site"
framing. Drag-to-adjust replaces the estimate with the drawn polygon's real area.
WI taxes lawn services (§77.52(2)(a)20) — `TAX_RATE` shown as "+ tax".
`WELCOME_DISCOUNT_PCT` powers the "match your price + N% off" switch offer.

## Leads — the one thing that must be wired

Leads POST to **`VITE_LEAD_ENDPOINT`** (a build-time env var → a keyless form sink like
Formspree/Basin). **If unset, leads only `console.log` and are lost.** See `app/.env.example`
and the README. This is the #1 go-live action.

## Deploy

GitHub Pages via `.github/workflows/deploy.yml` (builds `app/`, runs tests, publishes
`app/dist` on push to `main`). Pages **Source must be set to GitHub Actions**. Vite
`base: './'` makes it work on the project subpath and a future custom domain unchanged.

## Testing

`cd app && npm test` (pricing + address parsing). Manually: search an address, check the
parcel + price, switch tiers/cadence, drag-to-adjust, confirm the SMS body, check mobile
(~380px) and one-finger dragging on touch.

## Backlog (post-launch, from the readiness audit)

- **Wire `VITE_LEAD_ENDPOINT`** (owner action — leads are lost without it).
- OG share image (needs the production domain) for link previews.
- Lazy-load MapLibre/Terra Draw to shrink first paint (~1.2 MB bundle).
- A second satellite-tile fallback if Esri throttles; tile-error notice.
- Auto-quote from parcel-minus-building-footprint (true measured area) — the big v3 unlock.
- Route/density view of booked accounts (unit-economics master variable).
