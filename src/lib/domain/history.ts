/**
 * Reading a training log honestly.
 *
 * Adapted from openGym's `history.js` (https://github.com/DuarteSantos8/openGym, AGPL-3.0-or-later,
 * Copyright (C) 2026 Duarte Santos). See NOTICE.md.
 *
 * This is the group of functions the progression engine depends on, and the whole point of it is
 * that a session reads back the way it actually happened rather than the way it was hoped:
 *
 *   · a set checked off with at least its target reps → hit
 *   · a set checked off with fewer reps               → miss (you logged what you got)
 *   · a set never checked off                          → miss (it was not performed)
 *   · fewer sets than prescribed                       → miss
 *
 * So a session that fell apart can never advance the load as though it had succeeded. Every rule
 * here serves that, and each one costs a wrong prescription if it is dropped.
 */
import { betterWeight, isAssisted, isBodyweightEq } from './catalogue'
import { isoOf } from './dates'
import {
  hasCompletedWork,
  isSideSet,
  isWarmupRow,
  modeForEntry,
  modeForSet,
  normalizeMode,
  phaseForSet,
  type Mode,
  type WorkoutEntry,
  type WorkoutSet,
} from './workout-model'

/** One planned exercise inside a routine. */
export interface RoutineExercise {
  /** Exercise slug. */
  id: string
  sets?: number
  reps?: number
  repsMin?: number
  weightKg?: number
  inc?: number
  /** No load column: progress in reps, or add a set past the ceiling. */
  bodyweight?: boolean
  /** One side at a time. */
  side?: boolean
  mode?: string
  unit?: string
  restSec?: number
  /** Warm-up rows planned ahead of the work sets. */
  warmupSets?: number
  /** Progression policy override for this exercise. */
  prog?: string
  [key: string]: unknown
}

/** A routine: a named list of planned exercises. */
export interface Routine {
  id: string
  name: string
  ex: RoutineExercise[]
  /** Excluded from automatic progression; its sessions never seed the next target. */
  excludeFromProgression?: boolean
  [key: string]: unknown
}

/** A completed workout, as stored. */
export interface Workout {
  /** ISO date. */
  d?: string
  start?: number
  routineIds?: string[]
  routineId?: string | null
  entries?: WorkoutEntry[]
  /** Whole-workout exclusion flag; every entry of it then reads as excluded. */
  excludeFromProgression?: boolean
  [key: string]: unknown
}

/** An entry carries the routine slot its numbers belong to, when the session was planned. */
export interface SlottedEntry extends WorkoutEntry {
  /** The routine slot this entry's numbers belong to. */
  rid?: string
  /** Frozen at build time, so editing a routine later never rewrites a saved session. */
  noProg?: boolean
  /**
   * The plan this entry was built from — the routine's sets and reps at the time.
   *
   * It is the only way the next session can tell a plan that was edited from one that progressed,
   * so it holds the record itself rather than a flag pointing at it.
   */
  planned?: Record<string, unknown>
  note?: string
  notePin?: boolean
}

/** The state slice these read. */
export interface HistoryState {
  workouts?: Workout[]
  routines?: Routine[]
  week?: Record<number, string[] | string>
  dayPlan?: Record<string, string>
  [key: string]: unknown
}

const MODES: readonly Mode[] = ['reps', 'time', 'cardio']

// --- config helpers ---------------------------------------------------------------------------

/** The logging mode a planned exercise uses, falling back to its body part for old records. */
export function modeOf(cfg: RoutineExercise | null | undefined): Mode {
  if (!cfg) return 'reps'
  const explicit = modeForSet(cfg, cfg)
  if (explicit && cfg.mode) return explicit
  return cfg.mode ? normalizeMode(cfg.mode) : modeForSet(cfg, cfg)
}

export const isTimed = (cfg: RoutineExercise | null | undefined): boolean => modeOf(cfg) === 'time'

/**
 * Whether this exercise carries no load column.
 *
 * The flag on the config wins when it is present: a dip done with a belt can turn it off, and a
 * custom exercise can turn it on. Only an absent flag falls through to the equipment.
 */
