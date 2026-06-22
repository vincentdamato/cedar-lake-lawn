import { describe, it, expect } from 'vitest';
import { likeVariants } from './parcel';

describe('address normalization (likeVariants)', () => {
  it('abbreviates directionals so "South" matches the stored "S"', () => {
    // the bug we fixed: "4755 South Blue Heron" must reach "4755 S BLUE HERON DR"
    expect(likeVariants('4755 South Blue Heron')).toContain('4755 S BLUE HERON');
  });

  it('the partial case "4755 South" yields the abbreviated prefix', () => {
    expect(likeVariants('4755 South')).toContain('4755 S');
  });

  it('keeps the spelled-out form too (for streets named after a direction)', () => {
    const v = likeVariants('1234 South Lake');
    expect(v).toContain('1234 SOUTH LAKE'); // street literally named "South Lake"
    expect(v).toContain('1234 S LAKE'); // directional interpretation
  });

  it('drops a trailing street-type word (ST vs STREET county differences)', () => {
    expect(likeVariants('215 N Main St')).toContain('215 N MAIN');
    expect(likeVariants('215 N Main Street')).toContain('215 N MAIN');
  });

  it('handles all directionals incl. NE/NW/SE/SW', () => {
    expect(likeVariants('100 Northwest Foo')).toContain('100 NW FOO');
    expect(likeVariants('100 West Foo')).toContain('100 W FOO');
  });

  it('uppercases and collapses whitespace', () => {
    expect(likeVariants('  4755   south   blue  heron ')).toContain('4755 S BLUE HERON');
  });

  it('escapes single quotes for the WHERE clause', () => {
    expect(likeVariants("123 O'Brien Ave").some((s) => s.includes("O''BRIEN"))).toBe(true);
  });

  it('ignores too-short input', () => {
    expect(likeVariants('ab')).toEqual([]);
  });
});
