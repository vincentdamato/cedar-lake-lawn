/* MapLibre satellite map (Esri World Imagery raster tiles, no API key).
   Renders the looked-up parcel polygon and fits the view to it. */

import maplibregl, {
  type StyleSpecification,
  type GeoJSONSource,
  type LngLatBoundsLike,
} from 'maplibre-gl';

const ESRI =
  'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}';

const STYLE: StyleSpecification = {
  version: 8,
  sources: {
    esri: {
      type: 'raster',
      tiles: [ESRI],
      tileSize: 256,
      maxzoom: 19,
      attribution: 'Imagery &copy; Esri',
    },
  },
  layers: [{ id: 'esri', type: 'raster', source: 'esri' }],
};

const EMPTY = { type: 'FeatureCollection', features: [] } as const;

export function createMap(container: string, center: [number, number], zoom: number): maplibregl.Map {
  const map = new maplibregl.Map({
    container,
    style: STYLE,
    center,
    zoom,
    maxZoom: 20, // Esri imagery is native to z19; one overzoom level avoids gray tiles
    cooperativeGestures: true, // mobile: one finger scrolls the page, two fingers pan the map
  });
  map.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'top-right');
  map.on('load', () => {
    map.addSource('parcel', { type: 'geojson', data: EMPTY as any });
    map.addLayer({
      id: 'parcel-fill', type: 'fill', source: 'parcel',
      paint: { 'fill-color': '#5fb83f', 'fill-opacity': 0.28 },
    });
    map.addLayer({
      id: 'parcel-line', type: 'line', source: 'parcel',
      paint: { 'line-color': '#5fb83f', 'line-width': 3 },
    });
  });
  return map;
}

export function showParcel(map: maplibregl.Map, geometry: any): void {
  const parcelFeature = { type: 'Feature', properties: {}, geometry };
  const apply = () => {
    (map.getSource('parcel') as GeoJSONSource).setData(parcelFeature as any);
    map.fitBounds(boundsOf(geometry), { padding: 44, maxZoom: 20, duration: 650 });
  };
  if (map.getSource('parcel')) apply();
  else map.once('load', apply);
}

export function clearParcel(map: maplibregl.Map): void {
  const src = map.getSource('parcel') as GeoJSONSource | undefined;
  if (src) src.setData(EMPTY as any);
}

function boundsOf(geom: any): LngLatBoundsLike {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  const rings = geom.type === 'MultiPolygon' ? geom.coordinates.flat() : geom.coordinates;
  for (const ring of rings) {
    for (const [x, y] of ring) {
      if (x < minX) minX = x;
      if (y < minY) minY = y;
      if (x > maxX) maxX = x;
      if (y > maxY) maxY = y;
    }
  }
  return [[minX, minY], [maxX, maxY]];
}
