/**
 * Progression: how the next session is derived from the last one.
 *
 * Adapted from openGym's `progression.js` (https://github.com/DuarteSantos8/openGym,
 * AGPL-3.0-or-later, Copyright (C) 2026 Duarte Santos). See NOTICE.md.
 *
 * Everything here is a **pure function of the workout history**. Nothing writes back into a
 * finished workout: the log is what happened, and the next prescription is derived from it every
 * time one is needed. That means changing a policy — or fixing a mistyped set — immediately produces
 * the right next target, with no stored counters to drift out of sync.
 *
 * Reading a session honestly is the whole game:
 *   · a set checked off with at least its target reps  → hit
 *   · a set checked off with fewer reps                → miss (you logged what you got)
 *   · a set never checked off                          → miss (it was not performed)
 *   · fewer sets than prescribed                       → miss
 * So a session that fell apart can never advance the load as though it had succeeded.
 */
import { isAssisted, isLoadedEq, EXIDX } from './catalogue'
import {
  entryExcluded,
  entryRoutineId,
  isBw,
  isPerSide,
  modeOf,
  repStep,
  type HistoryState,
  type Routine,
  type RoutineExercise,
  type SlottedEntry,
} from './history'
import { estimate1RM } from './onerm'
import { normalizeRepRange } from './rep-range'
import {
  isSideSet,
  isWarmupRow,
  makeSideSet,
  syncSideAggregate,
  type Mode,
  type WorkoutSet,
} from './workout-model'

/** The progression rules this module knows. */
export const POLICIES = ['off', 'linear', 'greyskull', 'double', 'time'] as const
export type Policy = (typeof POLICIES)[number]

/**
 * Which rules can sensibly drive which logging mode.
 *
 * Double is reps-only because it is the one policy that deliberately asks for less than it grades
 * against: it climbs from the bottom of the range while `ok` needs the top.
 */
export const POLICIES_FOR: Record<Mode, readonly Policy[]> = {
  reps: ['off', 'linear', 'greyskull', 'double'],
  time: ['off', 'time'],
  cardio: ['off'],
}

export const POLICY_NAME: Record<Policy, string> = {
  off: 'No automatic progression',
  linear: 'Linear progression',
  greyskull: 'Greyskull LP',
  double: 'Double progression',
  time: 'Add time',
}

export const POLICY_DESC: Record<Policy, string> = {
  off: 'Targets stay where you set them.',
  linear: 'Hit every rep in every set and the weight goes up. Repeated misses trigger a deload.',
  greyskull:
    'Two straight sets plus a final set taken to failure. Beat the target on that set and the weight goes up — double if you double the reps. One failure resets 10 %.',
  double:
    'Work up through a rep range at the same weight. Reach the top of the range in every set and the weight goes up, reps back to the bottom.',
  time: 'Hold every set for the full duration and the target goes up.',
}

/**
 * At or below this a set is close enough to failure to be the kind that drives adaptation.
 * 3 rather than 2: the line is a convention, and drawn one rep too generously it still separates
 * working sets from the ones left in the warm-up range.
 */
export const HARD_RIR = 3

// Default deload factor. Kept out of saved configs so plans written before this policy stays
// byte-for-byte compatible.
export const DELOAD_FACTOR = 0.9

/** How many misses in a row trigger a deload, per policy. */
export const DELOAD_AFTER: Partial<Record<Policy, number>> = {
  linear: 3,
  greyskull: 1,
  double: 3,
  time: 3,
}

export const DELOAD_FACTOR_MIN = 0.5
export const DELOAD_FACTOR_MAX = 0.95

export function isValidDeloadFactor(value: unknown): boolean {
  const factor = Number(value)
  return Number.isFinite(factor) && factor >= DELOAD_FACTOR_MIN && factor <= DELOAD_FACTOR_MAX
}

export function deloadFactorOf(cfg: { deloadFactor?: unknown } | null | undefined): number {
  return isValidDeloadFactor(cfg?.deloadFactor) ? Number(cfg?.deloadFactor) : DELOAD_FACTOR
}

// Body parts where a 5 kg jump is normal rather than brutal.
const HEAVY_BP = new Set(['upper legs', 'lower legs', 'back', 'hips', 'glutes'])

/**
 * Default load step. Lower-body lifts take the bigger jump — that is the "lift-specific
 * increment" a linear program lives on; an exercise can override it with its own `inc`.
 */
export function defaultIncrement(exId: string | undefined, unit: string): number {
  const heavy = !!exId && HEAVY_BP.has(String(EXIDX[exId]?.bodyPart ?? ''))
  if (unit === 'lb') return heavy ? 10 : 5
  return heavy ? 5 : 2.5
}

/**
 * The load step for reps-mode weight controls and progression.
 *
 * Timed exercises use `inc` for seconds, so their optional weight column must not call this.
 */
