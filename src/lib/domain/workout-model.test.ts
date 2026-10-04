/**
 * Ported from openGym's `workout-model.test.js`, adapted to TypeScript.
 *
 * The tests travel with the code on purpose: they are the executable statement of what the
 * module means, and the legacy fallbacks in here cannot be verified any other way.
 */
import { describe, it, expect } from 'vitest'
import {
  addCluster,
  addDrop,
  addSideCluster,
  addSideDrop,
  clustersOf,
  completedVolumeOf,
  dropsOf,
  extraVolumeOf,
  hasCompletedWork,
  isDropSet,
  isRestPauseSet,
  isSideSet,
  isWarmupRow,
  makeSideSet,
  modeForEntry,
  modeForSet,
  nextBurstReps,
  nextDropWeight,
  normalizeMode,
  phaseForSet,
  removeClusterAt,
  removeDropAt,
  removeSideClusterAt,
  removeSideDropAt,
  setClusterAt,
  setDropAt,
  setSideClusterAt,
  setSideDropAt,
  setSideField,
  splitBurstReps,
  syncSideAggregate,
  toggleSide,
  WEIGHT_ORIGIN_MANUAL,
  type WorkoutSet,
} from './workout-model'

describe('phase resolution', () => {
  it('lets an explicit phase win over the legacy warmup boolean', () => {
    expect(phaseForSet({ phase: 'warmup' })).toBe('warmup')
    expect(phaseForSet({ phase: 'warm-up' })).toBe('warmup')
    expect(phaseForSet({ phase: 'warm_up' })).toBe('warmup')
    expect(phaseForSet({ phase: ' WORK ' })).toBe('work')
    expect(phaseForSet({ phase: 'work', warmup: true })).toBe('work')
  })

  it('reads the legacy boolean when there is no phase', () => {
    expect(phaseForSet({ warmup: true })).toBe('warmup')
    expect(phaseForSet({})).toBe('work')
    expect(isWarmupRow({ warmup: true })).toBe(true)
    expect(isWarmupRow({})).toBe(false)
  })

  it('honours the fallback for a row that says nothing', () => {
    expect(phaseForSet({}, 'warmup')).toBe('warmup')
    expect(phaseForSet({ phase: 'nonsense' }, 'warmup')).toBe('warmup')
    expect(phaseForSet({ phase: 'nonsense' })).toBe('work')
  })
})

