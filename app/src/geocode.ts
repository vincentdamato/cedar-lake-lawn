/* =====================================================================
   Address → coordinates, no API key.

   geocode() resolves free-text to a point via the US Census geocoder (free, no
   key, storage-safe). It's the "Find my lawn" fallback for when someone types an
   address but doesn't pick one of the parcel-data suggestions. Best-effort.
   ===================================================================== */

import { fetchJson } from './net';

export interface GeoResult {
  lng: number;
  lat: number;
  label: string;
}

const CENSUS = 'https://geocoding.geo.census.gov/geocoder/locations/onelineaddress';

/** Resolve a free-text address to a single point. Returns null if no match. */
export async function geocode(address: string): Promise<GeoResult | null> {
  const url = `${CENSUS}?address=${encodeURIComponent(address)}&benchmark=Public_AR_Current&format=json`;
  const data = await fetchJson(url);
  const m = data?.result?.addressMatches?.[0];
  if (!m) return null;
  return { lng: m.coordinates.x, lat: m.coordinates.y, label: m.matchedAddress };
}