export function weightIncrement(cfg: RoutineExercise | null | undefined, unit: string): number {
  const inc = Number(cfg?.inc)
  return cfg && inc > 0 ? inc : defaultIncrement(cfg?.id, unit)
}

export const DEFAULT_SEC_INCREMENT = 5

/**
 * Where adding another set of push-ups stops being progress and starts being a way to spend an
 * evening. Past this the honest advice is load or a harder variation.
 */
export const MAX_BW_SETS = 6

/**
 * The policy in force for one exercise: its own override, else the routine's default, else the
 * mode's default. Reps keeps behaving the way the app always did.
 */
export function policyFor(
  cfg: RoutineExercise | null | undefined,
  routine: Partial<Routine> | null | undefined,
  mode?: Mode,
): Policy {
  const m = mode ?? modeOf(cfg)
  const allowed = POLICIES_FOR[m] ?? ['off']
  const pick =
    (cfg?.prog as Policy) ?? (routine?.prog as Policy) ?? (m === 'reps' ? 'linear' : 'off')
  return allowed.includes(pick) ? pick : 'off'
}

const round1 = (v: number) => Math.round(v * 10) / 10

/** Snap to a loadable multiple of the step. */
export function snapWeight(v: number, step: number): number {
  if (!(step > 0)) return round1(v)
  return round1(Math.round(v / step) * step)
}

/**
 * Add `step` to a weight the way a stepper tap does: from a weight that sits on the increment's
 * grid the sum is snapped to it, from one off the grid the step is simply added.
 *
 * The grid check matters: a sled logged as 397 lb — its own weight plus plates — with a 10 lb step
 * goes to 407, not to the grid's 410.
 */
export function addStep(w: number, step: number, inc: number): number {
  const v = +w || 0
  const onGrid = inc > 0 && Math.abs(v - Math.round(v / inc) * inc) <= 0.1
  const next = v + step
  return Math.max(0, onGrid ? snapWeight(next, inc) : round1(next))
}

export function stepWeight(value: number, step: number, direction: number): number {
  return addStep(Number(value) || 0, direction * step, step)
}

/**
 * Back off by a factor, landing on something you can actually load.
 *
 * This is the old policy still used by Greyskull and timed progression; linear and double use the
 * Epley selector below instead.
 */
export function deloadTo(cur: number, step: number, factor: number = DELOAD_FACTOR): number {
  let next = snapWeight(cur * factor, step)
  if (next >= cur) next = snapWeight(cur - step, step)
  return Math.max(step, next)
}

/** Epley uses the reps performed by one side for unilateral work. */
export function epley1RM(weight: number, reps: number): number | null {
  const result = weight * (1 + reps / 30)
  return Number.isFinite(result) && result > 0 ? round1(result) : null
}

/** The estimated 1RM a deload is aiming at. */
export function deloadTarget1RM(
  weight: number,
  reps: number,
  factor: number = DELOAD_FACTOR,
  perSide = false,
): number | null {
  const base = epley1RM(weight, perSide ? reps / 2 : reps)
  const f = isValidDeloadFactor(factor) ? Number(factor) : DELOAD_FACTOR
  return base == null ? null : round1(base * f)
}

const positiveGridAround = (
  ideal: number,
  step: number,
  maxWeight: number,
  strictLower: boolean,
): number[] => {
  if (!(ideal > 0) || !(step > 0) || !(maxWeight > 0)) return []
  const low = Math.floor(ideal / step) * step
  const high = Math.ceil(ideal / step) * step
  const values = [...new Set([low, high].map(v => snapWeight(v, step)))]
  return values
    .filter(v => v > 0 && v <= maxWeight + 1e-9 && (!strictLower || v < maxWeight - 1e-9))
    .sort((a, b) => a - b)
}

/** A bounded load/reps pair the deload settled on. */
export interface DeloadCandidate {
  weight: number
  reps: number
  /** Epley of this candidate. */
  epley: number
  /** Distance from the target 1RM; the ranking's first key. */
  error: number
  /** Rep change from the session's upper bound. */
  repChange: number
  /** True when no positive lower grid point existed and the attempted load was held. */
  fallback: boolean
  target1RM: number
  factor: number
  upper: number
  bottom: number
}

/**
 * Pick a bounded load/reps pair for an Epley target.
 *
 * The search is deliberately lexicographic: hard constraints first, then closest estimated 1RM,
 * fewer rep changes, and greater load. That makes a grid tie predictable without hiding a product
 * decision in arbitrary score weights.
 */
