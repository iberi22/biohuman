/**
 * Ported from openGym's `bar.test.js`, minus the cases that need the 1,324-entry catalogue (those
 * arrive with it in Wave 3).
 *
 * The case that carries the weight is the stored 0: it means "this exercise has no bar", not
 * "unset, use the default". The editor deletes the key when it wants the default back.
 */
import { describe, expect, it } from 'vitest'
import {
  BAR_EQ,
  barWeightFor,
  DEFAULT_BAR_KG,
  DEFAULT_BAR_LB,
  defaultBarWeight,
  hasBarOverride,
  isNoBar,
  plateSplit,
  usesBar,
} from './bar'

describe('bar equipment', () => {
  it('covers exactly the five bar types', () => {
    expect([...BAR_EQ].sort()).toEqual([
      'barbell',
      'ez barbell',
      'olympic barbell',
      'smith machine',
      'trap bar',
    ])
  })

  it('answers for every bar type and nothing else', () => {
    for (const eq of BAR_EQ) {
      expect(usesBar(eq), eq).toBe(true)
    }
    expect(usesBar('dumbbell')).toBe(false)
    expect(usesBar('body weight')).toBe(false)
    expect(usesBar('no-such-eq')).toBe(false)
    expect(usesBar(null)).toBe(false)
    expect(usesBar(undefined)).toBe(false)
  })
})

describe('per-unit defaults', () => {
  it('gives every bar type a default in both units', () => {
    for (const eq of BAR_EQ) {
      expect(DEFAULT_BAR_KG[eq], eq).toBeGreaterThan(0)
      expect(DEFAULT_BAR_LB[eq], eq).toBeGreaterThan(0)
    }
    expect(defaultBarWeight('ez barbell', 'kg')).toBe(10)
    expect(defaultBarWeight('ez barbell', 'lb')).toBe(25)
    expect(defaultBarWeight('olympic barbell', 'kg')).toBe(20)
    // A lb profile gets the bar its gym actually racks, not a 44.1 lb conversion.
    expect(defaultBarWeight('barbell', 'lb')).toBe(45)
    expect(defaultBarWeight('dumbbell', 'kg')).toBeNull()
    expect(defaultBarWeight('barbell', 'kg')).toBe(20)
  })
})

describe('barWeightFor', () => {
  const barbell = 'bench'
  const ez = 'curl'

  it('falls back to the equipment default in the profile unit', () => {
    expect(barWeightFor({}, barbell, 'barbell', 'kg')).toBe(20)
    expect(barWeightFor({}, barbell, 'barbell', 'lb')).toBe(45)
    expect(barWeightFor(undefined, ez, 'ez barbell', 'kg')).toBe(10)
  })

  it('lets an explicit override win over the default', () => {
    const barWeights = { [ez]: 7.5 }
    expect(barWeightFor(barWeights, ez, 'ez barbell', 'kg')).toBe(7.5)
    expect(hasBarOverride(barWeights, ez)).toBe(true)
    expect(barWeightFor(barWeights, barbell, 'barbell', 'kg')).toBe(20) // others keep the default
    expect(hasBarOverride(barWeights, barbell)).toBe(false)
  })

  it('treats a deleted override as the default, but a stored 0 as "no bar"', () => {
    const barWeights: Record<string, number> = { [ez]: 12.5 }
    delete barWeights[ez]
    expect(barWeightFor(barWeights, ez, 'ez barbell', 'kg')).toBe(10)
    // 0 used to mean "clear this override". It now means the exercise has no bar (a
    // counterbalanced Smith carriage), which is a value of its own.
    expect(barWeightFor({ [ez]: 0 }, ez, 'ez barbell', 'kg')).toBe(0)
    expect(hasBarOverride({ [ez]: 0 }, ez)).toBe(true)
    expect(isNoBar({ [ez]: 0 }, ez)).toBe(true)
    expect(isNoBar({ [ez]: 12.5 }, ez)).toBe(false)
    expect(isNoBar({}, ez)).toBe(false)
  })

  it('is null for anything without a bar', () => {
    expect(barWeightFor({}, 'x', 'dumbbell', 'kg')).toBeNull()
    expect(barWeightFor({}, 'x', 'body weight', 'kg')).toBeNull()
  })
})

describe('plateSplit', () => {
  it('splits what is beyond the bar evenly per side', () => {
    expect(plateSplit(62.5, 20)).toBe(21.25)
    expect(plateSplit(100, 20)).toBe(40)
    expect(plateSplit(30, 10)).toBe(10)
  })

  it('rounds to 2 decimals', () => {
    expect(plateSplit(65.55, 20)).toBe(22.78)
    expect(plateSplit(21.2, 20)).toBe(0.6)
  })

  it('is null when there is nothing sensible to show', () => {
    expect(plateSplit(20, 20)).toBeNull() // bar only
    expect(plateSplit(15, 20)).toBeNull() // below the bar
    expect(plateSplit(0, 20)).toBeNull()
    expect(plateSplit(null, 20)).toBeNull()
    expect(plateSplit(100, null)).toBeNull()
    expect(plateSplit(undefined, undefined)).toBeNull()
  })

  it('splits the whole total when there is no bar at all', () => {
    // a counterbalanced Smith carriage: every kilo you logged is on the ends
    expect(plateSplit(100, 0)).toBe(50)
    expect(plateSplit(62.5, 0)).toBe(31.25)
  })
})