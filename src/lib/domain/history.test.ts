/**
 * Ported from openGym's `history.test.js`, retargeted at this codebase.
 *
 * These tests exist to catch wrong prescriptions, not to describe shapes. The cases below are the
 * ones where getting it wrong produces a load the lifter never lifted: an excluded session seeding
 * the next target, a warm-up counted as work, a timed hold read as reps, or an assistance machine
 * counting a 0 kg row as its best set.
 */
import { describe, expect, it } from 'vitest'
import {
  bestWeightFor,
  bestWeightForEntry,
  completedRepsOf,
  completedRowsForMode,
  doneUnits,
  effectiveRoutineIds,
  entryExcluded,
  entryRoutineId,
  isBw,
  isPerSide,
  lastEntryFor,
  metricEntriesForExercise,
  metricModeForEntry,
  metricRowsForEntry,
  modeOf,
  nextTrainingDay,
  repStep,
  setUnits,
  setUnitsTotal,
  setsDone,
  sideReps,
  workSetsDone,
  type HistoryState,
  type SlottedEntry,
  type Workout,
} from './history'
import { syncSideAggregate } from './workout-model'

const bench = (sets: Record<string, unknown>[]) => ({
  id: 'bench-press',
  name: 'Bench Press',
  sets: sets.map(s => ({ w: 60, r: 5, done: true, ...s })),
})
const W = (d: string, entries: SlottedEntry[]): Workout => ({ d, entries })

describe('config helpers', () => {
  it('reads the mode off the config, defaulting to reps', () => {
    expect(modeOf({ id: 'x' })).toBe('reps')
    expect(modeOf({ id: 'x', mode: 'time' })).toBe('time')
    expect(modeOf({ id: 'x', unit: 'minutes' })).toBe('cardio')
    expect(modeOf(null)).toBe('reps')
  })

  it('knows when an exercise carries no load', () => {
    expect(isBw({ id: 'push-up' })).toBe(true)
    expect(isBw({ id: 'bench-press' })).toBe(false)
    // an explicit flag wins in either direction: a dip done with a belt can turn it off
    expect(isBw({ id: 'bench-press', bodyweight: true })).toBe(true)
    expect(isBw({ id: 'push-up', bodyweight: false })).toBe(false)
    expect(isBw(null)).toBe(false)
  })

  it('halves a unilateral target and steps it by two', () => {
    expect(sideReps(10)).toBe(5)
    expect(repStep({ id: 'x', side: true })).toBe(2)
    expect(repStep({ id: 'x' })).toBe(1)
    expect(isPerSide({ id: 'x', side: true })).toBe(true)
  })
})

describe('what counts as history', () => {
  const S: HistoryState = {
    workouts: [
      W('2026-01-01', [bench([{ r: 5 }])]),
      W('2026-01-08', [bench([{ r: 6, warmup: true }])]), // warm-up only
      W('2026-01-15', [bench([{ r: 5, done: false }])]), // never checked off
    ],
  }

  it('ignores a session whose only set was a warm-up', () => {
    // Seeding the next session from a 50% ramp row walks the working weight down every time.
    const last = lastEntryFor(S, 'bench-press')
    expect(last?.d).toBe('2026-01-01')
  })

  it('ignores a session whose set was never checked off', () => {
    // A set you did not do is not evidence of what you can do.
    expect(lastEntryFor(S, 'bench-press')?.d).toBe('2026-01-01')
  })

  it('returns null when nothing counts', () => {
    const empty: HistoryState = { workouts: [W('2026-01-01', [bench([{ done: false }])])] }
    expect(lastEntryFor(empty, 'bench-press')).toBeNull()
    expect(lastEntryFor({ workouts: [] }, 'bench-press')).toBeNull()
    expect(lastEntryFor({}, 'bench-press')).toBeNull()
  })

  it('excludes a planned deload from the next prescription', () => {
    const withDeload: HistoryState = {
      workouts: [W('2026-02-01', [{ ...bench([{ r: 3 }]), noProg: true }])],
    }
    expect(entryExcluded(undefined, { noProg: true })).toBe(true)
    expect(lastEntryFor(withDeload, 'bench-press')).toBeNull()
  })

  it('excludes a whole workout when the workout says so', () => {
    const w: Workout = { d: '2026-02-01', excludeFromProgression: true, entries: [bench([{}])] }
    expect(entryExcluded(w, {})).toBe(true)
    expect(lastEntryFor({ workouts: [w] }, 'bench-press')).toBeNull()
  })

  it('takes the routine slot from the entry, then the workout', () => {
    expect(entryRoutineId({ routineId: 'push-a' }, {})).toBe('push-a')
    expect(entryRoutineId({ routineId: 'push-a' }, { rid: 'pull-b' })).toBe('pull-b')
    // an entry added to a freestyle session belongs to no routine
    const mixed = { routineId: 'push-a', entries: [{ rid: 'x' }, {}] }
    expect(entryRoutineId(mixed, { entries: [{}] } as never)).toBeNull()
  })

  it('keeps a routine slot separate, so two routines do not share one history line', () => {
    // The same bench press in a heavy day and a light day is two lines of progress, not one that
    // zigzags between them.
    const S2: HistoryState = {
      workouts: [
        W('2026-01-01', [{ ...bench([{ r: 5 }]), rid: 'heavy' }]),
        W('2026-01-03', [{ ...bench([{ r: 10 }]), rid: 'light' }]),
      ],
    }
    expect(lastEntryFor(S2, 'bench-press', 'heavy')).toMatchObject({ d: '2026-01-01', rid: 'heavy' })
    expect(lastEntryFor(S2, 'bench-press', 'light')).toMatchObject({ d: '2026-01-03', rid: 'light' })
    // with no routine asked for, the newest session anywhere wins
    expect(lastEntryFor(S2, 'bench-press')?.d).toBe('2026-01-03')
  })

  it('falls back to any session for a routine that never trained the exercise', () => {
    // A new or copied routine starts from what you actually lift rather than from nothing.
    const S2: HistoryState = {
      workouts: [W('2026-01-01', [{ ...bench([{ r: 5 }]), rid: 'heavy' }])],
    }
    expect(lastEntryFor(S2, 'bench-press', 'never-trained-it')).toMatchObject({ d: '2026-01-01' })
  })
})