export function selectDeloadCandidate(opts: {
  currentWeight: number
  targetWeight: number
  targetReps: number
  step: number
  factor?: number
  reps?: number
  repsMin?: number | null
  perSide?: boolean
}): DeloadCandidate | null {
  const { currentWeight, targetWeight, targetReps, step, reps, repsMin, perSide = false } = opts
  const factor = opts.factor ?? DELOAD_FACTOR
  const current = Number(currentWeight)
  const baseWeight = Number(targetWeight)
  const baseReps = Number(targetReps)
  const stride = perSide ? 2 : 1
  const upper = Math.max(stride, Math.ceil(baseReps / stride) * stride)
  const range = repsMin == null ? null : normalizeRepRange(reps, repsMin, stride)
  const top = range ? Math.min(range.reps, Math.max(range.repsMin, upper)) : upper
  const bottom = range ? range.repsMin : top

  const repValues: number[] = []
  for (let r = top; r >= bottom; r -= stride) repValues.push(r)

  const target1RM = deloadTarget1RM(baseWeight, upper, factor, perSide)
  if (!(current > 0) || target1RM == null || !repValues.length || !(step > 0)) return null

  const candidates: Omit<DeloadCandidate, 'target1RM' | 'factor' | 'upper' | 'bottom'>[] = []
  repValues.forEach(candidateReps => {
    const ideal = target1RM / (1 + (perSide ? candidateReps / 2 : candidateReps) / 30)
    const allowCurrent = repsMin != null && candidateReps < upper
    const grid = positiveGridAround(ideal, step, current, !allowCurrent)
    if (allowCurrent && !grid.includes(current)) grid.push(current)
    grid.forEach(candidateWeight => {
      const epley = epley1RM(candidateWeight, perSide ? candidateReps / 2 : candidateReps) ?? 0
      candidates.push({
        weight: candidateWeight,
        reps: candidateReps,
        epley,
        error: Math.abs(epley - target1RM),
        repChange: Math.abs(candidateReps - upper),
        fallback: false,
      })
    })
  })

  // A tiny or below-step lift may have no positive lower grid point. Holding the actual attempted
  // load is safer than rounding it up to one step; it is an explicit, deterministic fallback.
  if (!candidates.length) {
    repValues.forEach(candidateReps => {
      const epley = epley1RM(current, perSide ? candidateReps / 2 : candidateReps) ?? 0
      candidates.push({
        weight: current,
        reps: candidateReps,
        epley,
        error: Math.abs(epley - target1RM),
        repChange: Math.abs(candidateReps - upper),
        fallback: true,
      })
    })
  }
  if (!candidates.length) return null
  candidates.sort(
    (a, b) => a.error - b.error || a.repChange - b.repChange || b.weight - a.weight || b.reps - a.reps,
  )
  return {
    ...candidates[0],
    target1RM,
    factor: isValidDeloadFactor(factor) ? Number(factor) : DELOAD_FACTOR,
    upper,
    bottom,
  }
}

/**
 * What a routine's exercise asks for, stamped onto every entry a session builds.
 *
 * A prescription moves the session's target; this keeps what the routine said, which is the only
 * way the next session can tell a plan that was edited from one that progressed.
 */
export function plannedOf(cfg: RoutineExercise | null | undefined): Record<string, number> {
  const c = cfg ?? ({} as RoutineExercise)
  const mode = modeOf(c)
  const out: Record<string, number> = { sets: Math.max(1, c.sets || 1) }
  if (mode === 'reps' && c.reps! > 0) out.reps = c.reps as number
  if (mode === 'reps' && c.repsMin! > 0) out.repsMin = c.repsMin as number
  if (mode === 'time' && (c as { sec?: number }).sec! > 0)
    out.sec = (c as { sec?: number }).sec as number
  if (c.weight != null) out.weight = c.weight as number
  return out
}

const PLAN_KEYS = ['sets', 'reps', 'repsMin', 'sec'] as const
const samePlan = (a: Record<string, unknown>, b: Record<string, unknown>): boolean =>
  PLAN_KEYS.every(k => (a[k] ?? null) === (b[k] ?? null))

/** Did the routine's sets or reps change since the session that stamped `planned`? */
export function planChanged(
  planned: Record<string, unknown> | null | undefined,
  cfg: RoutineExercise | null | undefined,
): boolean {
  return !!planned && !samePlan(planned, plannedOf(cfg))
}

/**
 * Work with no load to enter climbs in reps, then sets, when logged at 0.
 *
 * Only a loaded implement logged at 0 is a weight nobody typed in. An assistance machine at 0 is
 * the one exception on a stack: no help left is where its own progression leads.
 */
const climbsReps = (cfg: RoutineExercise): boolean =>
  isBw(cfg) || !isLoadedEq(cfg.id) || isAssisted(cfg.id)

/** The load the session is judged by. */
function loadOf(entry: SlottedEntry | null | undefined, sets: WorkoutSet[]): number {
  const done = sets.filter(s => s.done).map(s => Number(s.w) || 0)
  if (!isAssisted(entry?.id ?? '')) return Math.max(0, ...done)
  // On an assistance machine less is harder, so the set that counts is the one with the least
  // help — and a 0 there means "no load logged", not "best ever".
  const loaded = done.filter(w => w > 0)
  return loaded.length ? Math.min(...loaded) : 0
}

