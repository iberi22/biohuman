/**
 * Estimated one-rep max.
 *
 * Adapted from openGym (https://github.com/DuarteSantos8/openGym, AGPL-3.0-or-later,
 * Copyright (C) 2026 Duarte Santos). See NOTICE.md.
 *
 * Deliberately knows nothing about the exercise database: an estimate needs a weight AND a rep
 * count, and only reps-mode sets carry both. Cardio sets ({min, speed}) and timed sets ({sec, w})
 * therefore drop out of every scan here on their own — there is no exercise-type check to keep in
 * sync.
 *
 * The one catalogue fact this does need is whether an exercise is *assisted* (a band, a dip belt,
 * a leverage machine). On those the load is the help you were given, so a formula applied to it
 * would rise as you got weaker and call that a record. openGym answers that by looking the id up in
 * its 1,324-entry catalogue; here the caller passes the flag instead, which keeps this module free
 * of the catalogue and therefore verifiable on its own. `isAssisted()` in `assisted.ts` is the
 * catalogue-side resolver to feed it.
 */
import {
  hasCompletedWork,
  isSideSet,
  isWarmupRow,
  modeForEntry,
  modeForSet,
  normalizeMode,
  type SetTarget,
  type WorkoutEntry,
  type WorkoutSet,
} from './workout-model'

/**
 * Above this many reps an estimate says more about work capacity than about maximal strength,
 * and the formulas disagree by double digits. Refusing to guess beats printing a fantasy.
 */
export const REP_CAP = 12

/** The usual submaximal-load estimators. */
export type Formula = keyof typeof FORMULAS

export const FORMULAS = {
  // Epley 1985 — w · (1 + r/30)
  epley: (w: number, r: number) => w * (1 + r / 30),
  // Brzycki 1993 — w · 36/(37 − r); undefined at r ≥ 37, but REP_CAP is far below that
  brzycki: (w: number, r: number) => (w * 36) / (37 - r),
  // Lombardi 1989 — w · r^0.10
  lombardi: (w: number, r: number) => w * Math.pow(r, 0.1),
} as const

/** Epley is the default because it is the one most lifters have seen. */
export const DEFAULT_FORMULA: Formula = 'epley'

/** One estimate, with the set it came from. */
export interface Estimate {
  /** The estimated 1RM. */
  est: number
  /** Load of the set it came from. */
  w: number
  /** Reps of the set it came from. */
  r: number
}

/** An estimate plus where and when it happened. */
export interface EstimatePoint {
  /** The estimated 1RM. Named `y` because this is a chart point, not a best-of. */
  y: number
  /** Load of the set it came from. */
  w: number
  /** Reps of the set it came from. */
  r: number
  /** Workout start timestamp. */
  t?: number
  /** Workout date. */
  d?: string
}

/** The all-time best, reported as a best-of rather than a chart point. */
export interface BestEstimate {
  /** The estimated 1RM. */
  est: number
  /** Load of the set it came from. */
  w: number
  /** Reps of the set it came from. */
  r: number
  /** Workout date. */
  d?: string
  /** Workout start timestamp. */
  t?: number
}

/**
 * Estimate a 1RM from one set. Returns null for anything it cannot honestly answer:
 * missing/zero/negative load, no reps, non-finite input, or more reps than REP_CAP.
 * A single rep is not an estimate — it is the measurement — and comes back unchanged.
 */
export function estimate1RM(w: unknown, r: unknown, formula: string = DEFAULT_FORMULA): number | null {
  const weight = Number(w)
  const reps = Number(r)
  if (!isFinite(weight) || !isFinite(reps)) return null
  if (weight <= 0 || reps < 1) return null
  if (reps > REP_CAP) return null
  const fn = FORMULAS[formula as Formula] || FORMULAS[DEFAULT_FORMULA]
  const est = reps === 1 ? weight : fn(weight, Math.round(reps))
  if (!isFinite(est) || est <= 0) return null
  return Math.round(est * 10) / 10
}

/**
 * Best estimate out of one workout entry's completed sets.
 *
 * `topW` is ignored on purpose: it records the working weight a user confirmed after the
 * exercise, with no rep count attached, so it cannot produce an estimate.
 *
 * `assisted` is the catalogue fact described at the top of this file. When true, the entry stays
 * out of the estimate entirely — there is no max to estimate on a machine that helped you.
 */
export function bestSetOf(
  entry: WorkoutEntry | null | undefined,
  formula: string = DEFAULT_FORMULA,
  assisted = false,
): Estimate | null {
  if (assisted) return null
  let best: Estimate | null = null
  metricRowsForEntry(entry).forEach((s: WorkoutSet) => {
    const sets = isSideSet(s)
      ? [s.sides?.L, s.sides?.R].filter((side): side is NonNullable<typeof side> => side?.done === true)
      : [s]
    sets.forEach(set => {
      const est = estimate1RM(set?.w, set?.r, formula)
      if (est !== null && (!best || est > best.est)) {
        best = { est, w: Number(set?.w), r: Math.round(Number(set?.r)) }
      }
    })
  })
  return best
}

