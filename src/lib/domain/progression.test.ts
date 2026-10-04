/**
 * Ported from openGym's `progression.test.js`.
 *
 * The engine's contract is that the next target is *derived* from the log, never stored. These
 * tests therefore care about two things: that a clean session raises the load, and — far more
 * important — that a session that fell apart does not.
 */
import { describe, expect, it } from 'vitest'
import {
  addStep,
  applyPrescription,
  defaultIncrement,
  deloadTo,
  DELOAD_AFTER,
  epley1RM,
  isValidDeloadFactor,
  MAX_BW_SETS,
  nextPrescription,
  planChanged,
  plannedOf,
  policyFor,
  readSession,
  selectDeloadCandidate,
  sessionsFor,
  snapWeight,
  stallCount,
  weightIncrement,
  type ProgressionSession,
} from './progression'
import { CATALOGUE } from './catalogue'
import type { HistoryState, RoutineExercise, SlottedEntry } from './history'
import { syncSideAggregate } from './workout-model'

const bench = (over: Partial<RoutineExercise> = {}): RoutineExercise => ({
  id: 'bench-press',
  sets: 3,
  reps: 8,
  weightKg: 60,
  ...over,
})

/** A finished session, with the plan stamped on it. */
const entry = (
  sets: Record<string, unknown>[],
  over: Partial<SlottedEntry> = {},
): SlottedEntry =>
  ({
    id: 'bench-press',
    sets: sets.map(s => ({ w: 60, r: 8, done: true, ...s })),
    target: bench(),
    ...over,
  }) as SlottedEntry

type Session = { d: string; entries: SlottedEntry[] }

const state = (...workouts: Session[]): HistoryState & { unit: string } => ({
  unit: 'kg',
  workouts,
})

/** `n` clean sessions at `w`, each hitting the target. */
const clean = (n: number, w = 60, reps = 8, extra: Record<string, unknown> = {}) =>
  state(
    ...Array.from({ length: n }, (_, i) => ({
      d: `2026-01-${String(i + 1).padStart(2, '0')}`,
      entries: [entry([{ w, r: reps }, { w, r: reps }, { w, r: reps }], extra)],
    })),
  )

describe('reading a session', () => {
  it('calls a session a hit only when every planned set reached the goal', () => {
    const good = readSession(entry([{ r: 8 }, { r: 8 }, { r: 8 }]), bench())
    expect(good.ok).toBe(true)
    const oneShort = readSession(entry([{ r: 8 }, { r: 6 }, { r: 8 }]), bench())
    expect(oneShort.ok).toBe(false)
  })

  it('counts a set that was never checked off as a miss', () => {
    // You logged what you got, and an unchecked box is not evidence of what you can do.
    const undone = readSession(entry([{ r: 8 }, { r: 8, done: false }, { r: 8 }]), bench())
    expect(undone.ok).toBe(false)
    expect(undone.low).toBe(0)
  })

  it('counts fewer sets than prescribed as a miss', () => {
    const short = readSession(entry([{ r: 8 }, { r: 8 }]), bench())
    expect(short.ok).toBe(false)
  })

  it('ignores a bonus set when deciding what happens next', () => {
    // A set added on top is extra work. It still counts for volume and history — it just does not
    // move the plan.
    const bonus = readSession(
      entry([{ r: 8 }, { r: 8 }, { r: 8 }, { r: 8, w: 200, done: true }]),
      bench(),
    )
    expect(bonus.ok).toBe(true)
    expect(bonus.weight).toBe(60)
  })

  it('ignores a warm-up row entirely', () => {
    const withWarmup = readSession(
      entry([{ r: 20, w: 20, warmup: true, done: true }, { r: 8 }, { r: 8 }, { r: 8 }]),
      bench(),
    )
    expect(withWarmup.ok).toBe(true)
    expect(withWarmup.count).toBe(3)
  })

  it('judges an entry with no target of its own against the current plan', () => {
    // Most history predates target stamping. Judged against nothing, every past session would
    // score as a miss and a long-standing user would be told to deload.
    const legacy = readSession({ id: 'bench-press', sets: [{ w: 60, r: 8, done: true }] }, bench())
    // The plan asks for 3 sets and this session logged 1, so `enough` is false: a session that
    // did not lay out the plan's sets is still short of it. What matters is that it is judged
    // against the plan's goal of 8 rather than against nothing.
    expect(legacy.goal).toBe(8)
    expect(legacy.reps).toEqual([8])
  })
})