/** A session reduced to what a policy needs to judge it. */
export interface SessionRead {
  mode: Mode
  target: RoutineExercise
  goal: number
  /** Load the session is judged by. */
  weight: number
  /** Every planned set hit its goal. */
  ok: boolean
  /** Reps per planned set. Absent in time mode, where `held` carries the numbers instead. */
  reps?: number[]
  held?: number[]
  /** Reps per set. */
  count?: number
  /** The lowest rep count of the session. */
  low?: number
  /** The final set, which is Greyskull's set to failure. */
  amrap?: number
  best?: number
}

/**
 * Reduce one finished workout entry to what a policy needs to judge it.
 *
 * Workouts only started recording their prescription in a later version, so most existing history has
 * no target at all. Judging those against nothing would score every past session as a miss — and
 * then greet a long-standing user with "missed reps 11 sessions running, deload". So an entry
 * without its own target is judged against `fallback`, the exercise's current plan.
 *
 * Only the sets the plan asked for decide what happens next. A set added on top is extra work: one
 * heavier bonus set used to raise the weight for next time. Extra sets still count everywhere else —
 * volume, records, history — they just do not move the plan.
 */
export function readSession(
  entry: SlottedEntry | null | undefined,
  fallback: RoutineExercise | null | undefined,
): SessionRead {
  const target = (entry?.target as RoutineExercise) ?? fallback ?? ({} as RoutineExercise)
  const mode = modeOf({ ...target, ...(entry?.id ? { id: entry.id } : {}) })
  // Warm-up rows are prep, not the session: one filtered read beats guarding every consumer below.
  const logged = (entry?.sets ?? []).filter(s => !isWarmupRow(s))
  const planned = target.sets || logged.length
  const enough = logged.length >= planned
  const sets = logged.slice(0, Math.max(1, planned))

  if (mode === 'time') {
    const goal = Number(target.sec) || 0
    const held = sets.map(s => (s.done ? Number(s.sec) || 0 : 0))
    return {
      mode,
      target,
      goal,
      held,
      weight: loadOf(entry, sets),
      best: Math.max(0, ...held),
      ok: goal > 0 && enough && held.length > 0 && held.every(h => h >= goal),
    }
  }

  const goal = Number(target.reps) || 0
  const reps = sets.map(s => (s.done ? Number(s.r) || 0 : 0))
  return {
    mode,
    target,
    goal,
    reps,
    weight: loadOf(entry, sets),
    count: reps.length,
    low: reps.length ? Math.min(...reps) : 0,
    amrap: reps.length ? reps[reps.length - 1] : 0,
    ok: goal > 0 && enough && reps.length > 0 && reps.every(r => r >= goal),
  }
}

/** One past session, as the progression engine reads it. */
export interface ProgressionSession extends SessionRead {
  /** ISO date of the session. */
  d?: string
  /** The routine slot it belongs to. */
  rid?: string
  /** The plan it was built from, so a stale baseline is visible. */
  planned?: Record<string, unknown>
}

/**
 * Every past session for one exercise, oldest first.
 *
 * With a routine id, the sessions that routine trained: a heavy day and a light day of the same lift
 * each progress on their own line. A routine with no session of its own reads the exercise's whole
 * history instead, so a new or copied routine continues from where you are.
 */
export function sessionsFor(
  S: HistoryState,
  exId: string,
  fallback: RoutineExercise | null | undefined,
  rid?: string | null,
): ProgressionSession[] {
  if (rid) {
    const own = sessionsIn(S, exId, fallback, rid)
    if (own.length) return own
  }
  return sessionsIn(S, exId, fallback, null)
}

function sessionsIn(
  S: HistoryState,
  exId: string,
  fallback: RoutineExercise | null | undefined,
  rid: string | null,
): ProgressionSession[] {
  const out: ProgressionSession[] = []
  for (const w of S.workouts ?? []) {
    const entry = ((w.entries ?? []) as SlottedEntry[]).find(
      e => e && e.id === exId && (!rid || entryRoutineId(w, e) === rid),
    )
    if (!entry) continue
    // A session that does not count for this exercise cannot become the baseline for its next
    // prescription. This is the only progression-exclusion path in the module.
    if (entryExcluded(w, entry)) continue
    if (!entry.sets?.some(s => s.done && !isWarmupRow(s))) continue
    const slot = entryRoutineId(w, entry)
    // Built explicitly rather than spread: in time mode a session carries `held` and no `reps`,
    // and a spread of an optional field cannot be proved present.
    const read = readSession(entry, fallback)
    out.push({
      ...read,
      d: w.d,
      ...(slot ? { rid: slot } : {}),
      ...(entry.planned ? { planned: entry.planned } : {}),
    })
  }
  return out
}

