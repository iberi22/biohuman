/**
 * Building the rows of a session from a config — ported from openGym's `history.js`.
 *
 * This is what the workout screen calls when it opens an exercise. The rows it produces are the
 * starting point of the lifter's session: the weight and reps each set opens with, and any planned
 * warm-ups in front of them.
 *
 * Two behaviours here are the whole reason this module exists rather than a three-line seed:
 *
 * - **The last session decides, but not by itself.** A row's weight comes from the last session
 *   this routine trained, falling back to the exercise's confirmed working weight, falling back to
 *   what the config says. The order is deliberate: taking the confirmed weight first handed a
 *   light day the heavy day's number.
 * - **A warm-up is never heavier than the set it warms up for**, and always lands a notch light
 *   rather than heavy — one that needs plates stripped before you can use it is a real cost.
 */
import type { WorkoutSet } from './workout-model'
import { isSideSet, makeSideSet, syncSideAggregate } from './workout-model'
import { isPerSide, lastEntryFor, modeOf } from './history'

/** Beyond this a "warm-up" is its own workout; the config stepper stops here too. */
export const MAX_PLANNED_WARMUPS = 5

/**
 * The number out of a row's weight or reps.
 *
 * `WorkoutSet` allows a string there because an imported log can hold one, so every comparison has
 * to go through this rather than trusting the field. Empty and zero are the same answer: a row with
 * no load has no load.
 */
const num = (v: number | string | undefined): number => Number(v) || 0

export interface SetConfig {
  id?: string
  sets?: number
  reps?: number
  weight?: number
  sec?: number
  min?: number
  speed?: number
  warmupSets?: number
  intensifier?: { type?: string; count?: number; pct?: number; clusters?: unknown[] }
  [k: string]: unknown
}

export interface BuildOptions {
  /** Reproduce what you actually did last time, ignoring the plan's own numbers. */
  preferLast?: boolean
  /** A deload: use the routine's own prescription rather than carrying history in. */
  useTarget?: boolean
  /** A planned session: the plan owns the reps, history only decides the weight. */
  planReps?: boolean
  /** The routine the rows are for — its own last session of the exercise comes first. */
  rid?: string
  /** Warm-up increment. */
  step?: number
}

/**
 * Seed one side of a unilateral set from how the same exercise was last logged per side.
 *
 * An asymmetry you trained is information: if you did 8 left and 6 right, the next session should
 * open on that, not on two equal halves. The plan can still own the reps, in which case the
 * weights carry over and the reps do not.
 */
function seedSideFromLast(row: WorkoutSet, prev: WorkoutSet, planReps: boolean): WorkoutSet {
  const base = makeSideSet(row)
  if (!isSideSet(prev)) return base
  const carry = (s: unknown, key: 'L' | 'R') => ({
    w: Number((s as { w?: number })?.w) || 0,
    r: planReps ? ((base.sides?.[key]?.r as number) || 0) : Number((s as { r?: number })?.r) || 0,
    done: false,
  })
  const sides = prev.sides as { L?: unknown; R?: unknown }
  return syncSideAggregate({
    ...base,
    sides: { L: carry(sides.L, 'L'), R: carry(sides.R, 'R') },
  })
}

/**
 * The work rows, before any planned warm-ups.
 *
 * Cardio and timed work get their own branches rather than being expressed through the reps path:
 * a cardio set carries minutes and speed, and seeding one from a rep count would write the wrong
 * thing entirely.
 */
function buildWorkSets(
  S: Parameters<typeof lastEntryFor>[0],
  cfg: SetConfig,
  options: BuildOptions = {},
): WorkoutSet[] {
  const preferLast = !!options.preferLast
  const useTarget = !!options.useTarget
  const last = lastEntryFor(S, cfg.id ?? '', options.rid)
  const n = Math.max(1, cfg.sets || 1)
  const mode = modeOf(cfg as never)
  const sets: WorkoutSet[] = []

  // A deload routine must use its own prescription instead of carrying regular-session values
  // into the workout. Other planned sessions read the weight from history.
  const prevAt = (i: number): WorkoutSet | null =>
    !useTarget && last ? ((last.sets[i] || last.sets[last.sets.length - 1]) as WorkoutSet) : null

  // A planned session opens at the routine's own reps, and history only decides the weight.
  // Without it every row copied last session's reps, so a plan edited from 15 to 10 — or trained
  // at 15 once — kept opening at 15 while the routine still read "2 × 10". Freestyle has no plan
  // to own anything and keeps reproducing what you did.
  const planReps = !!options.planReps && !preferLast && (cfg.reps ?? 0) > 0

  if (mode === 'cardio') {
    for (let i = 0; i < n; i++) {
      const prev = prevAt(i)
      sets.push({
        min: prev ? prev.min : (cfg.min || 20),
        speed: prev ? prev.speed : (cfg.speed || 8),
        done: false,
      } as unknown as WorkoutSet)
    }
    return sets
  }

  if (mode === 'time') {
    for (let i = 0; i < n; i++) {
      // Only carry a previous value over when it came from a timed set — switching an exercise
      // from reps to time must not seed the duration from a rep count.
      const prev = prevAt(i)
      const carried = prev && (prev.sec ?? 0) > 0 ? prev : null
      sets.push({
        sec: carried ? carried.sec : (cfg.sec || 45),
        w: carried ? (carried.w || 0) : (cfg.weight || 0),
        done: false,
      } as unknown as WorkoutSet)
    }
    return sets
  }

  const conf = ((S as { exWeights?: Record<string, { w?: number }> }).exWeights || {})[
    cfg.id as string
  ]
  for (let i = 0; i < n; i++) {
    const prev = prevAt(i)
    const usable = prev && num(prev.r) > 0 ? prev : null
    // The weight comes from the last session this routine trained (or any, for a routine that never
    // has). The confirmed working weight is keyed by exercise alone, so it is only the fallback
    // once there is no session to read.
    const lastRegular = last ? ((last.sets[i] || last.sets[last.sets.length - 1]) as WorkoutSet) : null
    const w = useTarget
      ? (cfg.weight ?? 0) > 0
        ? (cfg.weight ?? 0)
        : lastRegular && num(lastRegular.r) > 0
          ? lastRegular.w
          : (cfg.weight ?? 0)
      : usable
        ? usable.w
        : conf && (conf.w ?? 0) > 0
          ? conf.w
          : (cfg.weight ?? 0)
    const row = { w, r: planReps || !usable ? (cfg.reps ?? 0) : usable.r, done: false } as WorkoutSet
    // A unilateral exercise logs each side on its own: the row splits into L/R, each seeded with
    // half the total reps at the same weight.
    if (isPerSide(cfg as never))
      sets.push(usable && isSideSet(usable) ? seedSideFromLast(row, usable, planReps) : makeSideSet(row))
    else sets.push(row)
  }
  return sets
}

