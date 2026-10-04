/**
 * Ported from openGym's `plates.test.js`.
 *
 * The property that matters: what the app prints has to be a load the lifter's rack can actually
 * make. A drop rounded to .5 read 48.5 kg on a bar that only loads in 2.5s.
 */
import { beforeEach, describe, expect, it } from 'vitest'
import {
  baseWeightFor,
  DEFAULT_PAIRS,
  dropGrid,
  inventoryFor,
  loadKindFor,
  loadKindOf,
  ownsPlates,
  PLATE_SIZES,
  plateDelta,
  plateStack,
  registerEquipment,
  rowLoad,
  sameLoad,
  withLoadKind,
  withPlatePairs,
  withStandardPlates,
  type PlateSize,
  type PlateState,
} from './plates'

// Three exercises is enough: a bar, a dumbbell, and a bodyweight one.
beforeEach(() => {
  registerEquipment([
    ['bench-press', 'barbell'],
    ['dumbbell-curl', 'dumbbell'],
    ['push-up', 'body weight'],
    ['dip', 'weighted'],
  ])
})

const RACK: PlateSize[] = [
  { w: 20, n: 6 },
  { w: 15, n: 6 },
  { w: 10, n: 6 },
  { w: 5, n: 6 },
  { w: 2.5, n: 6 },
  { w: 1.25, n: 6 },
]

describe('inventoryFor', () => {
  it('falls back to the standard set when the profile has counted none', () => {
    const inv = inventoryFor({ unit: 'kg' })
    expect(inv.length).toBeGreaterThan(0)
    // heaviest first
    expect(inv[0].w).toBe(PLATE_SIZES.kg[0])
    for (let i = 1; i < inv.length; i++) expect(inv[i].w).toBeLessThan(inv[i - 1].w)
  })

  it('does not assume a home gym has quarter plates', () => {
    const kg = inventoryFor({ unit: 'kg' }).map(p => p.w)
    expect(kg).not.toContain(0.5)
    const lb = inventoryFor({ unit: 'lb' }).map(p => p.w)
    expect(lb).not.toContain(1.25)
  })

  it('holds plenty of each size, the way a rack does', () => {
    for (const p of inventoryFor({ unit: 'kg' })) expect(p.n).toBe(DEFAULT_PAIRS)
  })

  it('uses the profile unit, so a 45 lb plate stays a 45 lb plate', () => {
    expect(inventoryFor({ unit: 'lb' })[0].w).toBe(45)
    expect(inventoryFor({ unit: 'kg' })[0].w).toBe(25)
  })

  it('reads the profile own inventory when it has one', () => {
    const S: PlateState = { unit: 'kg', plates: { kg: { 20: 2, 5: 1, _ts: 1 } } }
    expect(ownsPlates(S)).toBe(true)
    expect(inventoryFor(S)).toEqual([
      { w: 20, n: 2 },
      { w: 5, n: 1 },
    ])
  })

  it('survives a missing or empty state', () => {
    expect(inventoryFor(null).length).toBeGreaterThan(0)
    expect(inventoryFor({}).length).toBeGreaterThan(0)
    expect(ownsPlates(null)).toBe(false)
  })
})

describe('stored choices carry the time they were made', () => {
  it('stamps a plate change, and copies the standard set in first', () => {
    const S = withPlatePairs({ unit: 'kg' }, 20, 2, 1234)
    expect(S.kg._ts).toBe(1234)
    expect(S.kg['20']).toBe(2)
    // the rest of the rack came with it, so the sheet shows the list the rows load from
    expect(Object.keys(S.kg).length).toBeGreaterThan(2)
  })

  it('stamps a return to the standard set rather than deleting the key', () => {
    // a deleted key loses a sync against the other device's older choice
    const S = withStandardPlates({ unit: 'kg', plates: { kg: { 20: 2, _ts: 1 } } }, 99)
    expect(S.kg._ts).toBe(99)
    expect(ownsPlates({ plates: S })).toBe(false)
  })

  it('reads a loading choice, and an explicit null falls back to the equipment', () => {
    expect(loadKindOf('pairs')).toBe('pairs')
    expect(loadKindOf({ kind: 'single' })).toBe('single')
    expect(loadKindOf(null)).toBeNull()
    expect(loadKindOf('nonsense')).toBeNull()
    const map = withLoadKind({}, 'bench-press', 'single', 7)
    expect(map['bench-press']).toEqual({ kind: 'single', _ts: 7 })
  })

  it('never stores a negative count', () => {
    expect(withPlatePairs({ unit: 'kg' }, 20, -3)['kg']['20']).toBe(0)
  })
})