/**
 * How many sessions in a row ended in a miss, counting back from the most recent.
 *
 * Three things end a stall streak besides a hit: a change of weight (a deload must reflect the
 * failures that earned it, not the lighter weight that follows), an edit of the plan (misses against
 * the old sets × reps say nothing about the new ones), and — under double progression — beating the
 * best of the current run at the same weight, which is progress rather than a stall.
 */
export function stallCount(sessions: ProgressionSession[], policy: Policy): number {
  let n = 0
  for (let i = sessions.length - 1; i >= 0; i--) {
    if (sessions[i].ok) break
    if (i < sessions.length - 1 && sessions[i].weight !== sessions[i + 1].weight) break
    if (
      i < sessions.length - 1 &&
      sessions[i].planned &&
      sessions[i + 1].planned &&
      !samePlan(sessions[i].planned!, sessions[i + 1].planned!)
    )
      break
    if (policy === 'double') {
      // Scoped to the current session's weight: rebuilding after a deload must not be measured
      // against the reps managed before the deload.
      const run: number[] = []
      for (let j = i - 1; j >= 0 && sessions[j].weight === sessions[i].weight; j--)
        run.push(sessions[j].low ?? 0)
      if (run.length && (sessions[i].low ?? 0) > Math.max(...run)) break
    }
    n++
  }
  return n
}

/** What the next session should be, and why. */
export interface Prescription {
  policy: Policy
  /** What kind of decision this was. */
  kind: 'first' | 'up' | 'hold' | 'deload' | 'off'
  /** Prescribed load, when the policy had an opinion. */
  weight?: number
  /** Prescribed reps, when the policy had an opinion. */
  reps?: number
  /** Prescribed hold, for a timed exercise. */
  sec?: number
  /** Prescribed set count, for bodyweight progression. */
  sets?: number
  /** The 1RM a deload aimed at. */
  target1RM?: number
  deloadFactor?: number
  /** A translatable template plus its args, so the app can always answer "why this number?". */
  why: string[]
}

type ProgressionState = HistoryState & { unit?: string }

/** A timed exercise's prescribed hold, read off whatever field the config carries. */
function targetSec(cfg: RoutineExercise): number | undefined {
  const v = (cfg as { sec?: number }).sec
  return typeof v === 'number' ? v : undefined
}

/**
 * The next prescription for one exercise.
 *
 * A field the policy has no opinion on comes back undefined and the caller keeps whatever the plan
 * said. `why` is a template and its args rather than a finished sentence, so the UI can translate
 * the reason rather than ship one language's prose.
 */
