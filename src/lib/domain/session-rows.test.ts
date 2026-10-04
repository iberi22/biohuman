/**
 * Ported from openGym's `history.test.js`.
 *
 * The property these share: the rows a session opens with are the last thing that actually
 * happened, not a generic default. Every test here is about which number wins when more than one
 * source could supply it.
 */
import { describe, expect, it } from 'vitest'
import {
  buildSets,
  fmtSec,
  insertWarmupRow,
  MAX_PLANNED_WARMUPS,
  removeRowAt,
  timestampOf,
  workoutDuration,
} from './session-rows'
import type { WorkoutSet } from './workout-model'

const LIFT = 'barbell-bench-press'

// One logged workout of `LIFT` at a given weight and reps.
const wk = (d: string, w: number, r: number, extra: Record<string, unknown> = {}) => ({
  d,
  entries: [
    {
      id: LIFT,
      target: { sets: 1, reps: r, weight: w },
      sets: [{ w, r, done: true }],
      ...extra,
    },
  ],
})

describe('buildSets seeds opening rows from the last counting session', () => {
  it('uses the last session that counts, not a later noProg one', () => {
    const S = { exWeights: {}, workouts: [wk('2026-01-01', 60, 8), wk('2026-01-05', 30, 12, { noProg: true })] }
    expect(buildSets(S as never, { id: LIFT, sets: 1, reps: 5, weight: 50 })).toEqual([
      { w: 60, r: 8, done: false },
    ])
  })

  it('falls back to the routine target when only noProg history exists', () => {
    // Nothing counted means nothing to reproduce, so the routine's own numbers open the session.
    const S = { exWeights: {}, workouts: [wk('2026-01-05', 30, 12, { noProg: true })] }
    expect(buildSets(S as never, { id: LIFT, sets: 1, reps: 5, weight: 50 })).toEqual([
      { w: 50, r: 5, done: false },
    ])
  })

  it('seeds each set from its own position, not all of them from the last', () => {
    const S = {
      exWeights: {},
      workouts: [
        {
          d: '2026-01-01',
          entries: [
            {
              id: LIFT,
              sets: [
                { w: 100, r: 5, done: true },
                { w: 95, r: 5, done: true },
                { w: 90, r: 5, done: true },
              ],
            },
          ],
        },
      ],
    }
    const rows = buildSets(S as never, { id: LIFT, sets: 3, reps: 5, weight: 50 })
    expect(rows.map((r) => [r.w, r.r])).toEqual([
      [100, 5],
      [95, 5],
      [90, 5],
    ])
  })

  it('lets the plan own the reps while history still decides the weight', () => {
    // A plan edited from 15 to 10 must open at 10 even though 15 was trained once.
    const S = { exWeights: {}, workouts: [wk('2026-01-01', 60, 15)] }
    const rows = buildSets(S as never, { id: LIFT, sets: 1, reps: 10, weight: 50 }, { planReps: true })
    expect(rows[0]).toMatchObject({ w: 60, r: 10 })
  })

  it('does not seed from the confirmed weight before the last session', () => {
    // Taking the confirmed weight first handed a light day the heavy day's number.
    const S = { exWeights: { [LIFT]: { w: 120 } }, workouts: [wk('2026-01-01', 60, 8)] }
    expect(buildSets(S as never, { id: LIFT, sets: 1, reps: 8, weight: 50 })[0].w).toBe(60)
  })

  it('uses the confirmed weight only when there is no session to read', () => {
    const S = { exWeights: { [LIFT]: { w: 120 } }, workouts: [] }
    expect(buildSets(S as never, { id: LIFT, sets: 1, reps: 8, weight: 50 })[0].w).toBe(120)
  })

  it('reproduces what you did in freestyle', () => {
    const S = { exWeights: {}, workouts: [wk('2026-01-01', 60, 12)] }
    const rows = buildSets(S as never, { id: LIFT, sets: 1, reps: 5, weight: 50 }, { preferLast: true })
    expect(rows[0]).toMatchObject({ w: 60, r: 12 })
  })

  it('gives cardio rows minutes and speed, not a seeded rep count', () => {
    const rows = buildSets({ exWeights: {}, workouts: [] } as never, {
      id: 'treadmill-running-walk',
      sets: 2,
      min: 25,
      speed: 9,
    })
    expect(rows).toEqual([
      { min: 25, speed: 9, done: false },
      { min: 25, speed: 9, done: false },
    ])
  })

  it('does not seed a duration from a rep count when the mode changes to time', () => {
    const S = { exWeights: {}, workouts: [wk('2026-01-01', 40, 12)] }
    const rows = buildSets(S as never, { id: LIFT, sets: 1, sec: 60, weight: 30 })
    expect(rows[0]).toMatchObject({ sec: 60, w: 30 })
  })

  it('at least one row, whatever the config says', () => {
    expect(buildSets({ exWeights: {}, workouts: [] } as never, { id: LIFT, sets: 0, reps: 5 })).toHaveLength(1)
  })
})

