/* =====================================================================
   Pricing — single source of truth is CONFIG.
   base       = max(MIN_PRICE, mowable_sqft * RATE_PER_SQFT)
   tier price  = round( base + tier.add , ROUND_TO )
   ===================================================================== */

import { CONFIG } from './config';
import type { Tier } from './config';

export const roundTo = (v: number): number =>
  Math.round(v / CONFIG.ROUND_TO) * CONFIG.ROUND_TO;

export const basePrice = (sqft: number): number =>
  Math.max(CONFIG.MIN_PRICE, sqft * CONFIG.RATE_PER_SQFT);

export const tierPrice = (sqft: number, add: number): number =>
  roundTo(basePrice(sqft) + add);

/** Price with WI service tax added, rounded to the cent. */
export const withTax = (price: number): number =>
  CONFIG.SHOW_TAX ? Math.round(price * (1 + CONFIG.TAX_RATE) * 100) / 100 : price;

export const tierById = (id: string): Tier | undefined =>
  CONFIG.TIERS.find((t) => t.id === id);