export function nextPrescription(
  S: ProgressionState,
  cfg: RoutineExercise,
  routine?: Partial<Routine> | null,
): Prescription {
  const mode = modeOf(cfg)
  const policy = policyFor(cfg, routine, mode)
  const unit = S.unit || 'kg'
  const configuredInc = Number(cfg.inc)
  const inc =
    mode === 'time'
      ? configuredInc > 0
        ? configuredInc
        : DEFAULT_SEC_INCREMENT
      : weightIncrement(cfg, unit)

  if (policy === 'off') return { policy, kind: 'off', why: [] }

  // An assistance machine progresses downwards: the stack carries part of your weight, so the
  // reward for a clean session is less help, and a stall means taking more. Only the direction
  // changes — the step, the grid and the stall counting are the same.
  const assisted = isAssisted(cfg.id ?? '')
  const harder = (weight: number, step: number) =>
    assisted ? Math.max(0, addStep(weight, -step, inc)) : addStep(weight, step, inc)
  const easier = (weight: number) =>
    assisted ? addStep(weight, inc, inc) : deloadTo(weight, inc)

  const sessions = sessionsFor(S, cfg.id, cfg, routine?.id).filter(s => s.mode === mode)
  const last = sessions[sessions.length - 1]
  if (!last)
    return { policy, kind: 'first', why: ['Nothing logged yet — this session sets the baseline.'] }

  // Start again from the plan when the last session was built from a different one: the routine's
  // sets or reps were edited since, or the session is borrowed from another routine whose plan was
  // not this one's. Its numbers were judged against the old target, so they cannot say where the
  // new one stands.
  const borrowed = !!routine?.id && last.rid !== routine.id
  if (last.planned ? planChanged(last.planned, cfg) : borrowed) {
    const why = [
      borrowed
        ? 'First time in this routine — starting from its own target.'
        : 'Plan changed — starting from your new target.',
    ]
    const set =
      Number(cfg.weight) > 0 && last.planned && (last.planned.weight ?? null) !== cfg.weight
        ? { weight: cfg.weight as number }
        : null
    if (mode === 'time') {
      return {
        policy,
        kind: 'hold',
        ...(set ?? {}),
        sec: (targetSec(cfg) ?? last.goal) || undefined,
        why,
      }
    }
    if (!set && last.weight <= 0 && climbsReps(cfg))
      return { policy, kind: 'hold', weight: 0, reps: cfg.reps || undefined, why }
    const plannedWeight = Number(cfg.weight)
    const held =
      set ??
      (last.weight > 0 ? { weight: last.weight } : plannedWeight > 0 ? { weight: plannedWeight } : {})
    if (policy === 'double') {
      const range = normalizeRepRange(cfg.reps || last.goal || 10, cfg.repsMin, repStep(cfg))
      // A new weight starts at the bottom of the range, the way a raise does: the reps managed
      // were managed at another load.
      const aim = set
        ? range.repsMin
        : Math.min(range.reps, Math.max(range.repsMin, (last.low ?? 0) + repStep(cfg)))
      return { policy, kind: 'hold', ...held, reps: aim, why }
    }
    return { policy, kind: 'hold', ...held, reps: cfg.reps || undefined, why }
  }

  const stalls = stallCount(sessions, policy)
  const deloadAt = DELOAD_AFTER[policy] || 3

  if (mode === 'time') {
    if (last.ok) {
      const sec = (last.goal || targetSec(cfg) || 0) + inc
      return {
        policy,
        kind: 'up',
        sec,
        why: ['Held every set for the full time — target up by {0}s.', String(inc)],
      }
    }
    if (stalls >= deloadAt) {
      const sec = deloadTo(last.goal || targetSec(cfg) || 0, 5)
      return {
        policy,
        kind: 'deload',
        sec,
        why: ['Short {0} sessions in a row — back off to {1}s and build up again.', String(stalls), String(sec)],
      }
    }
    return {
      policy,
      kind: 'hold',
      sec: last.goal || targetSec(cfg),
      why: ['Last time came up short — same target again.'],
    }
  }

  const w = last.weight
  // Bodyweight work carries no external load, so there is nothing to add or take away —
  // "deload your push-ups to 2.5 kg" is not advice. Progress in reps instead. This runs ahead of
  // the individual policies because it is true for all of them.
  if (w <= 0 && climbsReps(cfg)) {
    const goal = last.goal || cfg.reps || 0
    const planSets = Math.max(1, cfg.sets || 1)
    const reached = last.planned
      ? Math.max(planSets, (last.target?.sets as number) || 0)
      : planSets
    const keep = reached > planSets ? { sets: reached } : {}
    if (!last.ok || goal <= 0)
      return {
        policy,
        kind: 'hold',
        weight: 0,
        reps: goal || undefined,
        ...keep,
        why: ['Bodyweight — same target again until every set is clean.'],
      }
    // A ceiling turns "+1 rep forever" into a plan. Past the top of the range the reps go back to
    // the bottom and a set is added instead, which is how bodyweight work actually progresses once
    // a set of 30 push-ups stops being a strength stimulus.
    const top = Number(cfg.repsMax) || 0
    if (top > 0 && goal >= top) {
      const sets = reached + 1
      const bottom = Math.max(1, Math.min(cfg.reps || top, top))
      if (sets <= MAX_BW_SETS)
        return {
          policy,
          kind: 'up',
          weight: 0,
          reps: bottom,
          sets,
          why: ['{0} reps in every set — add a set and go back to {1}.', String(goal), String(bottom)],
        }
      // Out of sets worth adding: more volume is no longer the answer, load or a harder variation
      // is — and that is a decision for a person, not a policy.
      return {
        policy,
        kind: 'hold',
        weight: 0,
        reps: goal,
        ...keep,
        why: [
          '{0} sets of {1} — time to add weight or move to a harder variation.',
          String(sets - 1),
          String(goal),
        ],
      }
    }
    const next = goal + repStep(cfg)
    return {
      policy,
      kind: 'up',
      weight: 0,
      reps: next,
      ...keep,
      why: ['Bodyweight — every rep last time, so go for {0} this time.', String(next)],
    }
  }

  // A loaded lift logged at 0 had its weight never typed in. Climbing its reps as though it were a
  // push-up turned a 2 × 10 bench into 2 × 11, 12… There is nothing to progress from.
  if (w <= 0)
    return {
      policy,
      kind: 'hold',
      ...(Number(cfg.weight) > 0 ? { weight: Number(cfg.weight) } : {}),
      why: ['No weight logged last time — enter what you lift and progression takes it from there.'],
    }

  /**
   * Epley deloads apply only to externally loaded rep work.
   *
   * The prescribed target is kept from the session that stalled (falling back field by field to the
   * current config), while the logged weight remains the hard upper bound for the candidate.
   */
  const epleyDeload = (): Prescription | null => {
    // Epley reads load as the work done; on an assistance machine it is the work taken away.
    if (assisted) return null
    if (mode !== 'reps' || (policy !== 'linear' && policy !== 'double')) return null
    const previous = (last.target ?? {}) as RoutineExercise
    const target: RoutineExercise = {
      ...cfg,
      ...previous,
      weight: previous.weight ?? cfg.weight,
      reps: previous.reps ?? cfg.reps,
      repsMin: previous.repsMin ?? cfg.repsMin,
      // The sets are always the plan's: a loaded lift never gets a set count from progression, so
      // an older one here can only be a plan since edited.
      sets: cfg.sets ?? previous.sets,
      bodyweight: previous.bodyweight ?? cfg.bodyweight,
      side: previous.side ?? cfg.side,
    } as RoutineExercise
    // Rest-pause rows have burst reps rather than an independent rep prescription.
    if (isBw(target)) return null
    const candidate = selectDeloadCandidate({
      currentWeight: w,
      targetWeight: target.weight as number,
      targetReps: target.reps as number,
      step: inc,
      factor: deloadFactorOf({ deloadFactor: cfg.deloadFactor }),
      reps: target.reps as number,
      repsMin: policy === 'double' ? (target.repsMin as number) : undefined,
      perSide: isPerSide(target),
    })
    if (!candidate) return null
    const held = candidate.weight >= w
    return {
      policy,
      kind: 'deload',
      weight: candidate.weight,
      reps: candidate.reps,
      sets: target.sets as number,
      target1RM: candidate.target1RM,
      deloadFactor: candidate.factor,
      why: held
        ? [
            'Stalled {0} sessions — hold {1} {2} and use {3} reps.',
            String(stalls),
            String(candidate.weight),
            unit,
            String(candidate.reps),
          ]
        : [
            'Stalled {0} sessions — Epley deload to {1} {2} for {3} reps.',
            String(stalls),
            String(candidate.weight),
            unit,
            String(candidate.reps),
          ],
    }
  }

  if (policy === 'double') {
    const range = normalizeRepRange(cfg.reps || last.goal || 10, cfg.repsMin, repStep(cfg))
    const top = range.reps
    const bottom = range.repsMin
    // `last.ok` only means "matched whatever was recorded as this session's target", and that
    // target can sit below the top of the range. Double progression must not add weight until every
    // set actually reaches the top of the range.
    if (last.ok && (last.low ?? 0) >= top)
      return {
        policy,
        kind: 'up',
        weight: harder(w, inc),
        reps: bottom,
        why: assisted
          ? [
              'Top of the rep range in every set — {0} {1} less help, back to {2} reps.',
              String(inc),
              unit,
              String(bottom),
            ]
          : [
              'Top of the rep range in every set — {0} {1} more, back to {2} reps.',
              String(inc),
              unit,
              String(bottom),
            ],
      }
    if (stalls >= deloadAt) {
      const selected = epleyDeload()
      if (selected) return selected
      const dw = easier(w)
      return {
        policy,
        kind: 'deload',
        weight: dw,
        reps: bottom,
        why: assisted
          ? [
              'Stalled {0} sessions — back to {1} {2} of help and build up again.',
              String(stalls),
              String(dw),
              unit,
            ]
          : ['Stalled {0} sessions — deload to {1} {2}.', String(stalls), String(dw), unit],
      }
    }
    const aim = Math.min(top, Math.max(bottom, (last.low ?? 0) + repStep(cfg)))
    return {
      policy,
      kind: 'hold',
      weight: w,
      reps: aim,
      why: ['Same weight — aim for {0} reps this time.', String(aim)],
    }
  }

  // linear + greyskull
  if (last.ok) {
    // Greyskull's final set is taken to failure: double the target reps there and you have earned
    // a double jump.
    const dbl = policy === 'greyskull' && last.goal > 0 && (last.amrap ?? 0) >= last.goal * 2
    const step = dbl ? inc * 2 : inc
    return {
      policy,
      kind: 'up',
      weight: harder(w, step),
      why: dbl
        ? [
            'Last set hit {0} reps — twice the target, so take a double jump of {1} {2}.',
            String(last.amrap ?? 0),
            String(step),
            unit,
          ]
        : assisted
          ? ['Every rep last time — {0} {1} less help.', String(step), unit]
          : ['Every rep last time — {0} {1} more.', String(step), unit],
    }
  }
  if (stalls >= deloadAt) {
    const selected = epleyDeload()
    if (selected) return selected
    const dw = easier(w)
    return {
      policy,
      kind: 'deload',
      weight: dw,
      why: assisted
        ? ['Missed reps — {0} {1} of help while you build back up.', String(dw), unit]
        : stalls > 1
          ? [
              'Missed reps {0} sessions running — reset to {1} {2} and work back up.',
              String(stalls),
              String(dw),
              unit,
            ]
          : ['Missed reps — reset to {0} {1} and work back up.', String(dw), unit],
    }
  }
  return {
    policy,
    kind: 'hold',
    weight: w,
    why: [
      'Missed reps last time — same weight again ({0} of {1} to go).',
      String(deloadAt - stalls),
      String(deloadAt),
    ],
  }
}

