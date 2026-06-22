/* =====================================================================
   Drag-to-adjust the lawn, with Terra Draw (MapLibre GL adapter).

   We start from the measured parcel polygon and let the customer nudge the
   corners to match what's actually mowed — drag a dot to move it, drag a
   midpoint to add a corner, double-tap a dot to delete it. Area is recomputed
   from the edited polygon so the price reflects what they drew.
   ===================================================================== */

import { TerraDraw, TerraDrawPolygonMode, TerraDrawSelectMode } from 'terra-draw';
import { TerraDrawMapLibreGLAdapter } from 'terra-draw-maplibre-gl-adapter';
import area from '@turf/area';
import type { Map as MlMap } from 'maplibre-gl';

const SQM_TO_SQFT = 10.7639;

let draw: TerraDraw | null = null;
let onAreaCb: ((sqft: number) => void) | null = null;

function totalSqft(): number {
  if (!draw) return 0;
  let sqft = 0;
  for (const f of draw.getSnapshot()) {
    if (f.geometry?.type === 'Polygon') sqft += area(f as any) * SQM_TO_SQFT;
  }
  return sqft;
}

function ensureDraw(map: MlMap): TerraDraw {
  if (draw) return draw;
  draw = new TerraDraw({
    adapter: new TerraDrawMapLibreGLAdapter({ map: map as any }),
    modes: [
      new TerraDrawPolygonMode(),
      new TerraDrawSelectMode({
        flags: {
          polygon: {
            feature: {
              draggable: true,
              coordinates: { draggable: true, midpoints: true, deletable: true },
            },
          },
        },
      }),
    ],
  });
  draw.on('change', () => {
    if (onAreaCb) onAreaCb(totalSqft());
  });
  return draw;
}

/** Outer ring of a Polygon, or the largest polygon's ring of a MultiPolygon. */
function outerRing(geom: any): number[][] {
  if (geom?.type === 'MultiPolygon') {
    let best = geom.coordinates[0][0];
    for (const poly of geom.coordinates) if (poly[0].length > best.length) best = poly[0];
    return best;
  }
  return geom.coordinates[0];
}

/** Scale a closed ring toward its centroid (factor<1 shrinks it). */
function scaleRing(ring: number[][], factor: number): number[][] {
  const pts = ring.slice(0, -1); // drop the closing duplicate
  let cx = 0, cy = 0;
  for (const [x, y] of pts) { cx += x; cy += y; }
  cx /= pts.length;
  cy /= pts.length;
  const out = pts.map(([x, y]) => [cx + (x - cx) * factor, cy + (y - cy) * factor]);
  out.push(out[0]); // re-close
  return out;
}

function ringSqft(ring: number[][]): number {
  return area({ type: 'Feature', properties: {}, geometry: { type: 'Polygon', coordinates: [ring] } } as any) * SQM_TO_SQFT;
}

/** Enter adjust mode. The editable polygon starts shrunk to ≈ `targetSqft` (the
 *  current estimate) so the price doesn't jump; `onArea` fires live as it changes. */
export function startAdjust(map: MlMap, geometry: any, targetSqft: number, onArea: (sqft: number) => void): void {
  const d = ensureDraw(map);
  onAreaCb = onArea;
  const ring = outerRing(geometry);
  const lot = ringSqft(ring);
  const factor = lot > 0 ? Math.min(1, Math.sqrt(targetSqft / lot)) : 1;
  const startRing = factor < 0.999 ? scaleRing(ring, factor) : ring;
  d.start();
  d.clear();
  d.addFeatures([
    { type: 'Feature', properties: { mode: 'polygon' }, geometry: { type: 'Polygon', coordinates: [startRing] } } as any,
  ]);
  const snap = d.getSnapshot();
  const id = snap.length ? snap[snap.length - 1].id : undefined;
  if (id != null) {
    d.setMode('select');
    d.selectFeature(id);
  }
}

/** Exit adjust mode; returns the final lawn area + edited geometry (or null). */
export function stopAdjust(): { sqft: number; geometry: any } | null {
  onAreaCb = null;
  if (!draw) return null;
  const f = draw.getSnapshot().find((x) => x.geometry?.type === 'Polygon');
  const result = f ? { sqft: area(f as any) * SQM_TO_SQFT, geometry: f.geometry } : null;
  draw.stop();
  return result;
}
