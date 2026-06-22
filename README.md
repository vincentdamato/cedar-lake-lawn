# Cedar Lake Lawn Co. — Instant Lawn Quote

A web app for a local SE-Wisconsin lawn-care service. A homeowner types their address,
the app pulls their **actual lot from county parcel maps**, estimates the mowable lawn,
shows a real price with service tiers, and books by text. They can **drag to adjust** the
lawn on the satellite map. No accounts, no API keys.

The app lives in **[`app/`](app/)** (Vite + TypeScript + MapLibre GL + Terra Draw).
The old single-file v1 is archived in [`legacy/`](legacy/) for reference.

## Run locally

```bash
cd app
npm install
npm run dev      # http://localhost:5173
npm test         # pricing + address-parsing unit tests
npm run build    # production build -> app/dist
```

## Configure

Every business value lives in **[`app/src/config.ts`](app/src/config.ts)** — business
name, phone, service-area copy, `RATE_PER_SQFT` / `MIN_PRICE` / `ROUND_TO`, the service
`TIERS`, the `COVERAGE_FACTOR` / `MOW_CAP_SQFT` lawn estimate, WI `TAX_RATE`, the
`WELCOME_DISCOUNT_PCT` switch offer, and the served counties (`app/src/counties.ts`).

## Leads — do this or leads are lost

"Text to book" and the out-of-area form POST the lead to **`VITE_LEAD_ENDPOINT`**.
If it isn't set, leads only log to the browser console. Point it at a free, keyless
form sink (a public URL, not a secret):

1. Make a form at **[Formspree](https://formspree.io)** or **[Basin](https://usebasin.com)** → copy its URL.
2. In the GitHub repo: **Settings → Secrets and variables → Actions → Variables → New variable**
   named `VITE_LEAD_ENDPOINT` set to that URL.
3. Re-run the deploy (push, or Actions → Run workflow). See `app/.env.example`.

## Deploy (GitHub Pages)

A workflow ([`.github/workflows/deploy.yml`](.github/workflows/deploy.yml)) builds `app/`
and publishes it on every push to `main`.

1. Push this repo to GitHub.
2. **Settings → Pages → Build and deployment → Source: GitHub Actions.**
3. Push to `main` (or Actions → "Deploy to GitHub Pages" → Run workflow).
4. Live at `https://<user>.github.io/<repo>/`. The build uses a relative base, so it
   works on that subpath today and on a custom domain (cedarlakelawn.com) later with
   no change — just add the domain under Settings → Pages and a `CNAME`.

That URL is what goes on the door hangers, yard signs, and Nextdoor posts.

## How it works

- **Address → parcel:** typeahead + lookup against the WI statewide parcel ArcGIS
  service (no key), gated to served counties; US Census geocoder as the "Find" fallback.
- **Lawn area:** estimated from the measured lot (`min(lot × COVERAGE_FACTOR, MOW_CAP_SQFT)`),
  capped so big/lake lots don't balloon; drag-to-adjust recomputes from the drawn polygon.
- **Map:** MapLibre GL + Esri World Imagery (no key). Geometry math via turf.
- **Booking:** "Text to book" opens the customer's messaging app pre-filled with their
  address, service, price, cadence, and an agreement line (the no-contract record), and
  records the lead.

See [`CLAUDE.md`](CLAUDE.md) for architecture, constraints, and the backlog.