describe('the policy in force', () => {
  it('prefers the exercise override, then the routine, then the mode default', () => {
    expect(policyFor(bench({ prog: 'double' }), { prog: 'linear' }, 'reps')).toBe('double')
    expect(policyFor(bench(), { prog: 'greyskull' }, 'reps')).toBe('greyskull')
    expect(policyFor(bench(), {}, 'reps')).toBe('linear')
    expect(policyFor(bench(), {}, 'time')).toBe('off')
  })

  it('falls back to off when the policy cannot drive that mode', () => {
    // Double is reps-only: it asks for less than it grades against.
    expect(policyFor(bench({ prog: 'double' }), {}, 'time')).toBe('off')
    expect(policyFor(bench({ prog: 'greyskull' }), {}, 'cardio')).toBe('off')
  })
})

describe('weight arithmetic', () => {
  it('snaps to a loadable multiple', () => {
    expect(snapWeight(62.55, 2.5)).toBe(62.5)
    // Rounds to the NEAREST multiple. Upstream's comment claims 61.3 → 62.5 with a 1.25 step, but
    // its own maths gives 49 × 1.25 = 61.25, which is 61.3 — the comment is aspirational and the
    // behaviour is the nearest snap. Asserting the behaviour, not the comment.
    expect(snapWeight(61.3, 1.25)).toBe(61.3)
    expect(snapWeight(60, 0)).toBe(60)
  })

  it('steps a weight that sits on the grid onto the grid', () => {
    expect(addStep(60, 2.5, 2.5)).toBe(62.5)
    expect(addStep(62.5, 5, 5)).toBe(67.5)
  })

  it('adds the step plainly when the weight is off the grid', () => {
    // A sled logged as 397 lb with a 10 lb step goes to 407, not the grid's 410.
    expect(addStep(397, 10, 10)).toBe(407)
  })

  it('never steps below zero', () => {
    expect(addStep(0, -5, 5)).toBe(0)
  })

  it('steps by unit, and honours an explicit increment', () => {
    expect(defaultIncrement('bench-press', 'kg')).toBe(2.5)
    expect(defaultIncrement('bench-press', 'lb')).toBe(5)
    expect(weightIncrement({ id: 'bench', inc: 1.25 }, 'kg')).toBe(1.25)
  })

  it('has no heavy-body-part step on this catalogue, and says why', () => {
    // Upstream gives lower-body lifts a bigger default jump, keyed on body parts like
    // "upper legs". This dataset groups by muscle region instead, so none of those values exist
    // and the heavy branch cannot fire. Recorded rather than asserted as a number that cannot hold:
    // when the catalogue gains a body-part taxonomy this becomes reachable again.
    const heavyRegions = ['upper legs', 'lower legs', 'hips']
    const known = new Set(CATALOGUE.map(e => e.bodyPart))
    for (const region of heavyRegions) expect(known.has(region)).toBe(false)
    expect(defaultIncrement('squat', 'kg')).toBe(2.5)
  })

  it('deloads to something loadable, and never up', () => {
    expect(deloadTo(60, 2.5)).toBeLessThan(60)
    expect(deloadTo(2.5, 2.5)).toBeGreaterThanOrEqual(2.5)
  })

  it('validates the deload factor band', () => {
    expect(isValidDeloadFactor(0.9)).toBe(true)
    expect(isValidDeloadFactor(0.2)).toBe(false)
    expect(isValidDeloadFactor(1.5)).toBe(false)
  })
})