export function isBw(cfg: RoutineExercise | null | undefined): boolean {
  if (!cfg) return false
  if (cfg.bodyweight != null) return !!cfg.bodyweight
  return isBodyweightEq(cfg.id)
}

export const isPerSide = (cfg: RoutineExercise | null | undefined): boolean => !!cfg?.side

/** Reps per side — a unilateral target is always even, so the split is whole. */
export const sideReps = (reps: number | undefined): number => (reps || 0) / 2

/**
 * The step the target moves by: two on a per-side exercise, so each side steps rather than the
 * pair, and the numbers stay whole on both sides.
 */
export const repStep = (cfg: RoutineExercise | null | undefined): number =>
  isPerSide(cfg) ? 2 : 1

// --- what counts, and what does not ---------------------------------------------------------------

/**
 * Does this entry's session count towards the next prescription?
 *
 * `noProg` is frozen onto the entry when the session is built, so editing a routine's flag later
 * never rewrites a session that was already saved.
 */
export function entryExcluded(w: Workout | null | undefined, entry: SlottedEntry): boolean {
  return w?.excludeFromProgression === true || entry?.noProg === true
}

/**
 * Which routine a saved entry was planned by — the slot its numbers belong to.
 *
 * Every entry of a session started on a combined day carries its own `rid`. A session saved before
 * that has none, and there the workout's routine stands in for all of its entries. The exception is
 * a newer session in which some entries carry a `rid` and this one does not: that is an exercise
 * added to a freestyle session, and it belongs to no routine at all.
 */
export function entryRoutineId(
  w: Workout | null | undefined,
  en: SlottedEntry | null | undefined,
): string | null {
  if (en?.rid) return en.rid
  if ((w?.entries ?? []).some(e => e && (e as SlottedEntry).rid)) return null
  const first = (w?.routineIds ?? [])[0]
  return first ?? w?.routineId ?? null
}

/** The entry for one exercise in one saved workout. */
const entryIn = (w: Workout, exId: string, rid: string | null): SlottedEntry | undefined =>
  (w.entries ?? []).find(e => e && e.id === exId && (!rid || entryRoutineId(w, e) === rid))

/** The last counting session of an exercise, or null. */
export interface LastEntry {
  /** ISO date of the session. */
  d?: string
  /** Completed work sets, warm-ups excluded. */
  sets: WorkoutSet[]
  /** What the session prescribed, so the log reads back the way it was written. */
  target: RoutineExercise | null
  /** The routine slot, when the entry belonged to one. */
  rid?: string
  /** The exercise was prescribed rather than added freestyle. */
  planned?: boolean
}

function lastEntryIn(S: HistoryState, exId: string, rid: string | null): LastEntry | null {
  const workouts = S.workouts ?? []
  for (let i = workouts.length - 1; i >= 0; i--) {
    const w = workouts[i]
    const en = entryIn(w, exId, rid)
    if (!en) continue
    // A session that does not count — a planned deload, or a rehab block merged into a real
    // session — is not "last time" for the next regular prescription: its reps must not seed the
    // rows any more than its weight seeds the progression.
    if (entryExcluded(w, en)) continue
    // Work sets only. Every caller asks the same question — "what did you actually lift last
    // time". A warm-up answers none of them: seeding position 0 from a 50% ramp row walks the
    // working weight DOWN a little every session.
    const done = (en.sets ?? []).filter(s => s.done && !isWarmupRow(s))
    if (!done.length) continue
    const slot = entryRoutineId(w, en)
    return {
      d: w.d,
      sets: done,
      target: (en.target as RoutineExercise) ?? null,
      ...(slot ? { rid: slot } : {}),
      ...(en.planned ? { planned: true } : {}),
    }
  }
  return null
}

/**
 * The last counting session of an exercise.
 *
 * Given a routine id, that routine's own last session of it: the same bench press in a heavy day
 * and a light day is two lines of progress, not one that zigzags between them. A routine that has
 * never trained the exercise falls back to its last session anywhere, so a new or copied routine
 * starts from what you actually lift rather than from nothing.
 */
