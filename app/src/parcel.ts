/* =====================================================================
   Address → parcel polygon → mowable area.  No API key.

   Two ways in:
     - searchAddress(q)        : authoritative typeahead straight from the parcel
                                 data (gated to served counties); pick one to get
                                 its parcel instantly.
     - getParcelAtPoint(lng,lat): snap a geocoded/clicked point to the nearest
                                 parcel (a buffer handles street-centerline geocodes).

   Mowable lawn is ESTIMATED from the measured lot: min(lot × COVERAGE_FACTOR,
   MOW_CAP_SQFT). Parcel data can't see the actual mowed area, and lot size stops
   predicting lawn on big/lake/rural lots — so those are capped and flagged for an
   on-site confirm.

   Units: turf area() returns SQUARE METRES for EPSG:4326 GeoJSON (geodesic), so
   we ×10.7639 → square feet. We ALWAYS compute area from geometry — county
   acreage attributes (GISACRES) are null in some counties and must not be trusted.
   ===================================================================== */

import area from '@turf/area';
import { CONFIG } from './config';
import { STATEWIDE_PARCELS, SERVED_COUNTIES, isServed } from './counties';
import { fetchJson } from './net';

const SQM_TO_SQFT = 10.7639;
const SQFT_PER_ACRE = 43560;
const SNAP_BUFFER_M = 35; // snap a near-miss geocode to a parcel within this radius

export interface AddressMatch {
  address: string;
  county: string;
  objectId: number;
}

export interface ParcelResult {
  served: boolean;
  county: string | null;
  address: string | null;
  acres: number; // derived from geometry, not the (often-null) attribute
  parcelId: string | null;
  geometry: any | null; // GeoJSON Polygon | MultiPolygon — loose at the IO boundary
  lotSqft: number;
  mowableSqft: number; // estimated mowable lawn (capped)
  large: boolean; // big/lake/rural lot — show a starting price + on-site confirm
}

const SERVED_SQL = SERVED_COUNTIES.map((c) => `'${c}'`).join(',');
// only the fields we actually use — avoids pulling owner names / sale prices into the browser
const OUT_FIELDS = `${STATEWIDE_PARCELS.fields.parcelId},${STATEWIDE_PARCELS.fields.address},${STATEWIDE_PARCELS.fields.county}`;
const STREET_SUFFIXES = new Set([
  'ST', 'STREET', 'AVE', 'AVENUE', 'RD', 'ROAD', 'DR', 'DRIVE', 'LN', 'LANE',
  'CT', 'COURT', 'BLVD', 'WAY', 'PL', 'PLACE', 'CIR', 'CIRCLE', 'TER', 'TERRACE',
  'TRL', 'TRAIL', 'PKWY', 'PARKWAY', 'HWY', 'HIGHWAY', 'CV', 'COVE', 'RUN', 'PASS',
]);

const DIRECTIONALS: Record<string, string> = {
  NORTH: 'N', SOUTH: 'S', EAST: 'E', WEST: 'W',
  NORTHEAST: 'NE', NORTHWEST: 'NW', SOUTHEAST: 'SE', SOUTHWEST: 'SW',
};

/** Build LIKE prefixes for the typed text. Parcel data abbreviates directionals
 *  ("4755 S BLUE HERON DR"), but people type "4755 South ...", so we search BOTH the
 *  as-typed form AND the directional-abbreviated form. Trailing street-type words are
 *  dropped (counties differ: "ST" vs "STREET"). Single quotes escaped for the WHERE. */
