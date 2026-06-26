/* =====================================================================
   EDIT THESE — all tunable business values live here.
   Pricing:  base       = max(MIN_PRICE, mowable_sqft * RATE_PER_SQFT)
             tier price  = round( base + tier.add , ROUND_TO )
   ===================================================================== */

export interface Tier {
  id: string;
  name: string;
  inc: string;
  blurb: string;
  add: number;
}

export const CONFIG = {
  BUSINESS_NAME: 'Cedar Lake Lawn Co.', // matches the domain cedarlakelawn.com
  PHONE: '2623431594', // (262) 343-1594
  OWNER_EMAIL: '', // where new leads are sent (set before deploy)
  SERVICE_AREA: 'Washington · Waukesha · Ozaukee County, WI',
  FOOTER_AREA: 'Serving West Bend, Lisbon, Sussex & nearby towns in SE Wisconsin.',

  // Hero trust badges. Only claim what's true — add 'Fully insured' back here once
  // you actually carry general-liability coverage.
  TRUST: ['Locally owned', 'No contracts', 'Same crew every time', 'Satisfaction guaranteed'] as string[],

  // "Switch & save" welcome offer (marketing hook): we MATCH a new customer's current
  // price, then take this % off on top, to earn the relationship. Used in the copy + text.
  WELCOME_DISCOUNT_PCT: 10,

  // pricing
  RATE_PER_SQFT: 0.009,
  MIN_PRICE: 40,
  ROUND_TO: 5,

  // Wisconsin taxes lawn / landscaping services — Wis. Stat. §77.52(2)(a)20, DOR Pub 210.
  // State 5% + any county tax. Shown as "+ tax" on the quote.
  TAX_RATE: 0.05,
  SHOW_TAX: true,

  // Hard timeout for every external request (parcel service, geocoder). Keeps a
  // stalled service from leaving the UI spinning — it surfaces the error panel instead.
  FETCH_TIMEOUT_MS: 8000,

  // map defaults — MapLibre uses [lng, lat]
  MAP_CENTER: [-88.246, 43.381] as [number, number], // Big & Little Cedar Lake, WI
  START_ZOOM: 12.5,
  PARCEL_ZOOM: 18,

  // Mowable lawn = min(lot × COVERAGE_FACTOR, MOW_CAP_SQFT). We estimate from the
  // measured lot — parcel data can't see the actual mowed area, and lot size stops
  // predicting lawn on big/lake/rural parcels. So big lots are capped and flagged for
  // an on-site confirm. Tune these three against lawns you know the right price for.
  COVERAGE_FACTOR: 0.45, // share of a normal lot that's mowable lawn (house/drive/beds take the rest)
  MOW_CAP_SQFT: 15500, // max auto-quoted lawn area (≈ $140 at the default rate — the big-lot cap)
  CONFIRM_ACRES: 1.0, // lots bigger than this show "starting price, we confirm on-site"

  CADENCES: ['Weekly', 'Every other week', 'One-time'] as const,

  TIERS: [
    {
      id: 'cut',
      name: 'The Cut',
      inc: 'Mow · leaf-blow · general trim',
      blurb:
        'A clean cut — mowed, trimmed along the edges, and everything blown off your walks and drive. The essentials, done right.',
      add: 0,
    },
    {
      id: 'edge',
      name: 'Fresh Edge',
      inc: '+ crisp edging on walks & drive',
      blurb:
        'Everything in The Cut, plus a sharp mechanical edge along your walks and driveway. The detail that makes a yard look finished.',
      add: 15,
    },
    {
      id: 'premier',
      name: 'Premier Trim',
      inc: '+ bed trim & detail finish',
      blurb:
        'Our full finish — Fresh Edge plus tidy bed lines and the extra detail work. For the yard you want to show off.',
      add: 35,
    },
  ] as Tier[],
};
