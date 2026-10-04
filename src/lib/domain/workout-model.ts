/**
 * Focused workout semantics shared by session, history and strength views.
 *
 * Adapted from openGym (https://github.com/DuarteSantos8/openGym, AGPL-3.0-or-later,
 * Copyright (C) 2026 Duarte Santos). See NOTICE.md.
 *
 * Legacy records carry no explicit phase or mode, so every resolver here falls back to the
 * `work`/`reps` shape main's history used. That fallback is the load-bearing part of this
 * module: a row written before a field existed must still read correctly.
 */

export const MODES = ['reps', 'time', 'cardio'] as const
export type Mode = (typeof MODES)[number]

export const PHASES = ['warmup', 'work'] as const
export type Phase = (typeof PHASES)[number]

export const SET_TYPES = ['straight', 'dropset', 'restpause'] as const
export type SetType = (typeof SET_TYPES)[number]

/** A drop in a drop-set: weight × reps logged with no rest after the main set. */
export interface Drop {
  w: number
  r: number
}

/** A short-rest burst in a rest-pause set. */
export interface Cluster {
  r: number
  restSec: number
}

/** One logged limb of a unilateral set. */
export interface Side {
  w: number
  r: number
  done: boolean
  rir?: number | null
  rpe?: number | null
  weightOrigin?: typeof WEIGHT_ORIGIN_MANUAL
  type?: SetType
  drops?: Drop[]
  clusters?: Cluster[]
}

/**
 * One row of a logged exercise.
 *
 * Every field past `w`/`r`/`done` is optional on purpose: the intensifier (`drops`/`clusters`)
 * and the phase ride on the row itself rather than becoming separate entries, so the rest of
 * the app keeps reading a row's own `w`/`r` and stays correct without knowing those fields
 * exist. A unilateral row keeps a scalar mirror of its two sides for the same reason — but
 * those scalars cannot reconstruct an asymmetric load, so volume and edits must read `sides`.
 */
export interface WorkoutSet {
  w?: number | string
  r?: number | string
  done?: boolean
  /** Legacy boolean, superseded by `phase` but still honoured when `phase` is absent. */
  warmup?: boolean
  phase?: string
  type?: string
  drops?: Drop[]
  clusters?: Cluster[]
  /** RIR rating. null means "cleared", which is distinct from an absent key. */
  rir?: number | null
  /** RPE rating. null means "cleared", which is distinct from an absent key. */
  rpe?: number | null
  weightOrigin?: string
  sides?: { L?: Side; R?: Side }
  /** Time mode. */
  sec?: number
  /** Cardio mode. */
  min?: number
  speed?: number
  [key: string]: unknown
}

/** The planned shape of an exercise inside a routine. */
export interface SetTarget {
  mode?: string
  unit?: string
  side?: boolean
  min?: number
  speed?: number
  sec?: number
  seconds?: number
  durationSec?: number
  r?: number
  reps?: number
  actualReps?: number
  [key: string]: unknown
}

/** One exercise's logged block inside a workout entry. */
export interface WorkoutEntry {
  id?: string
  topW?: number
  target?: SetTarget
  sets?: WorkoutSet[]
  [key: string]: unknown
}

type Dict = Record<string, unknown>

/**
 * The generic constraint the row/side mutation helpers use.
 *
 * Deliberately NOT `Record<string, unknown>`: that demands an index signature, which `Side`
 * is right not to have (it is a closed record). Constraining to a bare object lets both a
 * full row and a single limb satisfy the same helper without either type being widened.
 */
type Editable = object

const objectOf = (value: unknown): Dict =>
  value && typeof value === 'object' && !Array.isArray(value) ? (value as Dict) : {}

function normalizedPhase(value: unknown, fallback: string = 'work'): Phase {
  const token = typeof value === 'string' ? value.trim().toLowerCase() : ''
  if (token === 'warmup' || token === 'warm-up' || token === 'warm_up') return 'warmup'
  if (token === 'work') return 'work'
  return fallback === 'warmup' ? 'warmup' : 'work'
}