export function likeVariants(q: string): string[] {
  // strip LIKE wildcards (% _ \) so typed text matches literally, then normalize spacing
  let tokens = q.trim().toUpperCase().replace(/[%_\\]/g, '').replace(/\s+/g, ' ').split(' ');
  if (tokens.length > 2 && STREET_SUFFIXES.has(tokens[tokens.length - 1])) {
    tokens = tokens.slice(0, -1);
  }
  const original = tokens.join(' ');
  const abbreviated = tokens.map((t) => DIRECTIONALS[t] ?? t).join(' ');
  return [...new Set([original, abbreviated])]
    .map((s) => s.replace(/'/g, "''"))
    .filter((s) => s.length >= 3);
}

async function arcgis(url: string, params: Record<string, string>): Promise<any> {
  return fetchJson(`${url}/query?${new URLSearchParams(params)}`);
}

/** Authoritative address typeahead from the parcel data, served counties only. */
export async function searchAddress(q: string): Promise<AddressMatch[]> {
  const variants = likeVariants(q);
  if (!variants.length) return [];
  const likeClause = variants.map((v) => `SITEADRESS LIKE '${v}%'`).join(' OR ');
  const data = await arcgis(STATEWIDE_PARCELS.url, {
    where: `(${likeClause}) AND CONAME IN (${SERVED_SQL})`,
    outFields: `OBJECTID,${STATEWIDE_PARCELS.fields.address},${STATEWIDE_PARCELS.fields.county}`,
    orderByFields: STATEWIDE_PARCELS.fields.address,
    resultRecordCount: '7',
    returnGeometry: 'false',
    f: 'json',
  });
  const f = STATEWIDE_PARCELS.fields;
  const seen = new Set<string>();
  const out: AddressMatch[] = [];
  for (const x of data?.features ?? []) {
    const a = x.attributes;
    const address = a[f.address];
    const key = `${address}|${a[f.county]}`;
    if (!address || seen.has(key)) continue;
    seen.add(key);
    out.push({ address, county: a[f.county], objectId: a.OBJECTID });
  }
  return out;
}

/** Fetch a specific parcel by its OBJECTID (after the user picks a suggestion). */
export async function getParcelByObjectId(objectId: number): Promise<ParcelResult> {
  const data = await arcgis(STATEWIDE_PARCELS.url, {
    objectIds: String(objectId),
    outFields: OUT_FIELDS,
    returnGeometry: 'true',
    outSR: '4326',
    f: 'geojson',
  });
  const feat = data?.features?.[0];
  if (!feat) return emptyResult(null, false);
  return buildResult(feat);
}

/** Snap a point (geocoded or clicked) to the nearest parcel within the buffer. */
export async function getParcelAtPoint(lng: number, lat: number): Promise<ParcelResult> {
  const data = await arcgis(STATEWIDE_PARCELS.url, {
    geometry: `${lng},${lat}`,
    geometryType: 'esriGeometryPoint',
    inSR: '4326',
    distance: String(SNAP_BUFFER_M),
    units: 'esriSRUnit_Meter',
    spatialRel: 'esriSpatialRelIntersects',
    outFields: OUT_FIELDS,
    returnGeometry: 'true',
    outSR: '4326',
    f: 'geojson',
  });
  const feats: any[] = data?.features ?? [];
  if (!feats.length) return emptyResult(null, false);
  const feat = pickNearest(feats, lng, lat);
  return buildResult(feat);
}

// --- internals ---------------------------------------------------------

async function buildResult(feat: any): Promise<ParcelResult> {
  const f = STATEWIDE_PARCELS.fields;
  const props = feat.properties ?? {};
  const county = (props[f.county] ?? null) as string | null;
  if (!isServed(county)) return emptyResult(county, false);

  const geometry = feat.geometry;
  const lotSqft = area(feat) * SQM_TO_SQFT;
  // degenerate / condo / stacked / sliver parcel — don't quote a confident $40; capture instead
  if (!geometry || lotSqft < 400) return emptyResult(null, false);
  const acres = lotSqft / SQFT_PER_ACRE;

  // estimate mowable lawn from the lot, capped so big lots don't balloon
  const mowableSqft = Math.min(lotSqft * CONFIG.COVERAGE_FACTOR, CONFIG.MOW_CAP_SQFT);
  const large =
    acres > CONFIG.CONFIRM_ACRES || lotSqft * CONFIG.COVERAGE_FACTOR > CONFIG.MOW_CAP_SQFT;

  return {
    served: true,
    county,
    address: (props[f.address] ?? null) as string | null,
    acres,
    parcelId: (props[f.parcelId] ?? null) as string | null,
    geometry,
    lotSqft,
    mowableSqft,
    large,
  };
}

function emptyResult(county: string | null, served: boolean): ParcelResult {
  return {
    served, county, address: null, acres: 0, parcelId: null, geometry: null,
    lotSqft: 0, mowableSqft: 0, large: false,
  };
}

/** Prefer a parcel that contains the point; otherwise the nearest by centroid. */
function pickNearest(feats: any[], lng: number, lat: number): any {
  let best = feats[0];
  let bestD = Infinity;
  const kx = Math.cos((lat * Math.PI) / 180); // a degree of longitude is shorter at this latitude
  for (const feat of feats) {
    if (containsPoint(feat.geometry, lng, lat)) return feat;
    const [cx, cy] = centroid(feat.geometry);
    const d = ((cx - lng) * kx) ** 2 + (cy - lat) ** 2;
    if (d < bestD) { bestD = d; best = feat; }
  }
  return best;
}

function outerRings(geom: any): number[][][] {
  if (!geom) return [];
  return geom.type === 'MultiPolygon' ? geom.coordinates.map((p: number[][][]) => p[0]) : [geom.coordinates[0]];
}

function centroid(geom: any): [number, number] {
  let x = 0, y = 0, n = 0;
  for (const ring of outerRings(geom)) for (const [px, py] of ring) { x += px; y += py; n++; }
  return n ? [x / n, y / n] : [0, 0];
}

function containsPoint(geom: any, lng: number, lat: number): boolean {
  for (const ring of outerRings(geom)) {
    let inside = false;
    for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
      const [xi, yi] = ring[i];
      const [xj, yj] = ring[j];
      if (yi > lat !== yj > lat && lng < ((xj - xi) * (lat - yi)) / (yj - yi) + xi) inside = !inside;
    }
    if (inside) return true;
  }
  return false;
}