describe('set type and intensifiers', () => {
  it('classifies straight, drop-set and rest-pause rows', () => {
    expect(isDropSet({})).toBe(false)
    expect(isDropSet({ type: 'dropset' })).toBe(true)
    expect(isRestPauseSet({ type: 'restpause' })).toBe(true)
    expect(isDropSet({ type: 'restpause' })).toBe(false)
    expect(isDropSet({ type: 'nonsense' })).toBe(false)
  })

  it('reads drops and clusters only from the matching type', () => {
    const drops = [{ w: 80, r: 5 }]
    const clusters = [{ r: 4, restSec: 15 }]
    expect(dropsOf({ type: 'dropset', drops })).toEqual(drops)
    expect(dropsOf({ type: 'restpause', clusters })).toEqual([])
    expect(dropsOf({ drops })).toEqual([])
    expect(clustersOf({ type: 'restpause', clusters })).toEqual(clusters)
    expect(clustersOf({ type: 'dropset', drops })).toEqual([])
  })

  it('adds a drop and marks the row a drop-set', () => {
    const row = addDrop({ w: 100, r: 5, done: true }, { w: 80, r: 5 })
    expect(row).toMatchObject({ type: 'dropset', drops: [{ w: 80, r: 5 }] })
    // the original is untouched — these are pure functions
    expect(row.w).toBe(100)
  })

  it('coerces missing drop fields to zero rather than NaN', () => {
    const row: WorkoutSet = addDrop({} as WorkoutSet, {})
    expect(row.drops).toEqual([{ w: 0, r: 0 }])
  })

  it('adds a burst and marks the row a rest-pause set', () => {
    const row = addCluster({ w: 60, r: 8, done: true }, { r: 4, restSec: 15 })
    expect(row).toMatchObject({ type: 'restpause', clusters: [{ r: 4, restSec: 15 }] })
  })

  it('reverts to a straight set when the last drop or burst is removed', () => {
    const one = addDrop({ w: 100, r: 5 }, { w: 80, r: 5 })
    expect(removeDropAt(one, 0)).toMatchObject({ type: 'straight', drops: [] })

    const two = addDrop(addDrop({ w: 100, r: 5 }, { w: 80, r: 5 }), { w: 60, r: 5 })
    expect(removeDropAt(two, 0)).toMatchObject({ type: 'dropset', drops: [{ w: 60, r: 5 }] })

    const cl = addCluster({ w: 60, r: 8 }, { r: 4, restSec: 15 })
    expect(removeClusterAt(cl, 0)).toMatchObject({ type: 'straight', clusters: [] })
  })

  it('patches an existing drop or burst in place, and ignores a missing index', () => {
    const row = addDrop({ w: 100, r: 5 }, { w: 80, r: 5 })
    expect(setDropAt(row, 0, { w: 75 })).toMatchObject({ drops: [{ w: 75, r: 5 }] })
    expect(setDropAt(row, 5, { w: 75 })).toBe(row)

    const cl = addCluster({ w: 60, r: 8 }, { r: 4, restSec: 15 })
    expect(setClusterAt(cl, 0, { restSec: 20 })).toMatchObject({ clusters: [{ r: 4, restSec: 20 }] })
    expect(setClusterAt(cl, 5, { restSec: 20 })).toBe(cl)
  })

  it('counts a drop-set\'s extra volume on top of its own set, but not a rest-pause\'s bursts', () => {
    const drop = addDrop({ w: 100, r: 5 }, { w: 80, r: 5 })
    expect(extraVolumeOf(drop)).toBe(400) // 80 × 5
    expect(extraVolumeOf({ w: 100, r: 5 })).toBe(0)

    // a rest-pause row's own r IS the total; clusters only break it down, so adding them
    // here would double-count the same reps
    const rest = addCluster({ w: 60, r: 12, done: true }, { r: 6, restSec: 15 })
    expect(extraVolumeOf(rest)).toBe(0)
  })
})

describe('drop weight and burst suggestions', () => {
  it('drops by a percentage and never lands at or above the weight it drops from', () => {
    expect(nextDropWeight(100)).toBe(80)      // 20% default, rounded to .5
    expect(nextDropWeight(100, 50)).toBe(50)
    expect(nextDropWeight(100, 10)).toBe(90)
  })

  it('clamps the percentage to a sane band, and only a zero pct falls back to the default', () => {
    expect(nextDropWeight(100)).toBe(80)      // default 20%
    expect(nextDropWeight(100, 0)).toBe(80)    // 0 is falsy -> default 20%
    expect(nextDropWeight(100, 999)).toBe(10)  // clamped to 90%
    // a negative pct is clamped UP to 1%, i.e. a 1% lighter drop — not the 20% default
    expect(nextDropWeight(100, -5)).toBe(99)
  })

  it('drops by a percentage with no grid, rounding to the half', () => {
    expect(nextDropWeight(100, 20)).toBe(80)
    expect(nextDropWeight(80, 20)).toBe(64)
    expect(nextDropWeight(61, 10)).toBe(55)
    expect(nextDropWeight(0, 20)).toBe(0)      // never negative
  })

  it('lands on the exercise\'s weight step, and always below the weight it drops from', () => {
    expect(nextDropWeight(60, 20, 2.5)).toBe(47.5) // 48 is not loadable in 2.5s
    expect(nextDropWeight(100, 20, 5)).toBe(80)
    expect(nextDropWeight(80, 20, 5)).toBe(65)    // 64 → the nearest 5
    expect(nextDropWeight(5, 5, 2.5)).toBe(2.5)    // rounding back up to 5 would be no drop
    expect(nextDropWeight(2.5, 10, 2.5)).toBe(0)
  })

  it('takes a snapping function (the plates you own) as the grid', () => {
    expect(nextDropWeight(100, 20, w => Math.floor(w / 10) * 10)).toBe(80)
    expect(nextDropWeight(100, 25, w => Math.floor(w / 10) * 10)).toBe(70)
    expect(nextDropWeight(97, 20, w => Math.floor(w / 2.5) * 2.5)).toBe(77.5)
  })

  it('treats a non-finite function result as no grid at all', () => {
    expect(nextDropWeight(100, 20, () => Number.NaN)).toBe(80)
  })

  it('suggests roughly half the previous rep count, never below one', () => {
    expect(nextBurstReps(10)).toBe(5)
    expect(nextBurstReps(7)).toBe(4)
    expect(nextBurstReps(1)).toBe(1)
    expect(nextBurstReps(0)).toBe(1)
  })

  it('splits a rest-pause total into a descending sequence that adds back up', () => {
    expect(splitBurstReps(12)).toEqual([6, 3, 2, 1])
    expect(splitBurstReps(6)).toEqual([3, 2, 1])
    expect(splitBurstReps(1)).toEqual([1])
    for (let total = 0; total <= 24; total++) {
      expect(splitBurstReps(total).reduce((a, b) => a + b, 0)).toBe(total)
    }
    expect(splitBurstReps(0)).toEqual([])
    expect(splitBurstReps(-5)).toEqual([])
    expect(splitBurstReps(undefined)).toEqual([])
  })
})