export function lastEntryFor(
  S: HistoryState,
  exId: string,
  rid?: string | null,
): LastEntry | null {
  if (rid) {
    const own = lastEntryIn(S, exId, rid)
    if (own) return own
  }
  return lastEntryIn(S, exId, null)
}

/** Total reps from one completed row, counting only the completed limbs of a per-side row. */
export function completedRepsOf(set: WorkoutSet = {}): number {
  if (isSideSet(set)) {
    const s = set.sides ?? {}
    return [s.L, s.R]
      .filter(side => side?.done === true)
      .reduce((total, side) => total + Math.max(0, Number(side?.r) || 0), 0)
  }
  return set.done === true ? Math.max(0, Number(set.r) || 0) : 0
}

/**
 * Completed, non-warm-up rows of one mode.
 *
 * The mode is resolved per row against the entry's target, which is what keeps a timed set that
 * happens to carry a stray `w`/`r` from being read as reps.
 */
export function completedRowsForMode(
  entry: WorkoutEntry | null | undefined,
  mode: string,
): WorkoutSet[] {
  const sets = Array.isArray(entry?.sets) ? entry.sets : []
  const target = (entry?.target ?? {}) as RoutineExercise
  const expected = normalizeMode(mode, 'reps')
  return sets
    .filter(s => modeForSet(s, target) === expected)
    .filter(s => hasCompletedWork(s) && !isWarmupRow(s))
}

/**
 * The rows of an entry that carry a load and a rep count, for a requested metric.
 *
 * A 1RM is only ever estimated from reps work, so callers pin the mode rather than letting the
 * entry decide.
 */
export function metricRowsForEntry(
  entry: WorkoutEntry | null | undefined,
  mode: string = 'reps',
): WorkoutSet[] {
  const requested = typeof mode === 'string' ? mode.trim().toLowerCase() : ''
  const resolved = (MODES as readonly string[]).includes(requested)
    ? requested
    : metricModeForEntry(entry)
  return resolved ? completedRowsForMode(entry, resolved) : []
}

/**
 * The authoritative metric for an entry; reps rows take precedence over timed/cardio rows.
 *
 * An entry is measured as one thing. Resolving the mode before scanning is what keeps a 60-second
 * hold that carries a stray `w`/`r` from reporting a four-times-load "1RM".
 */
export function metricModeForEntry(
  entry: WorkoutEntry | null | undefined,
  fallback: Mode | null = null,
): Mode | null {
  for (const mode of MODES) {
    if (completedRowsForMode(entry, mode).length) return mode
  }
  return modeForEntry(entry, fallback)
}

/** Every saved occurrence of an exercise in one workout, in its stored order. */
export function entriesForExercise(
  workout: Workout | null | undefined,
  exId: string,
): SlottedEntry[] {
  if (exId == null || exId === '') return []
  return ((workout?.entries ?? []) as SlottedEntry[]).filter(e => e?.id === exId)
}

/** One exercise's occurrence within a workout, with its metric mode and rows. */
export interface MetricEntry {
  entry: SlottedEntry
  mode: Mode | null
  rows: WorkoutSet[]
}

/**
 * Metric data for every occurrence in one workout, including legacy reps records that carry only
 * a `topWeightKg` and no usable rows.
 */
export function metricEntriesForExercise(
  workout: Workout | null | undefined,
  exId: string,
): MetricEntry[] {
  return entriesForExercise(workout, exId)
    .map(entry => {
      const mode = metricModeForEntry(entry)
      return { entry, mode, rows: mode ? metricRowsForEntry(entry, mode) : [] }
    })
    .filter(item => item.rows.length || (item.mode === 'reps' && bestWeightForEntry(item.entry) > 0))
}