describe('plateStack', () => {
  it('loads heaviest-first when greedy lands exactly, the way a bar is loaded', () => {
    expect(plateStack(40, RACK)).toEqual({ plates: [20, 20], missing: 0 })
    expect(plateStack(20, RACK)).toEqual({ plates: [20], missing: 0 })
    expect(plateStack(0, RACK)).toEqual({ plates: [], missing: 0 })
  })

  it('keeps the quarter exact rather than rounding a plate that exists', () => {
    // 1.25 and 2.5 are real plates; quarter-unit maths is what makes them exact
    expect(plateStack(1.25, RACK)).toEqual({ plates: [1.25], missing: 0 })
    expect(plateStack(3.75, RACK)).toEqual({ plates: [2.5, 1.25], missing: 0 })
  })

  it('finds an exact fit greedy misses, with the fewest plates', () => {
    // one of each size: greedy takes 20 and then cannot make 5, the search can
    const thin: PlateSize[] = [
      { w: 20, n: 1 },
      { w: 5, n: 1 },
      { w: 2.5, n: 1 },
      { w: 1.25, n: 2 },
    ]
    expect(plateStack(7.5, thin)).toEqual({ plates: [5, 2.5], missing: 0 })
  })

  it('biases a tie toward heavier plates', () => {
    const inv: PlateSize[] = [
      { w: 10, n: 1 },
      { w: 5, n: 2 },
    ]
    expect(plateStack(10, inv)).toEqual({ plates: [10], missing: 0 })
  })

  it('reports what the inventory cannot supply instead of rounding up', () => {
    const inv: PlateSize[] = [{ w: 20, n: 1 }]
    // 47.5 cannot be made from one 20; holding the closest load BELOW is honest
    const r = plateStack(47.5, inv)
    expect(r.plates).toEqual([20])
    expect(r.missing).toBe(27.5)
  })

  it('does not build a table as long as the target when the target exceeds the rack', () => {
    // a typo like 9999 in a weight field used to allocate a table per keystroke
    const r = plateStack(9999, RACK)
    expect(r.missing).toBeGreaterThan(0)
  })

  it('survives an empty inventory', () => {
    expect(plateStack(50, [])).toEqual({ plates: [], missing: 50 })
    expect(plateStack(50, null)).toEqual({ plates: [], missing: 50 })
  })
})

describe('plateDelta', () => {
  it('says what comes off and what goes on, heaviest first', () => {
    expect(plateDelta([20, 20, 5], [20, 15])).toEqual({ strip: [20, 5], add: [15] })
  })

  it('is empty on both sides when nothing changes', () => {
    expect(plateDelta([20, 5], [20, 5])).toEqual({ strip: [], add: [] })
  })

  it('handles going up and coming back down', () => {
    expect(plateDelta([10], [20, 5])).toEqual({ strip: [10], add: [20, 5] })
    expect(plateDelta([20, 5], [10])).toEqual({ strip: [20, 5], add: [10] })
  })

  it('survives a missing side', () => {
    expect(plateDelta(null, [20])).toEqual({ strip: [], add: [20] })
    expect(plateDelta([20], undefined)).toEqual({ strip: [20], add: [] })
  })
})

describe('loadKindFor', () => {
  it('splits a bar into two sides', () => {
    expect(loadKindFor({}, { id: 'bench-press' })).toBe('pairs')
  })

  it('has nothing to load for a dumbbell', () => {
    expect(loadKindFor({}, { id: 'dumbbell-curl' })).toBe('none')
  })

  it('loads one stack for a weighted exercise, because that is what you hang on', () => {
    expect(loadKindFor({}, { id: 'dip' })).toBe('single')
  })

  it('lets the profile own choice win over the equipment', () => {
    const S: PlateState = { loadKind: { 'dumbbell-curl': { kind: 'pairs' } } }
    expect(loadKindFor(S, { id: 'dumbbell-curl' })).toBe('pairs')
  })

  it('accepts an exercise id directly', () => {
    expect(loadKindFor({}, 'bench-press')).toBe('pairs')
  })

  it('treats an unknown exercise as nothing to load rather than throwing', () => {
    expect(loadKindFor({}, { id: 'no-such-exercise' })).toBe('none')
    expect(loadKindFor({}, undefined)).toBe('none')
  })
})