describe('unilateral sets', () => {
  it('recognises a per-side row only when both sides are present', () => {
    expect(isSideSet({ sides: { L: { w: 1, r: 1, done: true }, R: { w: 1, r: 1, done: true } } })).toBe(true)
    expect(isSideSet({ sides: { L: {} } })).toBe(false)
    expect(isSideSet({})).toBe(false)
    expect(isSideSet(null)).toBe(false)
  })

  it('splits a plain row into two untouched halves at the same weight', () => {
    const row = makeSideSet({ w: 40, r: 10, done: true })
    expect(row.sides?.L).toEqual({ w: 40, r: 5, done: false })
    expect(row.sides?.R).toEqual({ w: 40, r: 5, done: false })
    expect(row.r).toBe(10)   // mirror totals
    expect(row.w).toBe(40)   // mirror max
    expect(row.done).toBe(false) // mirror AND
  })

  it('drops straight-set effort leftovers so the row has one source of truth', () => {
    const row = makeSideSet({ w: 40, r: 10, rir: 2, rpe: 8 })
    expect(row.rir).toBeUndefined()
    expect(row.rpe).toBeUndefined()
  })

  it('keeps the mirror in step after any per-side edit', () => {
    const row = makeSideSet({ w: 40, r: 10 })
    const l = toggleSide(row, 'L')
    expect(l.sides?.L?.done).toBe(true)
    expect(l.done).toBe(false) // only true once BOTH are done

    const both = toggleSide(l, 'R')
    expect(both.done).toBe(true)
  })

  it('mirrors an asymmetric load as the heavier side, without pretending to reconstruct it', () => {
    const row = syncSideAggregate({
      sides: {
        L: { w: 40, r: 5, done: true },
        R: { w: 30, r: 8, done: true },
      },
    })
    expect(row.w).toBe(40)  // max
    expect(row.r).toBe(13)  // sum
    expect(row.done).toBe(true)
  })

  it('mirrors effort as the harder side — lower RIR, else higher RPE', () => {
    const rir = syncSideAggregate({
      sides: { L: { w: 1, r: 1, done: true, rir: 3 }, R: { w: 1, r: 1, done: true, rir: 1 } },
    })
    expect(rir.rir).toBe(1) // fewer left in the tank = harder

    const rpe = syncSideAggregate({
      sides: { L: { w: 1, r: 1, done: true, rpe: 7 }, R: { w: 1, r: 1, done: true, rpe: 9 } },
    })
    expect(rpe.rpe).toBe(9) // higher RPE = harder
    expect(rpe.rir).toBeUndefined()
  })

  it('moves drops and clusters down to the sides and keeps only the shared type', () => {
    const row = syncSideAggregate({
      w: 100, r: 5, drops: [{ w: 80, r: 5 }], clusters: [], type: 'dropset',
      sides: {
        L: { w: 100, r: 5, done: true, type: 'dropset', drops: [{ w: 80, r: 5 }] },
        R: { w: 100, r: 5, done: true, type: 'dropset', drops: [{ w: 80, r: 5 }] },
      },
    })
    expect(row.drops).toBeUndefined()
    expect(row.clusters).toBeUndefined()
    expect(row.type).toBe('dropset')
    expect(isDropSet(row)).toBe(true)
  })

  it('sums a per-side row\'s completed volume from both limbs', () => {
    const row = syncSideAggregate({
      sides: {
        L: { w: 40, r: 5, done: true },
        R: { w: 40, r: 5, done: true },
      },
    })
    expect(completedVolumeOf(row)).toBe(400) // 200 + 200, NOT 40 × 10
  })

  it('counts a limb as completed work even when its partner is still open', () => {
    expect(hasCompletedWork({ done: true })).toBe(true)
    expect(hasCompletedWork({ done: false })).toBe(false)
    const row = syncSideAggregate({
      sides: { L: { w: 1, r: 1, done: true }, R: { w: 1, r: 1, done: false } },
    })
    expect(hasCompletedWork(row)).toBe(true)
    expect(completedVolumeOf(row)).toBe(1)
  })

  it('gives an incomplete plain row no volume', () => {
    expect(completedVolumeOf({ w: 100, r: 5, done: false })).toBe(0)
    expect(completedVolumeOf({ w: 100, r: 5, done: true })).toBe(500)
  })

  it('preserves a manual weight origin on a side', () => {
    const row = syncSideAggregate({
      sides: {
        L: { w: 40, r: 5, done: true, weightOrigin: WEIGHT_ORIGIN_MANUAL },
        R: { w: 40, r: 5, done: true },
      },
    })
    expect(row.sides?.L?.weightOrigin).toBe(WEIGHT_ORIGIN_MANUAL)
    expect(row.sides?.R?.weightOrigin).toBeUndefined()
  })

  it('ignores an edit aimed at a side that does not exist', () => {
    const row = makeSideSet({ w: 40, r: 10 })
    expect(setSideField(row, 'X' as 'L', 'rir', 2)).toMatchObject({ sides: { L: { w: 40, r: 5 } } })
    expect(toggleSide(row, 'X' as 'L')).toMatchObject({ sides: { L: { done: false } } })
    // a plain row passes straight through
    const plain = { w: 40, r: 10 }
    expect(setSideField(plain, 'L', 'rir', 2)).toEqual(plain)
  })

  it('clears effort with a null value, the way a straight row drops the key', () => {
    const row = syncSideAggregate({
      sides: {
        L: { w: 1, r: 1, done: true, rir: 2 },
        R: { w: 1, r: 1, done: true, rir: 3 },
      },
    })
    expect(row.rir).toBe(2)
    const cleared = setSideField(row, 'L', 'rir', null)
    // L's own rir is gone; the mirror now comes from R alone
    expect(cleared.sides?.L?.rir).toBeUndefined()
    expect(cleared.rir).toBe(3)
  })
})