/** Resolve a row's phase. An explicit phase wins over the legacy warmup boolean. */
export function phaseForSet(set: unknown, fallback: string = 'work'): Phase {
  const source = objectOf(set)
  if (source.phase != null && source.phase !== '') return normalizedPhase(source.phase, fallback)
  return source.warmup === true ? 'warmup' : normalizedPhase(undefined, fallback)
}

export function isWarmupRow(set: unknown): boolean {
  return phaseForSet(set) === 'warmup'
}

/**
 * A row's shape beyond warm-up/work: 'straight' (default), 'dropset' (a main set followed by
 * weight drops logged with no rest) or 'restpause' (an activation set followed by short-rest
 * bursts). Both extras ride on the row itself — same card, not a new set in the array — the
 * same trick `phase` uses for warm-ups.
 */
export function setType(set: unknown): SetType {
  const source = objectOf(set)
  return source.type === 'dropset' || source.type === 'restpause' ? (source.type as SetType) : 'straight'
}
export const isDropSet = (set: unknown): boolean => setType(set) === 'dropset'
export const isRestPauseSet = (set: unknown): boolean => setType(set) === 'restpause'

/** A drop-set's weight drops, oldest first; empty for anything else. */
export function dropsOf(set: unknown): Drop[] {
  const source = objectOf(set)
  return isDropSet(source) && Array.isArray(source.drops) ? (source.drops as Drop[]) : []
}

/** A rest-pause set's short-rest bursts, oldest first; empty for anything else. */
export function clustersOf(set: unknown): Cluster[] {
  const source = objectOf(set)
  return isRestPauseSet(source) && Array.isArray(source.clusters) ? (source.clusters as Cluster[]) : []
}

/**
 * Weight × reps from a drop-set's drops, on top of its own main set. The 1RM estimate and the
 * progression engine deliberately read only a row's own `w`/`r` (the heaviest effort), so this
 * is the one place a drop-set's extra volume gets added back in for totals.
 *
 * A rest-pause row is different: its own `r` IS the total (every burst's reps included), and
 * `clusters` is only how that total breaks down — not extra volume on top of it. Adding
 * `clustersOf(set)` here as well would double-count the same reps twice.
 */
export function extraVolumeOf(set: unknown): number {
  const source = objectOf(set)
  // A per-side set carries its drops on each side, so the extra volume is the sum of both
  // sides' drops — the row itself has no `drops`. dropsOf reads a side's own {type, drops}.
  if (isSideSet(source)) {
    return [sidesOf(source).L, sidesOf(source).R].reduce(
      (v, side) => v + dropsOf(side).reduce((n, d) => n + (Number(d?.w) || 0) * (Number(d?.r) || 0), 0),
      0,
    )
  }
  const drops = dropsOf(source)
  return drops.reduce((v, d) => v + (Number(d?.w) || 0) * (Number(d?.r) || 0), 0)
}

/**
 * Append a weight drop to a row, marking it a drop-set.
 *
 * Generic over the record it edits because the same shape rides on an individual limb of a
 * unilateral set: the function has to return a Side when given a Side.
 */
export function addDrop<T extends Editable>(set: T, drop: Partial<Drop>): T {
  const src = objectOf(set)
  const prev = Array.isArray(src.drops) ? (src.drops as Drop[]) : []
  return {
    ...src,
    type: 'dropset',
    drops: [...prev, { w: Number(drop?.w) || 0, r: Number(drop?.r) || 0 }],
  } as T
}

/** Append a short-rest burst to a row, marking it a rest-pause set. Generic for the same reason as addDrop. */
export function addCluster<T extends Editable>(set: T, cluster: Partial<Cluster>): T {
  const src = objectOf(set)
  const prev = Array.isArray(src.clusters) ? (src.clusters as Cluster[]) : []
  return {
    ...src,
    type: 'restpause',
    clusters: [...prev, { r: Number(cluster?.r) || 0, restSec: Number(cluster?.restSec) || 0 }],
  } as T
}