describe('the metric rule', () => {
  it('keeps a timed hold out of the reps metric', () => {
    // A 60-second hold carrying a stray w/r must not be read as reps, or it reports a 1RM four
    // times the load from an isometric hold nobody lifted.
    const hold = { id: 'plank', target: { mode: 'time' }, sets: [{ sec: 60, w: 200, r: 5, done: true }] }
    expect(metricRowsForEntry(hold, 'reps')).toEqual([])
    expect(metricModeForEntry(hold)).toBe('time')
  })

  it('scans only the rows of the mode it resolved', () => {
    const mixed = { sets: [{ r: 5, done: true }, { sec: 30, done: true }] }
    expect(metricRowsForEntry(mixed, 'reps')).toHaveLength(1)
    expect(metricRowsForEntry(mixed, 'time')).toHaveLength(1)
  })

  it('never lets a warm-up into the metric rows', () => {
    const e = {
      sets: [
        { r: 10, done: true, warmup: true },
        { r: 5, done: true },
      ],
    }
    expect(metricRowsForEntry(e, 'reps')).toHaveLength(1)
  })

  it('reports the mode it resolved', () => {
    expect(metricModeForEntry({ sets: [{ r: 5, done: true }] })).toBe('reps')
    expect(metricModeForEntry({ sets: [] })).toBe('reps')
    expect(metricModeForEntry(null)).toBe('reps')
  })
})

describe('best load', () => {
  it('ignores a 0 kg row on an assistance machine', () => {
    // Folding 0 in as "the least assistance ever" would invent a record nobody did and then ask
    // for negative help next time.
    const e = {
      id: 'assisted-pull-up',
      sets: [
        { w: 0, r: 5, done: true },
        { w: 40, r: 5, done: true },
      ],
    }
    expect(bestWeightForEntry(e)).toBe(40)
  })

  it('takes the SMALLER load as best on an assistance machine', () => {
    const e = {
      id: 'assisted-pull-up',
      sets: [
        { w: 40, r: 5, done: true },
        { w: 20, r: 5, done: true },
      ],
    }
    expect(bestWeightForEntry(e)).toBe(20)
  })

  it('takes the LARGER load as best on an ordinary lift', () => {
    const e = { id: 'bench-press', sets: [{ w: 40, r: 5, done: true }, { w: 60, r: 5, done: true }] }
    expect(bestWeightForEntry(e)).toBe(60)
  })

  it('reads a legacy topW-only record, but never as an assisted best', () => {
    expect(bestWeightForEntry({ id: 'bench-press', sets: [], topW: 55 })).toBe(55)
    expect(bestWeightForEntry({ id: 'assisted-pull-up', sets: [], topW: 55 })).toBe(0)
  })

  it('returns 0 when nothing usable was logged', () => {
    expect(bestWeightForEntry({ id: 'x', sets: [] })).toBe(0)
    expect(bestWeightFor({ workouts: [] }, 'x')).toBe(0)
    expect(bestWeightFor({}, 'x')).toBe(0)
  })
})