/**
 * Insert one planned warm-up row in front of the work rows, ramping toward the first of them.
 *
 * The ramp is the point: each warm-up sits halfway from the previous row's load, rounded DOWN to
 * the step. A warm-up that lands a notch light costs nothing; one that lands a notch heavy is a set
 * you have to strip plates off before you can use it.
 */
export function insertWarmupRow(
  rows: WorkoutSet[],
  mode: string,
  target: SetConfig,
  step = 2.5,
): WorkoutSet[] {
  const isWarmupRow = (x: WorkoutSet) => x.phase === 'warmup' || x.warmup === true
  const firstWork = rows.findIndex((x) => !isWarmupRow(x))
  const at = firstWork === -1 ? rows.length : firstWork
  const prev = at > 0 ? rows[at - 1] : null // the warm-up this one ramps from
  const work = firstWork === -1 ? null : rows[firstWork]

  const rampTo = (to: number): number => {
    const from = prev ? num(prev.w) : 0
    // Nothing to ramp toward: bodyweight, cardio, a timed hold with no load.
    if (!(to > 0)) return 0
    // Already at or past the work weight — which happens when a warm-up was edited by hand above
    // it. Returning `from` here handed the next warm-up that same too-heavy number and let it
    // propagate down the block. A warm-up is never heavier than the set it warms up for.
    if (to <= from) return to
    return Math.max(0, Math.min(to, Math.floor((from + (to - from) / 2) / step) * step))
  }

  const warm: WorkoutSet =
    mode === 'cardio'
      ? ({ min: Math.max(1, Math.round((target.min || 20) / 2)), speed: 0, done: false, warmup: true } as unknown as WorkoutSet)
      : mode === 'time'
        ? ({ sec: Math.max(5, Math.round((target.sec || 45) / 2)), w: 0, done: false, warmup: true } as unknown as WorkoutSet)
        : ({
            w: rampTo(work ? num(work.w) : (target.weight || 0)),
            r: Math.max(1, Math.round((target.reps || 8) / 2)),
            done: false,
            warmup: true,
          } as WorkoutSet)

  const next = rows.slice()
  next.splice(at, 0, warm)
  return next
}

/** The rows a session opens with: work sets, plus any planned warm-ups in front of them. */
export function buildSets(
  S: Parameters<typeof lastEntryFor>[0],
  cfg: SetConfig,
  options: BuildOptions = {},
): WorkoutSet[] {
  const rows = buildWorkSets(S, cfg, options)
  const warm = Math.max(0, Math.min(MAX_PLANNED_WARMUPS, Math.round(num(cfg.warmupSets))))
  if (!warm) return rows
  const mode = modeOf(cfg as never)
  let out = rows
  for (let i = 0; i < warm; i++) out = insertWarmupRow(out, mode, cfg, options.step ?? 2.5)
  return out
}

/**
 * Remove a row, but never the last one.
 *
 * An exercise with no rows is not an exercise. The last row stays whatever else happens.
 */
export function removeRowAt(rows: WorkoutSet[], i: number): WorkoutSet[] {
  if (rows.length <= 1) return rows.slice()
  const next = rows.slice()
  next.splice(i, 1)
  return next
}

/** A numeric timestamp from a number, or from the numeric string an import may have stored. */
export function timestampOf(value: unknown): number | null {
  if (typeof value === 'number') return Number.isFinite(value) ? value : null
  if (typeof value === 'string' && value.trim()) {
    const n = Number(value)
    return Number.isFinite(n) ? n : null
  }
  return null
}

/** `m:ss`, with the seconds always two digits. */
export function fmtSec(sec: unknown): string {
  const n = Math.max(0, Math.round(Number(sec) || 0))
  return `${Math.floor(n / 60)}:${String(n % 60).padStart(2, '0')}`
}

/**
 * How long the workout took, in milliseconds.
 *
 * Returns 0 rather than a guess when either end is missing or unreadable — a duration invented from
 * a half-present pair of timestamps would be a real number that is not true.
 */
export function workoutDuration(w: { start?: unknown; end?: unknown }): number {
  const start = timestampOf(w?.start)
  const end = timestampOf(w?.end)
  return start !== null && end !== null ? Math.max(0, end - start) : 0
}