/**
 * Best load from completed work rows, with a guarded reps-only legacy fallback.
 *
 * On an assistance machine the smallest load is the best set, so "best" folds the other way, and
 * the caller does not branch. A 0 on an assistance machine is a row with no load entered, not a
 * set done with no help at all — folding it in as "the least assistance ever" would invent a record
 * nobody did and then ask for negative help next time.
 */
export function bestWeightForEntry(entry: WorkoutEntry = {}): number {
  const target = ((entry as { target?: RoutineExercise }).target ?? entry) as RoutineExercise
  const sets = Array.isArray(entry.sets) ? entry.sets : []
  const workRows = sets.filter(s => phaseForSet(s) === 'work')
  const repsRows = metricRowsForEntry(entry, 'reps')
  // Reps rows are the authoritative load metric for a mixed entry. Otherwise use every completed
  // work row: a timed hold can carry an added load too.
  const completedRows = repsRows.length
    ? repsRows
    : workRows.filter(s => hasCompletedWork(s) && !isWarmupRow(s))

  const assisted = isAssisted(entry.id ?? (entry as { slug?: string }).slug ?? '')
  let best = 0
  let hasUsableWeight = false

  for (const set of completedRows) {
    const parts = isSideSet(set)
      ? [set.sides?.L, set.sides?.R].filter(side => side?.done === true)
      : [set]
    for (const part of parts) {
      const weight = Number(part?.w)
      if (!Number.isFinite(weight)) continue
      if (assisted && !(weight > 0)) continue
      best = hasUsableWeight ? betterWeight(entry.id ?? '', best, weight) : weight
      hasUsableWeight = true
    }
  }

  // A real completed row, including an explicit zero for an unloaded bodyweight set, always wins.
  // A manual topW is only useful for old records whose rows did not carry a usable load.
  if (hasUsableWeight) return best

  // topW predates phase-tagged warm-ups. It remains a fallback for legacy all-work records, but
  // cannot override resolved work rows once any warm-up marker exists.
  const parentMode = modeForSet({}, target)
  const hasNonRepsWorkRow = workRows.some(s => modeForSet(s, target) !== 'reps')
  const hasWarmupRow = Array.isArray(entry.sets) && entry.sets.some(isWarmupRow)
  const topWeight = Number((entry as { topW?: number }).topW)
  if (
    parentMode === 'reps' &&
    !hasNonRepsWorkRow &&
    !hasWarmupRow &&
    Number.isFinite(topWeight) &&
    (best <= 0 || (assisted ? topWeight > 0 && topWeight < best : topWeight > best))
  )
    best = topWeight
  return best
}

/**
 * The best load ever logged for an exercise.
 *
 * 0 means "nothing logged with a load yet" and must not win a min() on an assistance machine.
 */
export function bestWeightFor(S: HistoryState, exId: string): number {
  let best = 0
  for (const w of S.workouts ?? [])
    for (const e of (w.entries ?? []) as SlottedEntry[]) {
      if (e.id !== exId) continue
      const entryBest = bestWeightForEntry(e)
      if (entryBest > 0) best = best > 0 ? betterWeight(exId, best, entryBest) : entryBest
    }
  return best
}

/** How many units a set counts as: a per-side set is two. */
export const setUnits = (s: WorkoutSet): number => (isSideSet(s) ? 2 : 1)

/** How many of those units are actually done. */
export const doneUnits = (s: WorkoutSet): number =>
  isSideSet(s)
    ? (s.sides?.L?.done === true ? 1 : 0) + (s.sides?.R?.done === true ? 1 : 0)
    : s.done === true
      ? 1
      : 0

export const setUnitsTotal = (entries: WorkoutEntry[] | null | undefined): number =>
  (entries ?? []).reduce(
    (n, e) => n + (e.sets ?? []).reduce((m, s) => m + setUnits(s), 0),
    0,
  )

/**
 * Completed WORK sets in one entry, warm-ups excluded.
 *
 * Named apart from `setsDone` on purpose: upstream's `setsDone` is the gross completion counter
 * across a whole workout, warm-ups included, and it is kept that way below. The two answer
 * different questions and collapsing them into one name lost per-side counting.
 */