describe('linear progression', () => {
  it('raises the load after a clean session', () => {
    const p = nextPrescription(clean(1), bench(), { prog: 'linear' })
    expect(p.kind).toBe('up')
    expect(p.weight).toBe(62.5)
  })

  it('holds the load after one miss', () => {
    const s = state(
      { d: '2026-01-01', entries: [entry([{ r: 8 }, { r: 8 }, { r: 8 }])] },
      { d: '2026-01-02', entries: [entry([{ r: 6 }, { r: 6 }, { r: 6 }])] },
    )
    const p = nextPrescription(s, bench(), { prog: 'linear' })
    expect(p.kind).toBe('hold')
    expect(p.weight).toBe(60)
  })

  it('deloads after the configured run of misses', () => {
    const runs = DELOAD_AFTER.linear as number
    const misses = state(
      ...Array.from({ length: runs }, (_, i) => ({
        d: `2026-01-0${i + 1}`,
        entries: [entry([{ r: 5 }, { r: 5 }, { r: 5 }])],
      })),
    )
    const p = nextPrescription(misses, bench(), { prog: 'linear' })
    expect(p.kind).toBe('deload')
    expect(p.weight!).toBeLessThan(60)
  })

  it('never raises the load after a session that fell apart', () => {
    // The whole point: a session that missed must not look like progress.
    const broken = state(
      { d: '2026-01-01', entries: [entry([{ r: 8 }, { r: 8 }, { r: 8 }])] },
      { d: '2026-01-02', entries: [entry([{ r: 2 }, { r: 2 }])] }, // short AND short of reps
    )
    const p = nextPrescription(broken, bench(), { prog: 'linear' })
    expect(p.kind).not.toBe('up')
  })

  it('always explains itself', () => {
    const p = nextPrescription(clean(1), bench(), { prog: 'linear' })
    expect(p.why.length).toBeGreaterThan(0)
    expect(p.why[0]).toContain('{0}')
  })
})

describe('greyskull', () => {
  it('takes a double jump when the final set doubled the target', () => {
    const s = state({
      d: '2026-01-01',
      entries: [entry([{ r: 8 }, { r: 8 }, { r: 16 }])],
    })
    const p = nextPrescription(s, bench(), { prog: 'greyskull' })
    expect(p.kind).toBe('up')
    expect(p.weight).toBe(65) // 2.5 × 2, not 2.5
  })

  it('takes a normal step when the final set only met the target', () => {
    const p = nextPrescription(clean(1, 60, 8, {}), bench(), { prog: 'greyskull' })
    expect(p.weight).toBe(62.5)
  })

  it('deloads after a single miss — that is the policy point', () => {
    expect(DELOAD_AFTER.greyskull).toBe(1)
    const s = state({
      d: '2026-01-01',
      entries: [entry([{ r: 8 }, { r: 8 }, { r: 4 }])],
    })
    expect(nextPrescription(s, bench(), { prog: 'greyskull' }).kind).toBe('deload')
  })
})

describe('double progression', () => {
  const range = bench({ reps: 10, repsMin: 8 })

  it('holds the weight and aims inside the range', () => {
    const s = state({
      d: '2026-01-01',
      entries: [entry([{ r: 8 }, { r: 8 }, { r: 8 }], { target: range })],
    })
    const p = nextPrescription(s, range, { prog: 'double' })
    expect(p.kind).toBe('hold')
    expect(p.weight).toBe(60)
    expect(p.reps).toBeGreaterThan(8)
    expect(p.reps!).toBeLessThanOrEqual(10)
  })

  it('adds weight only when every set reaches the TOP of the range', () => {
    // Hitting a target that sat below the top is compliance with that session, not progress.
    const s = state({
      d: '2026-01-01',
      entries: [entry([{ r: 10 }, { r: 10 }, { r: 10 }], { target: range })],
    })
    const p = nextPrescription(s, range, { prog: 'double' })
    expect(p.kind).toBe('up')
    expect(p.reps).toBe(8) // back to the bottom
  })

  it('does not deload when the lifter beat the run instead of repeating it', () => {
    const s = state(
      { d: '2026-01-01', entries: [entry([{ r: 8 }, { r: 8 }, { r: 8 }], { target: range })] },
      { d: '2026-01-02', entries: [entry([{ r: 9 }, { r: 9 }, { r: 9 }], { target: range })] },
    )
    expect(stallCount(sessionsFor(s, 'bench-press', range), 'double')).toBe(0)
  })
})