describe('planned warm-ups', () => {
  it('inserts before the first work row, ramping toward the work weight', () => {
    const rows: WorkoutSet[] = [
      { warmup: true, w: 20, r: 8, done: true },
      { warmup: true, w: 30, r: 8, done: false },
      { w: 60, r: 8, done: false },
    ]
    const next = insertWarmupRow(rows, 'reps', { reps: 8 }, 2.5)
    expect(next.length).toBe(4)
    expect(next[2].warmup).toBe(true)
    expect(next[2].w).toBe(45) // halfway from the last warm-up (30) to the work set (60)
    expect(next[3].w).toBe(60) // work row still after the warm-up block
  })

  it('rounds the ramp DOWN to the step', () => {
    // A warm-up a notch light costs nothing; one a notch heavy needs plates stripping.
    const rows: WorkoutSet[] = [{ w: 61, r: 8, done: false }]
    expect(insertWarmupRow(rows, 'reps', { reps: 8 }, 5)[0].w).toBe(30)
  })

  it('never ramps a warm-up above the set it warms up for', () => {
    // A warm-up edited by hand above the work weight used to hand that too-heavy number down.
    const rows: WorkoutSet[] = [
      { warmup: true, w: 90, r: 8, done: true },
      { w: 60, r: 8, done: false },
    ]
    const next = insertWarmupRow(rows, 'reps', { reps: 8 }, 2.5)
    expect(next[1].w).toBeLessThanOrEqual(60)
  })

  it('has no load to ramp when there is nothing to ramp toward', () => {
    const rows: WorkoutSet[] = [{ w: 0, r: 12, done: false }]
    expect(insertWarmupRow(rows, 'reps', { reps: 12 }, 2.5)[0].w).toBe(0)
  })

  it('inserts planned warm-ups in front, and keeps their count within the cap', () => {
    const S = { exWeights: {}, workouts: [wk('2026-01-01', 100, 5)] }
    const rows = buildSets(S as never, { id: LIFT, sets: 1, reps: 5, weight: 50, warmupSets: 2 })
    expect(rows.filter((r) => r.warmup).length).toBe(2)
    expect(rows[rows.length - 1].w).toBe(100)

    const capped = buildSets(S as never, {
      id: LIFT,
      sets: 1,
      reps: 5,
      weight: 50,
      warmupSets: 99,
    })
    expect(capped.filter((r) => r.warmup).length).toBe(MAX_PLANNED_WARMUPS)
  })
})

describe('removeRowAt', () => {
  it('never empties an entry below one row', () => {
    const rows: WorkoutSet[] = [{ w: 60, r: 5, done: false }]
    expect(removeRowAt(rows, 0)).toHaveLength(1)
  })

  it('removes the row asked for and leaves the rest alone', () => {
    const rows: WorkoutSet[] = [
      { w: 40, r: 5 },
      { w: 60, r: 5 },
      { w: 80, r: 5 },
    ]
    expect(removeRowAt(rows, 1).map((r) => r.w)).toEqual([40, 80])
  })

  it('does not mutate the rows it was given', () => {
    const rows: WorkoutSet[] = [
      { w: 40, r: 5 },
      { w: 60, r: 5 },
    ]
    removeRowAt(rows, 0)
    expect(rows).toHaveLength(2)
  })
})

describe('fmtSec', () => {
  it('pads the seconds to two digits', () => {
    expect(fmtSec(45)).toBe('0:45')
    expect(fmtSec(9)).toBe('0:09')
    expect(fmtSec(125)).toBe('2:05')
    expect(fmtSec(3599)).toBe('59:59')
  })

  it('treats nonsense as zero rather than printing NaN', () => {
    expect(fmtSec(undefined)).toBe('0:00')
    expect(fmtSec('abc')).toBe('0:00')
    expect(fmtSec(-5)).toBe('0:00')
  })
})

describe('workoutDuration', () => {
  it('measures the gap between the two ends', () => {
    expect(workoutDuration({ start: 1000, end: 3600 })).toBe(2600)
  })

  it('accepts the numeric string an import may have stored', () => {
    expect(workoutDuration({ start: '1000', end: '3600' })).toBe(2600)
  })

  it('is zero rather than a guess when an end is missing', () => {
    // A duration invented from half a pair of timestamps is a real number that is not true.
    expect(workoutDuration({ start: 1000 })).toBe(0)
    expect(workoutDuration({ end: 3600 })).toBe(0)
    expect(workoutDuration({})).toBe(0)
  })

  it('is zero when the ends run backwards', () => {
    expect(workoutDuration({ start: 3600, end: 1000 })).toBe(0)
  })
})

describe('timestampOf', () => {
  it('reads a number, a numeric string, and nothing else', () => {
    expect(timestampOf(42)).toBe(42)
    expect(timestampOf('42')).toBe(42)
    expect(timestampOf('')).toBeNull()
    expect(timestampOf('later')).toBeNull()
    expect(timestampOf(null)).toBeNull()
    expect(timestampOf(Number.NaN)).toBeNull()
  })
})