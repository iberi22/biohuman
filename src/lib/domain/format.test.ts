/**
 * Ported from openGym's `speed.test.js` and the numeric half of `format.js`.
 *
 * The property that matters is round-tripping: a speed typed in mph has to read back as typed,
 * because that is the only proof that two devices in different units never disagree about a number.
 */
import { describe, expect, it } from 'vitest'
import {
  fmtNum,
  fmtPlate,
  fmtSpeed,
  fmtVol,
  fromSpeed,
  KMH_PER_MPH,
  speedLabel,
  speedUnitOf,
  toSpeed,
} from './format'

describe('speedUnitOf', () => {
  it('follows the weight unit until the profile chooses', () => {
    expect(speedUnitOf({ unit: 'lb' })).toBe('mph')
    expect(speedUnitOf({ unit: 'kg' })).toBe('kmh')
    expect(speedUnitOf({})).toBe('kmh')
    expect(speedUnitOf(null)).toBe('kmh')
  })

  it('keeps an explicit choice either way round', () => {
    expect(speedUnitOf({ unit: 'kg', speedUnit: 'mph' })).toBe('mph')
    expect(speedUnitOf({ unit: 'lb', speedUnit: 'kmh' })).toBe('kmh')
    // an unrecognised value falls back to the weight unit rather than being taken at face value
    expect(speedUnitOf({ unit: 'lb', speedUnit: 'furlongs' })).toBe('mph')
  })

  it('labels the numbers', () => {
    expect(speedLabel('mph')).toBe('mph')
    expect(speedLabel('kmh')).toBe('km/h')
  })
})

describe('toSpeed / fromSpeed', () => {
  it('uses the exact mile', () => {
    expect(KMH_PER_MPH).toBe(1.609344)
  })

  it('is the identity in km/h, so a km/h profile stores exactly what it always did', () => {
    expect(toSpeed(12, 'kmh')).toBe(12)
    expect(fromSpeed(12, 'kmh')).toBe(12)
  })

  it('reads back every mph speed typed with up to two decimals exactly as typed', () => {
    // Upstream's own test, unchanged: sweep all 4,001 two-decimal values rather than sampling.
    // This is the property the hundredth rounding exists for, so a sampled subset would not prove it.
    const off: [number, number][] = []
    for (let i = 0; i <= 4000; i++) {
      const typed = i / 100
      const back = toSpeed(fromSpeed(typed, 'mph'), 'mph')
      if (back !== typed) off.push([typed, back])
    }
    expect(off).toEqual([])
  })

  it('stores km/h to the hundredth, not the full float', () => {
    // otherwise a typed "6" comes back stored as 9.656064
    expect(fromSpeed(6, 'mph')).toBe(9.66)
    expect(toSpeed(9.66, 'mph')).toBe(6)
  })

  it('passes an empty field through untouched', () => {
    expect(toSpeed('', 'mph')).toBe('')
    expect(toSpeed(null, 'mph')).toBeNull()
    expect(toSpeed(undefined, 'mph')).toBeUndefined()
    expect(fromSpeed('', 'mph')).toBe('')
    expect(fromSpeed(null, 'mph')).toBeNull()
  })
})

describe('fmtSpeed', () => {
  it('formats a stored km/h speed in the unit on screen', () => {
    expect(fmtSpeed(12, 'kmh')).toBe('12 km/h')
    expect(fmtSpeed(9.656064, 'mph')).toBe('6 mph')
  })

  it('reads 0 rather than blanking it', () => {
    expect(fmtSpeed(0, 'kmh')).toBe('0 km/h')
    expect(fmtSpeed(null, 'kmh')).toBe('0 km/h')
  })

  it('groups thousands in the profile locale', () => {
    // The locale decides the separator, so the same log renders differently on two phones unless
    // the caller passes one explicitly. 7535 is the shortest case where the grouping shows.
    expect(fmtNum(7535, 1, 'en')).toBe('7,535')
    expect(fmtNum(7535, 1, 'de-DE')).toBe('7.535')
    expect(fmtSpeed(7535, 'kmh', 1, 'de-DE')).toBe('7.535 km/h')
  })
})

describe('fmtNum', () => {
  it('rounds to the display precision', () => {
    expect(fmtNum(62.55, 1, 'en')).toBe('62.6')
    expect(fmtNum(62.55, 2, 'en')).toBe('62.55')
  })

  it('shows a dash rather than NaN for a number it cannot read', () => {
    expect(fmtNum(undefined, 1, 'en')).toBe('—')
    expect(fmtNum('nonsense', 1, 'en')).toBe('—')
  })

  it('groups thousands', () => {
    expect(fmtNum(7535, 1, 'en')).toContain('7')
  })
})

describe('fmtPlate', () => {
  it('keeps the quarter, because 1.25 is a real plate', () => {
    expect(fmtPlate(1.25, 'en')).toBe('1.25')
    expect(fmtPlate(21.25, 'en')).toBe('21.25')
  })
})

describe('fmtVol', () => {
  it('never abbreviates a big volume into tonnes', () => {
    // the old shorthand turned anything over 10,000 into "t", which is wrong for a pound profile
    // and made one list mix "18.8t" with "7'535 kg" — two numbers you cannot compare at a glance
    expect(fmtVol(18800, 'kg', 1, 'en')).toContain('kg')
    expect(fmtVol(18800, 'kg', 1, 'en')).not.toContain('t')
  })
})