describe('bodyweight work', () => {
  const pushup = { id: 'push-up', sets: 3, reps: 10, bodyweight: true } as RoutineExercise

  it('climbs in reps, because there is no load to add', () => {
    const s = state({
      d: '2026-01-01',
      entries: [
        {
          id: 'push-up',
          target: pushup,
          sets: [{ r: 10, done: true }, { r: 10, done: true }, { r: 10, done: true }],
        } as SlottedEntry,
      ],
    })
    const p = nextPrescription(s, pushup, { prog: 'linear' })
    expect(p.kind).toBe('up')
    expect(p.reps).toBe(11)
    expect(p.weight).toBe(0)
  })

  it('holds the target after a miss', () => {
    const s = state({
      d: '2026-01-01',
      entries: [
        {
          id: 'push-up',
          target: pushup,
          sets: [{ r: 8, done: true }, { r: 10, done: true }, { r: 10, done: true }],
        } as SlottedEntry,
      ],
    })
    expect(nextPrescription(s, pushup, { prog: 'linear' }).kind).toBe('hold')
  })

  it('asks for the weight on a loaded lift logged at 0', () => {
    // Climbing a bench press's reps as though it were a push-up turned 2×10 into 2×11, 12…
    const s = state({
      d: '2026-01-01',
      entries: [entry([{ w: 0, r: 8 }, { w: 0, r: 8 }, { w: 0, r: 8 }])],
    })
    const p = nextPrescription(s, bench(), { prog: 'linear' })
    expect(p.kind).toBe('hold')
    expect(p.why[0]).toContain('No weight logged')
  })
})

describe('stall counting', () => {
  const s = (oks: boolean[]): ProgressionSession[] =>
    oks.map((ok, i) => ({
      mode: 'reps',
      target: bench(),
      goal: 8,
      weight: 60,
      ok,
      reps: [ok ? 8 : 5],
      d: `2026-01-0${i + 1}`,
    }))

  it('counts consecutive misses backwards from the newest', () => {
    expect(stallCount(s([true, false, false]), 'linear')).toBe(2)
  })

  it('stops at a hit', () => {
    expect(stallCount(s([false, false, true, false]), 'linear')).toBe(1)
  })

  it('ends the streak when the weight changed', () => {
    // A deload must reflect the failures that earned it, not the lighter weight that follows.
    const mixed = s([false, false])
    mixed[1].weight = 55
    expect(stallCount(mixed, 'linear')).toBe(1)
  })

  it('ignores a session that does not count', () => {
    const withDeload = state({
      d: '2026-01-02',
      entries: [entry([{ r: 5 }, { r: 5 }, { r: 5 }], { noProg: true })],
    })
    expect(sessionsFor(withDeload, 'bench-press', bench())).toEqual([])
  })
})

describe('plan changes and first sessions', () => {
  it('starts from the plan when nothing is logged', () => {
    const p = nextPrescription({ unit: 'kg', workouts: [] }, bench(), { prog: 'linear' })
    expect(p.kind).toBe('first')
  })

  it('detects a plan edited since the session was stamped', () => {
    expect(planChanged(plannedOf(bench({ sets: 3, reps: 8 })), bench({ reps: 10 }))).toBe(true)
    expect(planChanged(plannedOf(bench()), bench())).toBe(false)
  })

  it('re-anchors on the new plan rather than progressing from the old one', () => {
    const s = state({
      d: '2026-01-01',
      entries: [entry([{ r: 8 }, { r: 8 }, { r: 8 }], { planned: plannedOf(bench()) })],
    })
    const p = nextPrescription(s, bench({ reps: 10 }), { prog: 'linear' })
    expect(p.kind).toBe('hold')
    expect(p.reps).toBe(10)
  })
})