describe('baseWeightFor', () => {
  it('is the bar for a bar exercise', () => {
    expect(baseWeightFor({ unit: 'kg' }, 'bench-press')).toBe(20)
  })

  it('follows the profile unit rather than converting', () => {
    // a kg profile gets the 20 kg olympic bar; an lb profile the 45 lb one its gym racks
    expect(baseWeightFor({ unit: 'lb' }, 'bench-press')).toBe(45)
  })

  it('honours an override, including 0 for "no bar"', () => {
    // a counterbalanced Smith carriage puts nothing in your hands
    expect(baseWeightFor({ barWeights: { 'bench-press': 0 } }, 'bench-press')).toBe(0)
    expect(baseWeightFor({ barWeights: { 'bench-press': 15 } }, 'bench-press')).toBe(15)
  })

  it('is 0 for something with no bar', () => {
    expect(baseWeightFor({ unit: 'kg' }, 'dumbbell-curl')).toBe(0)
    expect(baseWeightFor({ unit: 'kg' }, 'no-such-exercise')).toBe(0)
    expect(baseWeightFor({ unit: 'kg' }, undefined)).toBe(0)
  })
})

describe('rowLoad', () => {
  it('has nothing to load when the kind is none', () => {
    expect(rowLoad('none', 60, 0, RACK)).toBeNull()
  })

  it('has nothing to load at zero weight', () => {
    expect(rowLoad('pairs', 0, 20, RACK)).toBeNull()
  })

  it('is bar-only at or below the bar', () => {
    expect(rowLoad('pairs', 20, 20, RACK)).toMatchObject({ barOnly: true, plates: [] })
    expect(rowLoad('pairs', 10, 20, RACK)).toMatchObject({ barOnly: true })
  })

  it('splits what is beyond the bar per side', () => {
    // 100 on a 20 bar is 40 a side
    expect(rowLoad('pairs', 100, 20, RACK)).toMatchObject({ perSide: 40, barOnly: false })
  })

  it('takes the whole load for a single stack', () => {
    expect(rowLoad('single', 40, 0, RACK)).toMatchObject({ perSide: 40 })
  })

  it('says two rows load the same when their stacks match', () => {
    const a = rowLoad('pairs', 100, 20, RACK)
    const b = rowLoad('pairs', 100, 20, RACK)
    expect(sameLoad(a, b)).toBe(true)
    expect(sameLoad(a, rowLoad('pairs', 105, 20, RACK))).toBe(false)
    expect(sameLoad(null, null)).toBe(false)
  })
})

describe('dropGrid', () => {
  it('falls back to the exercise own increment when the rack is not counted', () => {
    const g = dropGrid({ unit: 'kg' }, { id: 'bench-press', inc: 2.5 })
    expect(typeof g).toBe('number')
    expect(g).toBe(2.5)
  })

  it('snaps a drop onto counted plates when the profile has an inventory', () => {
    const S: PlateState = { unit: 'kg', plates: { kg: { 20: 2, 2.5: 2, _ts: 1 } } }
    const g = dropGrid(S, { id: 'bench-press' })
    expect(typeof g).toBe('function')
    if (typeof g !== 'function') return
    // never below the bar
    expect(g(15)).toBe(20)
    // and never lands between plates: 48.5 is not loadable in 2.5s off a 20 bar
    const snapped = g(48.5)
    expect(snapped % 5).toBe(0)
  })

  it('uses the increment for an exercise that loads nothing', () => {
    const S: PlateState = { unit: 'kg', plates: { kg: { 20: 2, _ts: 1 } } }
    expect(dropGrid(S, { id: 'dumbbell-curl' })).toBe(2.5)
  })
})