/** Remove one drop by index. Clearing the last one reverts the row to a straight set. */
export function removeDropAt<T extends Editable>(set: T, i: number): T {
  const src = objectOf(set)
  const drops = ((src.drops as Drop[]) || []).filter((_, idx) => idx !== i)
  return (drops.length ? { ...src, drops } : { ...src, type: 'straight', drops }) as T
}

/** Remove one burst by index. Clearing the last one reverts the row to a straight set. */
export function removeClusterAt<T extends Editable>(set: T, i: number): T {
  const src = objectOf(set)
  const clusters = ((src.clusters as Cluster[]) || []).filter((_, idx) => idx !== i)
  return (clusters.length ? { ...src, clusters } : { ...src, type: 'straight', clusters }) as T
}

/** Patch one drop's fields in place (weight/reps steppers edit an existing drop). */
export function setDropAt<T extends Editable>(set: T, i: number, patch: Partial<Drop>): T {
  const src = objectOf(set)
  const drops = ((src.drops as Drop[]) || []).slice()
  if (!drops[i]) return set
  drops[i] = { ...drops[i], ...patch }
  return { ...src, drops } as T
}

/** Patch one burst's fields in place (a reps stepper edits an existing burst). */
export function setClusterAt<T extends Editable>(set: T, i: number, patch: Partial<Cluster>): T {
  const src = objectOf(set)
  const clusters = ((src.clusters as Cluster[]) || []).slice()
  if (!clusters[i]) return set
  clusters[i] = { ...clusters[i], ...patch }
  return { ...src, clusters } as T
}

/**
 * Suggested weight for the next drop: pct% lighter than the previous weight, on a weight you can
 * actually load. `grid` is the exercise's weight step (5 → 80 kg, not 80.5) or a function that
 * snaps a weight onto the plates you own; without one it rounds to .5. A drop never comes out at
 * or above the weight it drops from.
 */
export function nextDropWeight(prevWeight: unknown, pct = 20, grid?: number | ((w: number) => number)): number {
  const p = Math.min(90, Math.max(1, Number(pct) || 20))
  const prev = Math.max(0, Number(prevWeight) || 0)
  const raw = prev * (1 - p / 100)
  const tidy = (w: number) => Math.round(w * 1000) / 1000
  if (typeof grid === 'function') {
    const w = Number(grid(raw))
    if (Number.isFinite(w) && w >= 0) return tidy(w)
  } else if (Number(grid) > 0) {
    const step = Number(grid)
    let w = Math.round(raw / step) * step
    if (prev > 0 && w >= prev) w = prev - step
    return tidy(Math.max(0, w))
  }
  return Math.round(raw * 2) / 2
}

/** Suggested reps for the next rest-pause burst: roughly half the previous rep count. */
export function nextBurstReps(prevReps: unknown): number {
  return Math.max(1, Math.round((Number(prevReps) || 0) / 2))
}

/**
 * Split a rest-pause total (the extra reps you want past the activation set) into a descending,
 * roughly-halving sequence of bursts that adds back up to it — e.g. 12 → [6, 3, 2, 1]. This is
 * what a planned rest-pause exercise configures directly: you say how many reps you want out of
 * the whole rest-pause portion, not how many rests.
 */
export function splitBurstReps(total: unknown): number[] {
  const bursts: number[] = []
  let remaining = Math.max(0, Math.round(Number(total) || 0))
  while (remaining > 0) {
    const burst = Math.min(remaining, nextBurstReps(remaining))
    bursts.push(burst)
    remaining -= burst
  }
  return bursts
}

// --- unilateral (per-side) sets ---------------------------------------------------------------
//
// A unilateral exercise is trained one limb at a time, and asymmetries are the whole point of
// tracking it — a stronger right carrying a weaker left is exactly what a single combined row
// hides. So a per-side row logs each side on its own: weight, reps, effort and its own done
// tick, held in `sides: { L, R }`.
//
// The row keeps a scalar summary for existing consumers. Those fields cannot reconstruct
// asymmetric loads: volume and edits must read the individual sides instead.
//   r      = L.r + R.r   (the both-sides total, exactly what those readers expect)
//   w      = max(L.w, R.w)  (the heavier side; the two are usually equal)
//   done   = L.done && R.done  (a set counts done only once both sides are)
//   effort = the harder side's rating (lower RIR / higher RPE), for the history tail only
// `syncSideAggregate` recomputes those scalars from `sides` after any per-side edit.