describe('per-side intensifiers', () => {
  it('adds the same drop to both sides, each seeded from its own weight', () => {
    const row = addSideDrop(syncSideAggregate({
      sides: {
        L: { w: 100, r: 5, done: true },
        R: { w: 80, r: 5, done: true },
      },
    }), 20, 2.5)
    expect(row.sides?.L?.drops).toEqual([{ w: 80, r: 5 }])   // 100 → 80
    expect(row.sides?.R?.drops).toEqual([{ w: 65, r: 5 }])   // 80 → 64 → snapped to 65
  })

  it('removes a drop from both sides symmetrically', () => {
    const row = addSideDrop(syncSideAggregate({
      sides: { L: { w: 100, r: 5, done: true }, R: { w: 80, r: 5, done: true } },
    }), 20, 2.5)
    const cleared = removeSideDropAt(row, 0)
    expect(cleared.sides?.L?.drops).toEqual([])
    expect(cleared.sides?.R?.drops).toEqual([])
  })

  it('edits one side\'s drop without touching the other', () => {
    const row = addSideDrop(syncSideAggregate({
      sides: { L: { w: 100, r: 5, done: true }, R: { w: 80, r: 5, done: true } },
    }), 20, 2.5)
    const patched = setSideDropAt(row, 'L', 0, { w: 75 })
    expect(patched.sides?.L?.drops).toEqual([{ w: 75, r: 5 }])
    expect(patched.sides?.R?.drops).toEqual([{ w: 65, r: 5 }])
  })

  it('grows a side\'s own rep total when a burst is added, mirroring a straight row', () => {
    const row = addSideCluster(syncSideAggregate({
      sides: { L: { w: 60, r: 12, done: true }, R: { w: 60, r: 12, done: true } },
    }), 15)
    expect(row.sides?.L?.r).toBe(18) // 12 + nextBurstReps(12) = 12 + 6
    expect(row.sides?.L?.clusters).toEqual([{ r: 6, restSec: 15 }])
    expect(row.r).toBe(36)
  })

  it('shrinks the side total when a burst is removed, never below zero', () => {
    const row = addSideCluster(syncSideAggregate({
      sides: { L: { w: 60, r: 12, done: true }, R: { w: 60, r: 12, done: true } },
    }), 15)
    const cleared = removeSideClusterAt(row, 0)
    expect(cleared.sides?.L?.r).toBe(12)
    expect(cleared.sides?.L?.clusters).toEqual([])
  })

  it('edits one side\'s burst by the delta, not by replacement', () => {
    const row = addSideCluster(syncSideAggregate({
      sides: { L: { w: 60, r: 12, done: true }, R: { w: 60, r: 12, done: true } },
    }), 15)
    const patched = setSideClusterAt(row, 'L', 0, 4) // 6 -> 4 is a delta of -2
    expect(patched.sides?.L?.r).toBe(16)
    expect(patched.sides?.R?.r).toBe(18)
  })
})

