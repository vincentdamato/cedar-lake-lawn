/* =====================================================================
   Served counties + GIS data sources.

   Parcels come from the WI Statewide Parcel service (no key, point-queryable,
   uniform schema across all 72 counties). It's a public ArcGIS REST service and
   requires no API key.
   ===================================================================== */

export interface ParcelSource {
  url: string;
  fields: {
    parcelId: string;
    address: string;
    acres: string;
    improvementValue: string;
    county: string;
  };
}

// WI Statewide Parcels — verified: returns the parcel polygon + attributes from a
// raw lat/lng point with no token. Spatial ref in/out negotiated as EPSG:4326.
export const STATEWIDE_PARCELS: ParcelSource = {
  url: 'https://services3.arcgis.com/n6uYoouQZW75n5WI/arcgis/rest/services/Wisconsin_Statewide_Parcels/FeatureServer/0',
  fields: {
    parcelId: 'PARCELID',
    address: 'SITEADRESS',
    acres: 'GISACRES',
    improvementValue: 'IMPVALUE',
    county: 'CONAME',
  },
};

// County names we serve, matching the statewide CONAME field (uppercase).
export const SERVED_COUNTIES = ['WASHINGTON', 'WAUKESHA', 'OZAUKEE'] as const;
export type ServedCounty = (typeof SERVED_COUNTIES)[number];

export function isServed(county: string | null | undefined): boolean {
  if (!county) return false;
  return (SERVED_COUNTIES as readonly string[]).includes(county.toUpperCase());
}