/**
 * Apply a prescription to freshly built sets.
 *
 * Only the fields the policy actually decided are touched, and only on sets that have not been
 * logged yet — a logged set is what happened, and rewriting it would be data loss.
 */
export function applyPrescription(sets: WorkoutSet[], p: Prescription | null, step = 2.5): WorkoutSet[] {
  if (!p || p.kind === 'off' || p.kind === 'first') return sets
  const out = sets.map(s => {
    // Never rewrite a logged set. The prescription speaks to the work rows; an open warm-up only
    // follows the reps or the hold it settled on.
    if (s.done) return s
    if (isWarmupRow(s)) {
      if (p.reps != null && s.r != null) return { ...s, r: p.reps }
      if (p.sec != null && s.sec != null) return { ...s, sec: p.sec }
      return s
    }
    if (isSideSet(s)) {
      const sides = Object.fromEntries(
        (['L', 'R'] as const).map(side => {
          const row = s.sides![side]!
          return [
            side,
            row.done
              ? row
              : {
                  ...row,
                  ...(p.weight != null ? { w: p.weight } : {}),
                  ...(p.reps != null ? { r: p.reps / 2 } : {}),
                },
          ]
        }),
      )
      return syncSideAggregate({ ...s, sides })
    }
    const o = { ...s }
    if (p.weight != null) o.w = p.weight
    if (p.reps != null) o.r = p.reps
    if (p.sec != null) o.sec = p.sec
    return o
  })

  // A policy that decided on a set count gets to grow the list — bodyweight progression adds a set
  // where a barbell would add a plate. Only ever upwards, and only by copying a row that is already
  // there: a session in progress must not lose a set it has logged.
  if (p.sets && p.sets > out.filter(s => !isWarmupRow(s)).length) {
    const workRows = out.filter(s => !isWarmupRow(s))
    // An all-warm-up entry has no work row to seed growth from. Leave it untouched.
    if (!workRows.length) return out
    const seed = workRows[workRows.length - 1]
    // A freshly appended row has not been performed, so it never inherits the seed's already-logged
    // drops or clusters — that would invent work the row never did.
    const { drops, clusters, ...plainSeed } = seed
    while (out.filter(s => !isWarmupRow(s)).length < (p.sets as number)) {
      // A unilateral seed grows into a fresh per-side row via makeSideSet, so the new row is
      // uncompleted and keeps both limbs. Spreading the seed instead would carry its `done`
      // across and drop the sides entirely.
      out.push(
        isSideSet(seed)
          ? makeSideSet({ w: p.weight ?? Number(seed.w), r: p.reps ?? Number(seed.r) })
          : { ...plainSeed, done: false },
      )
    }
  }
  // Last, because the work rows now carry their final weight: the warm-up block ramps toward
  // what you are actually about to lift, not toward what you lifted last time.
  return rerampWarmups(out, step)
}