describe('units and counts', () => {
  const side = syncSideAggregate({
    sides: {
      L: { w: 40, r: 5, done: true },
      R: { w: 40, r: 5, done: false },
    },
  })

  it('counts a per-side set as two units', () => {
    expect(setUnits(side)).toBe(2)
    expect(setUnits({ w: 1, r: 1, done: true })).toBe(1)
  })

  it('counts only the completed limbs as done', () => {
    expect(doneUnits(side)).toBe(1)
    expect(doneUnits({ w: 1, r: 1, done: true })).toBe(1)
    expect(doneUnits({ w: 1, r: 1, done: false })).toBe(0)
  })

  it('totals the units across an entry', () => {
    expect(setUnitsTotal([{ sets: [side, { done: true }] }])).toBe(3)
    expect(setUnitsTotal(null)).toBe(0)
  })

  it('counts completed sets excluding warm-ups', () => {
    const e = {
      sets: [
        { r: 10, done: true, warmup: true },
        { r: 5, done: true },
        { r: 5, done: false },
      ],
    }
    expect(setsDone(e)).toBe(1)
  })

  it('counts work sets across a whole workout, warm-ups excluded', () => {
    const w = { entries: [{ sets: [{ r: 10, done: true, warmup: true }, { r: 5, done: true }] }] }
    expect(workSetsDone(w)).toBe(1)
    expect(workSetsDone(undefined)).toBe(0)
  })
})

describe('completedRepsOf', () => {
  it('counts only the completed limbs of a per-side row', () => {
    const side = syncSideAggregate({
      sides: {
        L: { w: 40, r: 5, done: true },
        R: { w: 40, r: 8, done: false },
      },
    })
    expect(completedRepsOf(side)).toBe(5)
  })

  it('counts a completed straight row, and nothing for an open one', () => {
    expect(completedRepsOf({ r: 8, done: true })).toBe(8)
    expect(completedRepsOf({ r: 8, done: false })).toBe(0)
    expect(completedRepsOf({})).toBe(0)
  })
})

describe('the weekly plan', () => {
  const S: HistoryState = {
    routines: [
      { id: 'push', name: 'Push', ex: [{ id: 'bench-press' }] },
      { id: 'pull', name: 'Pull', ex: [{ id: 'row' }] },
      { id: 'empty', name: 'Empty', ex: [] },
    ],
    week: { 1: 'push', 3: ['push', 'pull'] },
    dayPlan: {},
  }

  it('reads the weekday plan, and handles a combined day', () => {
    expect(effectiveRoutineIds(S, '2026-01-05')).toEqual(['push']) // Monday
    expect(effectiveRoutineIds(S, '2026-01-07')).toEqual(['push', 'pull']) // Wednesday
  })

  it('treats a rest day as no routines rather than as an error', () => {
    const rest = { ...S, dayPlan: { '2026-01-05': 'rest' } }
    expect(effectiveRoutineIds(rest, '2026-01-05')).toEqual([])
  })

  it('lets a date override the weekday', () => {
    const moved = { ...S, dayPlan: { '2026-01-05': 'pull' } }
    expect(effectiveRoutineIds(moved, '2026-01-05')).toEqual(['pull'])
  })

  it('ignores a plan pointing at a routine that no longer exists', () => {
    const stale = { ...S, week: { 1: 'deleted-routine' } }
    expect(effectiveRoutineIds(stale, '2026-01-05')).toEqual([])
  })

  it('finds the next day that actually has something to train', () => {
    const next = nextTrainingDay(S, '2026-01-05')
    expect(next?.iso).toBe('2026-01-07') // Wednesday's combined day
  })

  it('skips a day whose routine has no exercises', () => {
    // Starting one lands you in an empty session, so it is not an answer to "what is next".
    const S2: HistoryState = {
      routines: [
        { id: 'empty', name: 'Empty', ex: [] },
        { id: 'push', name: 'Push', ex: [{ id: 'bench' }] },
      ],
      week: { 2: 'empty', 4: 'push' },
      dayPlan: {},
    }
    expect(nextTrainingDay(S2, '2026-01-05')?.iso).toBe('2026-01-08')
  })

  it('returns null when the whole week is rest', () => {
    const allRest: HistoryState = { routines: [], week: {}, dayPlan: {} }
    expect(nextTrainingDay(allRest, '2026-01-05')).toBeNull()
  })
})

describe('metricEntriesForExercise', () => {
  it('keeps a legacy topW-only reps record rather than dropping it', () => {
    const w = { d: '2026-01-01', entries: [{ id: 'bench', sets: [], topW: 55 }] }
    expect(metricEntriesForExercise(w, 'bench')).toHaveLength(1)
  })

  it('returns nothing for an exercise the workout never held', () => {
    const w = { d: '2026-01-01', entries: [bench([{}])] }
    expect(metricEntriesForExercise(w, 'squat')).toEqual([])
  })

  it('returns nothing for an empty exercise id', () => {
    expect(metricEntriesForExercise({ entries: [] }, '')).toEqual([])
  })
})

describe('completedRowsForMode', () => {
  it('filters by the mode requested', () => {
    const e = { sets: [{ r: 5, done: true }, { sec: 30, done: true }] }
    expect(completedRowsForMode(e, 'reps')).toHaveLength(1)
    expect(completedRowsForMode(e, 'time')).toHaveLength(1)
  })

  it('falls back to reps for an unknown mode rather than returning nothing', () => {
    const e = { sets: [{ r: 5, done: true }] }
    expect(completedRowsForMode(e, 'nonsense')).toHaveLength(1)
  })
})