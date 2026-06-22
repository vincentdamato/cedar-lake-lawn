import { describe, it, expect } from 'vitest';
import { CONFIG } from './config';
import { roundTo, basePrice, tierPrice, withTax, tierById } from './quote';

describe('pricing', () => {
  it('roundTo snaps to ROUND_TO', () => {
    expect(roundTo(0) % CONFIG.ROUND_TO).toBe(0);
    expect(roundTo(67.5)).toBe(Math.round(67.5 / CONFIG.ROUND_TO) * CONFIG.ROUND_TO);
  });

  it('basePrice never drops below the floor', () => {
    expect(basePrice(0)).toBe(CONFIG.MIN_PRICE);
    expect(basePrice(-100)).toBe(CONFIG.MIN_PRICE);
    expect(basePrice(1e9)).toBeGreaterThan(CONFIG.MIN_PRICE);
  });

  it('tierPrice is floored and rounded', () => {
    expect(tierPrice(0, 0)).toBeGreaterThanOrEqual(CONFIG.MIN_PRICE);
    expect(tierPrice(12000, 0) % CONFIG.ROUND_TO).toBe(0);
  });

  it('a pricier tier never costs less', () => {
    expect(tierPrice(12000, 50)).toBeGreaterThanOrEqual(tierPrice(12000, 0));
  });

  it('price is non-decreasing in lawn size', () => {
    expect(tierPrice(20000, 0)).toBeGreaterThanOrEqual(tierPrice(5000, 0));
  });

  it('withTax applies the configured rate', () => {
    expect(withTax(100)).toBeCloseTo(100 * (1 + CONFIG.TAX_RATE), 2);
  });

  it('tierById resolves real tiers and nothing else', () => {
    expect(tierById(CONFIG.TIERS[0].id)?.name).toBe(CONFIG.TIERS[0].name);
    expect(tierById('does-not-exist')).toBeUndefined();
  });
});