describe('mode resolution', () => {
  it('normalises a mode and falls back safely', () => {
    expect(normalizeMode('TIME')).toBe('time')
    expect(normalizeMode('cardio')).toBe('cardio')
    expect(normalizeMode('nonsense')).toBe('reps')
    expect(normalizeMode(undefined, 'cardio')).toBe('cardio')
    expect(normalizeMode(undefined, 'nonsense')).toBe('reps')
  })

  it('reads an explicit mode on the row', () => {
    expect(modeForSet({ mode: 'time' })).toBe('time')
    expect(modeForSet({ mode: 'amrap' })).toBe('reps')
  })

  it('falls back to the unit when there is no mode', () => {
    expect(modeForSet({ unit: 'seconds' })).toBe('time')
    expect(modeForSet({ unit: 'minutes' })).toBe('cardio')
    expect(modeForSet({ unit: 'reps' })).toBe('reps')
  })

  it('infers the mode from legacy result fields, row then target', () => {
    expect(modeForSet({ min: 20, speed: 9 })).toBe('cardio')
    expect(modeForSet({ sec: 60 })).toBe('time')
    expect(modeForSet({ r: 5 })).toBe('reps')
    // an explicit row beats the target
    expect(modeForSet({ mode: 'cardio', r: 5 }, { mode: 'reps' })).toBe('cardio')
    // the target beats a legacy row field
    expect(modeForSet({ r: 5 }, { mode: 'time' })).toBe('time')
    // nothing to go on at all
    expect(modeForSet({})).toBe('reps')
  })

  it('resolves one mode for an entry, and refuses when work rows disagree', () => {
    const entry = { sets: [{ r: 5 }, { r: 5, done: true }] }
    expect(modeForEntry(entry)).toBe('reps')

    const timed = { sets: [{ sec: 30, done: true }] }
    expect(modeForEntry(timed)).toBe('time')

    const mixed = { sets: [{ r: 5, done: true }, { sec: 30, done: true }] }
    expect(modeForEntry(mixed)).toBeNull()
  })

  it('decides an entry from its work rows, ignoring warm-ups', () => {
    const entry = {
      sets: [
        { sec: 30, warmup: true },
        { r: 5, done: true },
      ],
    }
    expect(modeForEntry(entry)).toBe('reps')
  })

  it('falls back to the target, then to the entry itself', () => {
    expect(modeForEntry({ sets: [], target: { mode: 'cardio' } })).toBe('cardio')
    expect(modeForEntry({ sets: [], target: { mode: 'nonsense' } })).toBe('reps')
    expect(modeForEntry({ mode: 'time', sets: [] })).toBe('time')
    expect(modeForEntry({}, 'cardio')).toBe('cardio')
  })
})