/**
 * Recompute the warm-up block so it ramps toward the weight the work rows ACTUALLY carry.
 *
 * Warm-ups are built before a prescription is applied, and the prescription deliberately rewrites
 * work rows only — so without this the ramp still aims at last session's weight. On a deload that
 * put the last warm-up above every work set, which is the exact opposite of what a warm-up is for.
 *
 * Each open warm-up takes half the gap that is left, snapped DOWN to the load step, so every value
 * is one you can actually put on a bar. A warm-up already logged keeps its weight and becomes what
 * the next one ramps from: it happened, and rewriting performed work is data loss. Entries with
 * nothing to ramp toward — cardio, bodyweight, an unloaded hold — are returned untouched.
 */
function rerampWarmups(rows: WorkoutSet[], step = 2.5): WorkoutSet[] {
  const firstWork = rows.findIndex(x => !isWarmupRow(x))
  // Nothing to ramp from: no work row, or the block does not sit in front of one.
  if (firstWork <= 0) return rows
  const target = Number(rows[firstWork].w) || 0
  if (!(target > 0)) return rows

  const out = rows.slice()
  let from = 0
  for (let i = 0; i < firstWork; i++) {
    if (out[i].done) {
      from = Number(out[i].w) || 0
      continue
    }
    const w =
      target > from
        ? Math.max(0, Math.min(target, Math.floor((from + (target - from) / 2) / step) * step))
        : target
    out[i] = { ...out[i], w }
    from = w
  }
  return out
}

/** The 1RM this module would derive for a set, exposed so callers share one estimator. */
export const estimateFor = estimate1RM