export function isSideSet(set: unknown): boolean {
  const s = sidesOf(set)
  return !!(s.L && s.R)
}

/** Typed read of the per-side block, so callers never hand-roll the cast. */
function sidesOf(set: unknown): { L?: Side; R?: Side } {
  const s = objectOf(set).sides
  return s && typeof s === 'object' ? (s as { L?: Side; R?: Side }) : {}
}

/**
 * A load explicitly changed by the user is protected from a later cascade. Missing provenance
 * means the row was inherited from the preceding load, including rows written before this field
 * existed. The marker is deliberately tiny and preserved on a side through aggregate resync.
 */
export const WEIGHT_ORIGIN_MANUAL = 'manual' as const

/** Includes a completed limb even when its partner is still unchecked. */
export function hasCompletedWork(set: WorkoutSet | undefined): boolean {
  if (isSideSet(set)) {
    const s = sidesOf(set)
    return s.L?.done === true || s.R?.done === true
  }
  return set?.done === true
}

/** Actual completed load × reps; the scalar maximum weight is only a summary. */
export function completedVolumeOf(set: unknown): number {
  if (isSideSet(set)) {
    const s = sidesOf(set)
    return completedVolumeOf(s.L) + completedVolumeOf(s.R)
  }
  const source = objectOf(set)
  if (source.done !== true) return 0
  return (Number(source.w) || 0) * (Number(source.r) || 0) + extraVolumeOf(set)
}

function sideOf(value: unknown): Side {
  const v = objectOf(value)
  const out: Side = { w: Number(v.w) || 0, r: Number(v.r) || 0, done: v.done === true }
  if (v.rir != null) out.rir = Number(v.rir)
  if (v.rpe != null) out.rpe = Number(v.rpe)
  if (v.weightOrigin === WEIGHT_ORIGIN_MANUAL) out.weightOrigin = WEIGHT_ORIGIN_MANUAL
  // A side can carry its own intensifier: drop-sets and rest-pause bursts are logged per limb,
  // exactly like the main set, so the same {type, drops, clusters} shape rides on the side.
  if (v.type === 'dropset' || v.type === 'restpause') out.type = v.type as SetType
  if (Array.isArray(v.drops)) out.drops = v.drops as Drop[]
  if (Array.isArray(v.clusters)) out.clusters = v.clusters as Cluster[]
  return out
}

/**
 * Build a per-side row from a plain row: each side starts as half the row's total reps (a
 * unilateral target is always even, so the split is whole) at the same weight, carrying nothing
 * done yet.
 */
export function makeSideSet(row: WorkoutSet = {}): WorkoutSet {
  const base = objectOf(row)
  const half = Math.round((Number(base.r) || 0) / 2)
  const w = Number(base.w) || 0
  const side = (): Side => ({ w, r: half, done: false })
  const next: Dict = { ...base, sides: { L: side(), R: side() } }
  // effort/done/reps on the parent become derived — drop straight-set leftovers so the row
  // carries one source of truth, then recompute the aggregate.
  delete next.rir
  delete next.rpe
  return syncSideAggregate(next)
}

/**
 * Recompute the row's scalar mirror from its two sides. No-op (returns a shallow copy) for a row
 * that is not per-side, so callers can pipe every edit through it unconditionally.
 */