describe('applying a prescription', () => {
  it('never rewrites a logged set', () => {
    // A logged set is what happened; rewriting it would be data loss.
    const sets = [{ w: 60, r: 8, done: true }]
    const out = applyPrescription(sets, { policy: 'linear', kind: 'up', weight: 62.5, why: [] })
    expect(out[0].w).toBe(60)
  })

  it('writes the prescription onto open work rows', () => {
    const out = applyPrescription([{ w: 60, r: 8, done: false }], {
      policy: 'linear',
      kind: 'up',
      weight: 62.5,
      reps: 9,
      why: [],
    })
    expect(out[0]).toMatchObject({ w: 62.5, r: 9 })
  })

  it('halves the prescribed reps onto each limb of a per-side row', () => {
    const side = syncSideAggregate({
      sides: { L: { w: 40, r: 5, done: false }, R: { w: 40, r: 5, done: false } },
    })
    const out = applyPrescription([side], { policy: 'linear', kind: 'up', reps: 10, why: [] })
    expect(out[0].sides?.L?.r).toBe(5)
    expect(out[0].sides?.R?.r).toBe(5)
  })

  it('adds a set when a bodyweight policy decided on one', () => {
    const out = applyPrescription([{ r: 20, done: false }], {
      policy: 'linear',
      kind: 'up',
      weight: 0,
      reps: 10,
      sets: 3,
      why: [],
    })
    expect(out.filter(s => !s.warmup)).toHaveLength(3)
  })

  it('caps the set count in the prescription, not in the applier', () => {
    // MAX_BW_SETS lives in nextPrescription: past the ceiling it returns kind 'hold' with an
    // explanation instead of asking for another set, because more volume stops being the answer.
    // applyPrescription grows whatever set count it is handed, so the cap cannot live there too.
    expect(MAX_BW_SETS).toBe(6)
    const pushup = {
      id: 'push-up',
      sets: MAX_BW_SETS,
      reps: 20,
      repsMax: 20,
      bodyweight: true,
    } as RoutineExercise
    const s = state({
      d: '2026-01-01',
      entries: [
        {
          id: 'push-up',
          target: pushup,
          sets: Array.from({ length: MAX_BW_SETS }, () => ({ r: 20, done: true })),
        } as SlottedEntry,
      ],
    })
    const p = nextPrescription(s, pushup, { prog: 'linear' })
    expect(p.kind).toBe('hold')
    expect(p.sets).toBeUndefined()
    expect(p.why[0]).toContain('time to add weight')
  })

  it('re-ramps the warm-up block toward the new working weight', () => {
    // Last, because the work rows now carry their final weight: the ramp has to point at what the
    // lifter is about to do, not at what they lifted last time.
    const sets = [
      { w: 30, r: 8, done: false, warmup: true },
      { w: 45, r: 5, done: false, warmup: true },
      { w: 60, r: 8, done: false },
    ]
    const out = applyPrescription(sets, {
      policy: 'linear',
      kind: 'up',
      weight: 100,
      why: [],
    })
    expect(out[2].w).toBe(100)
    // a two-row ramp on a 100 kg target: 50 % then 75 %
    expect(out[0].w).toBe(50)
    expect(out[1].w).toBe(75)
  })

  it('leaves a logged warm-up alone — it happened at its own weight', () => {
    const sets = [
      { w: 30, r: 8, done: true, warmup: true },
      { w: 60, r: 8, done: false },
    ]
    const out = applyPrescription(sets, { policy: 'linear', kind: 'up', weight: 100, why: [] })
    expect(out[0].w).toBe(30)
  })

  it('leaves the list alone for a policy that decided nothing', () => {
    const sets = [{ w: 60, r: 8, done: false }]
    expect(applyPrescription(sets, { policy: 'off', kind: 'off', why: [] })).toBe(sets)
    expect(applyPrescription(sets, null)).toBe(sets)
  })
})

describe('Epley deload selection', () => {
  it('picks a load below the current one and never above it', () => {
    const c = selectDeloadCandidate({
      currentWeight: 100,
      targetWeight: 100,
      targetReps: 8,
      step: 2.5,
    })
    expect(c).not.toBeNull()
    expect(c!.weight).toBeLessThanOrEqual(100)
    expect(c!.reps).toBeGreaterThanOrEqual(8)
  })

  it('refuses when there is nothing to deload from', () => {
    expect(
      selectDeloadCandidate({ currentWeight: 0, targetWeight: 100, targetReps: 8, step: 2.5 }),
    ).toBeNull()
  })

  it('computes Epley the usual way', () => {
    expect(epley1RM(100, 5)).toBe(116.7)
  })
})