function bestSetOfEntries(
  entries: WorkoutEntry[],
  formula: string = DEFAULT_FORMULA,
  assisted = false,
): Estimate | null {
  let best: Estimate | null = null
  for (const entry of entries || []) {
    const candidate = bestSetOf(entry, formula, assisted)
    if (candidate && (!best || candidate.est > best.est)) best = candidate
  }
  return best
}

/** The state slice these read: a list of completed workouts, each with entries. */
export interface WorkoutLog {
  workouts?: {
    d?: string
    start?: number
    entries?: WorkoutEntry[]
  }[]
}

/**
 * One point per workout in which the exercise produced an estimate — feeds the trend chart.
 * Chronological, matching the order workouts are appended in.
 */
export function e1rmSeries(
  S: WorkoutLog,
  exId: string,
  formula: string = DEFAULT_FORMULA,
  assisted = false,
): EstimatePoint[] {
  if (assisted) return []
  const pts: EstimatePoint[] = []
  ;(S?.workouts || []).forEach(w => {
    const best = bestSetOfEntries(entriesForExercise(w, exId), formula, assisted)
    if (best) pts.push({ t: w.start, d: w.d, y: best.est, w: best.w, r: best.r })
  })
  return pts
}

/**
 * All-time best estimate for an exercise, with the set and date it came from — the source
 * matters, because "142.5 kg est. from 100×10" is a very different claim from "from 140×1".
 */
export function best1RM(
  S: WorkoutLog,
  exId: string,
  formula: string = DEFAULT_FORMULA,
  assisted = false,
): BestEstimate | null {
  let best: BestEstimate | null = null
  e1rmSeries(S, exId, formula, assisted).forEach(p => {
    if (!best || p.y > best.est) best = { est: p.y, w: p.w, r: p.r, d: p.d, t: p.t }
  })
  return best
}

/**
 * Did this workout beat every estimate that came before it? Used for the finish summary,
 * so it compares against history that does not yet contain `entry`.
 */
export function is1RMRecord(
  S: WorkoutLog,
  exId: string,
  entry: WorkoutEntry,
  formula: string = DEFAULT_FORMULA,
  assisted = false,
): (Estimate & { prev: number }) | null {
  const now = bestSetOf(entry, formula, assisted)
  if (!now) return null
  const prev = best1RM(S, exId, formula, assisted)
  return !prev || now.est > prev.est ? { ...now, prev: prev ? prev.est : 0 } : null
}

/** Entries matching an exercise id, in log order. */
function entriesForExercise(
  workout: { entries?: WorkoutEntry[] },
  exId: string,
): WorkoutEntry[] {
  return (workout?.entries || []).filter(e => e?.id === exId)
}

const METRIC_MODES = ['reps', 'time', 'cardio'] as const

/**
 * A 1RM is only ever estimated from reps work, so every caller pins this rather than letting the
 * entry's own mode decide. An entry is measured as one thing: a 60-second hold that happens to
 * carry a stray `w`/`r` must not be scanned as reps, or it reports a 233 kg "1RM".
 */
const DEFAULT_METRIC_MODE = 'reps'

/** Completed, non-warm-up rows of one mode. */
function completedRowsForMode(entry: WorkoutEntry | null | undefined, mode: string): WorkoutSet[] {
  const sets = Array.isArray(entry?.sets) ? entry.sets : []
  const target = (entry?.target || entry || {}) as SetTarget
  const expected = normalizeMode(mode, 'reps')
  return sets
    .filter(s => modeForSet(s, target) === expected)
    .filter(s => hasCompletedWork(s) && !isWarmupRow(s))
}

/**
 * The authoritative metric for an entry; reps rows take precedence over timed/cardio rows.
 *
 * An entry is measured as ONE thing. Resolving the mode first and then scanning only those rows
 * is what keeps a timed set that happens to carry a stray `w`/`r` from being read as reps — without
 * it, a 60-second hold logged with a load would produce a 233 kg "1RM".
 */
function metricModeForEntry(entry: WorkoutEntry | null | undefined): string | null {
  for (const mode of METRIC_MODES) {
    if (completedRowsForMode(entry, mode).length) return mode
  }
  return modeForEntry(entry)
}

/**
 * The rows of an entry that carry a load and a rep count.
 *
 * Warm-up rows drop out: a ramp-up set is not the work, and letting it set a record would credit
 * a number the lifter never took as a working set.
 */
function metricRowsForEntry(
  entry: WorkoutEntry | null | undefined,
  mode: string = DEFAULT_METRIC_MODE,
): WorkoutSet[] {
  const requested = typeof mode === 'string' ? mode.trim().toLowerCase() : ''
  const resolved = (METRIC_MODES as readonly string[]).includes(requested)
    ? requested
    : metricModeForEntry(entry)
  return resolved ? completedRowsForMode(entry, resolved) : []
}