export function syncSideAggregate(row: unknown): WorkoutSet {
  const base = objectOf(row)
  if (!isSideSet(base)) return { ...base }
  const sides = sidesOf(base)
  const L = sideOf(sides.L)
  const R = sideOf(sides.R)
  const out: Dict = { ...base, sides: { L, R }, r: L.r + R.r, w: Math.max(L.w, R.w), done: L.done && R.done }
  // The row's effort tail shows the harder side: fewer reps in reserve (lower RIR) or a higher
  // RPE. Only one scale is ever in play, matching how a straight row carries rir XOR rpe.
  delete out.rir
  delete out.rpe
  const rirs = [L.rir, R.rir].filter((v): v is number => v != null)
  const rpes = [L.rpe, R.rpe].filter((v): v is number => v != null)
  if (rirs.length) out.rir = Math.min(...rirs)
  else if (rpes.length) out.rpe = Math.max(...rpes)
  // Drops/clusters live on the sides now, so the row itself never carries them — only the shared
  // `type` so isDropSet/isRestPauseSet still classify the set. extraVolumeOf reads the sides.
  delete out.drops
  delete out.clusters
  delete out.type
  const sideType = setType(L) !== 'straight' ? setType(L) : setType(R)
  if (sideType !== 'straight') out.type = sideType
  return out as WorkoutSet
}

/**
 * Patch one field on one side ('L'|'R'), returning a new row with the aggregate resynced. A null
 * value clears an optional field (effort), mirroring how a straight row drops the key.
 */
export function setSideField(
  row: unknown,
  side: 'L' | 'R',
  field: string,
  value: number | null,
): WorkoutSet {
  const base = objectOf(row)
  if (!isSideSet(base) || (side !== 'L' && side !== 'R')) return { ...base }
  const sides = sidesOf(base)
  const cur: Side = { ...sideOf(sides[side]) }
  if (value == null && (field === 'rir' || field === 'rpe')) delete cur[field]
  else (cur as unknown as Dict)[field] = value
  return syncSideAggregate({ ...base, sides: { ...sides, [side]: cur } })
}

/** Flip one side's done tick, resyncing the row's own done (true only when both sides are). */
export function toggleSide(row: unknown, side: 'L' | 'R'): WorkoutSet {
  const base = objectOf(row)
  if (!isSideSet(base) || (side !== 'L' && side !== 'R')) return { ...base }
  const sides = sidesOf(base)
  const cur = sideOf(sides[side])
  return syncSideAggregate({ ...base, sides: { ...sides, [side]: { ...cur, done: !cur.done } } })
}

// --- per-side intensifiers (drop-sets / rest-pause) --------------------------------------------
//
// On a unilateral set the intensifier is logged per limb too. The structure stays symmetric —
// both sides always carry the same number of drops/bursts — while each side's weights and reps
// are edited independently, mirroring how the main set works.

/** Apply an editing fn to a single side and resync (used to edit one side's drop/burst). */
function patchSide(row: unknown, side: 'L' | 'R', fn: (s: Side) => Side): WorkoutSet {
  const base = objectOf(row)
  if (!isSideSet(base) || (side !== 'L' && side !== 'R')) return { ...base }
  const sides = sidesOf(base)
  return syncSideAggregate({ ...base, sides: { ...sides, [side]: fn(sideOf(sides[side])) } })
}

/** Apply an editing fn to both sides and resync (used to add/remove a drop/burst symmetrically). */
function patchBothSides(row: unknown, fn: (s: Side, side: 'L' | 'R') => Side): WorkoutSet {
  const base = objectOf(row)
  if (!isSideSet(base)) return { ...base }
  const sides = sidesOf(base)
  return syncSideAggregate({
    ...base,
    sides: { L: fn(sideOf(sides.L), 'L'), R: fn(sideOf(sides.R), 'R') },
  })
}

/**
 * Append a drop to both sides, each seeded from its own side's weight (pct lighter) and reps.
 * `grid` as nextDropWeight's.
 */
export function addSideDrop(row: unknown, pct?: number, grid?: number | ((w: number) => number)): WorkoutSet {
  return patchBothSides(row, side => {
    const drops = dropsOf(side)
    const base = drops.length ? drops[drops.length - 1].w : (side.w || 0)
    return addDrop(side, { w: nextDropWeight(base, pct, grid), r: side.r })
  })
}

export function removeSideDropAt(row: unknown, i: number): WorkoutSet {
  return patchBothSides(row, side => removeDropAt(side, i))
}