export const workSetsDoneInEntry = (entry: WorkoutEntry | null | undefined): number =>
  (entry?.sets ?? []).filter(s => hasCompletedWork(s) && !isWarmupRow(s)).length

/**
 * Total completion-units across a whole session's rows: every done set, warm-ups included, with
 * both limbs of a unilateral set counted separately.
 *
 * This is the gross counter, distinct from `workSetsDone` below which excludes warm-ups. A set
 * ticked on both sides counts twice, because it was two pieces of work.
 */
export function setsDone(w: Workout | null | undefined): number {
  let n = 0
  for (const e of w?.entries ?? []) for (const s of e.sets ?? []) n += doneUnits(s)
  return n
}

/** Completed work sets across a whole workout. */
export function workSetsDone(w: Workout | null | undefined): number {
  return (w?.entries ?? []).reduce(
    (n, e) => n + (e.sets ?? []).reduce((m, s) => m + (isWarmupRow(s) ? 0 : doneUnits(s)), 0),
    0,
  )
}
// --- the weekly plan ------------------------------------------------------------------------------
//
// A day can hold several routines, so a routine id on its own is ambiguous in two places, and both
// are handled by tolerance rather than by a schema: `week[weekday]` may be one id or a list, and a
// routine id that no longer exists resolves to nothing rather than throwing. The rest of the code
// only ever asks "is this a rest day?", and `effectiveRoutineIds(...).length === 0` answers it
// without caring which of the three shapes it came from.

/**
 * The routines scheduled for a date, after the per-date override and the weekly plan.
 *
 * `dayPlan[iso]` stays scalar — the per-date override is single-pick. All array tolerance is on
 * `week`, where a combined day genuinely holds several.
 */
export function effectiveRoutineIds(S: HistoryState, iso: string): string[] {
  const routines = S.routines ?? []
  const override = S.dayPlan?.[iso]
  if (override === 'rest') return []
  if (override && routines.some(r => r.id === override)) return [override]

  // Noon local, so a DST change cannot move the date this lands on.
  const weekday = new Date(iso + 'T12:00:00').getDay()
  const planned = S.week?.[weekday]
  const ids = ([] as string[]).concat(planned ?? [])
  return ids.filter(id => routines.some(r => r.id === id))
}

/** The same day, as routine objects. */
export function effectiveRoutines(S: HistoryState, iso: string): Routine[] {
  const routines = S.routines ?? []
  return effectiveRoutineIds(S, iso)
    .map(id => routines.find(r => r.id === id))
    .filter(Boolean) as Routine[]
}

export const effectiveRoutineId = (S: HistoryState, iso: string): string | null =>
  effectiveRoutineIds(S, iso)[0] ?? null

export const effectiveRoutine = (S: HistoryState, iso: string): Routine | null =>
  effectiveRoutines(S, iso)[0] ?? null

/** What the next training day looks like, once one is found. */
export interface NextTrainingDay {
  iso: string
  weekday: number
  routines: Routine[]
  /** The whole day, with `routine` = routines[0] for the "what's next" label. */
  routine: Routine
}

/**
 * The next day that actually has something to train, looking forward from `iso` (exclusive).
 *
 * Takes a date rather than reading the clock, so callers and tests agree on "today". A routine with
 * no exercises does not count: starting one lands you in an empty session, so it is not an answer
 * to "what is next". On a combined day any one routine with exercises makes the day trainable.
 * Returns null when the whole week is rest.
 */
export function nextTrainingDay(S: HistoryState, iso: string): NextTrainingDay | null {
  for (let i = 1; i <= 7; i++) {
    const d = new Date(iso + 'T12:00:00')
    d.setDate(d.getDate() + i)
    const nextIso = isoOf(d)
    const routines = effectiveRoutines(S, nextIso)
    if (routines.some(r => (r.ex ?? []).length)) {
      return { iso: nextIso, weekday: d.getDay(), routines, routine: routines[0] }
    }
  }
  return null
}