export function setSideDropAt(row: unknown, side: 'L' | 'R', i: number, patch: Partial<Drop>): WorkoutSet {
  return patchSide(row, side, sd => setDropAt(sd, i, patch))
}

/**
 * Append a rest-pause burst to both sides, each seeded from its own side's rep count. The side's
 * own `r` grows by the added burst, mirroring the non-per-side rule that a rest-pause row's `r`
 * is the running total across its bursts.
 */
export function addSideCluster(row: unknown, restSec?: number): WorkoutSet {
  return patchBothSides(row, side => {
    const clusters = clustersOf(side)
    const base = clusters.length ? clusters[clusters.length - 1].r : (side.r || 0)
    const added = nextBurstReps(base)
    return { ...addCluster(side, { r: added, restSec }), r: (side.r || 0) + added }
  })
}

export function removeSideClusterAt(row: unknown, i: number): WorkoutSet {
  return patchBothSides(row, side => {
    const removed = clustersOf(side)[i]?.r || 0
    return { ...removeClusterAt(side, i), r: Math.max(0, (side.r || 0) - removed) }
  })
}

export function setSideClusterAt(row: unknown, side: 'L' | 'R', i: number, r: unknown): WorkoutSet {
  return patchSide(row, side, sd => {
    const delta = (Number(r) || 0) - (clustersOf(sd)[i]?.r || 0)
    return { ...setClusterAt(sd, i, { r: Number(r) || 0 }), r: Math.max(0, (sd.r || 0) + delta) }
  })
}

export function normalizeMode(value: unknown, fallback: string = 'reps'): Mode {
  const token = typeof value === 'string' ? value.trim().toLowerCase() : ''
  if ((MODES as readonly string[]).includes(token)) return token as Mode
  return (MODES as readonly string[]).includes(fallback) ? (fallback as Mode) : 'reps'
}

function modeFromUnit(value: unknown): Mode | null {
  const token = typeof value === 'string' ? value.trim().toLowerCase() : ''
  if (['rep', 'reps', 'repetition', 'repetitions'].includes(token)) return 'reps'
  if (['sec', 'secs', 'second', 'seconds'].includes(token)) return 'time'
  if (['min', 'mins', 'minute', 'minutes'].includes(token)) return 'cardio'
  return null
}

function explicitMode(source: unknown): Mode | null {
  const value = objectOf(source).mode
  const token = typeof value === 'string' ? value.trim().toLowerCase() : ''
  return (MODES as readonly string[]).includes(token) ? (token as Mode) : modeFromUnit(objectOf(source).unit)
}

function inferredMode(source: unknown): Mode | null {
  const value = objectOf(source)
  const explicit = explicitMode(value)
  if (explicit) return explicit
  if (String(value.mode || '').trim().toLowerCase() === 'amrap') return 'reps'
  if (value.min != null || value.speed != null) return 'cardio'
  if (value.sec != null || value.seconds != null || value.durationSec != null) return 'time'
  if (value.r != null || value.reps != null || value.actualReps != null) return 'reps'
  return null
}

/** Resolve one row's mode: explicit row, parent target, then legacy result fields. */
export function modeForSet(set: unknown, target: SetTarget = {}): Mode {
  return explicitMode(set) || inferredMode(target) || inferredMode(set) || 'reps'
}

/** Resolve a single mode for an entry; mixed work-row modes intentionally return null. */
export function modeForEntry(entry: unknown, fallback: Mode | null = null): Mode | null {
  const source = objectOf(entry)
  const target = objectOf(source.target || source)
  const sets = Array.isArray(source.sets) ? (source.sets as WorkoutSet[]) : []
  const work = sets.filter(set => !isWarmupRow(set))
  const observed = work.length ? work : sets
  const modes = [...new Set(observed.map(set => modeForSet(set, target)))]
  if (modes.length > 1) return null
  if (modes.length === 1) return modes[0]
  const targetMode = inferredMode(target)
  if (targetMode) return targetMode
  return fallback == null ? modeForSet(source, target) : normalizeMode(fallback)
}