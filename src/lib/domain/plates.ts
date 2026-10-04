/**
 * Plate loading for a set row: which plates go on for THIS weight, from the plates you own.
 *
 * Adapted from openGym's `plates.js` (https://github.com/DuarteSantos8/openGym, AGPL-3.0-or-later,
 * Copyright (C) 2026 Duarte Santos). See NOTICE.md.
 *
 * `bar.ts` knows the bar and splits what is beyond it per side. This turns that number into plates
 * ("45 + 5"), and does the same for a single stack (a dip belt, a landmine, a plate-loaded machine,
 * a sled).
 *
 * Logged weights stay the TOTAL on the bar or on the added load. Everything here is display.
 *
 * One structural difference: equipment is read through an injected lookup rather than an import of
 * the catalogue. `catalogue.ts` pulls in the generated 302-entry dataset, and a plate calculator
 * that needs one string per exercise should not drag that file in behind it.
 */
import { defaultBarWeight, usesBar } from './bar'
import { isBw, type RoutineExercise } from './history'
import { weightIncrement } from './progression'

/** One size in an inventory: its weight and how many of it there are. */
export interface PlateSize {
  w: number
  /** Pairs, or plates for a single stack. */
  n: number
}

/** The plate sizes the inventory editor lists, heaviest first, per unit. */
export const PLATE_SIZES: Record<string, number[]> = {
  kg: [25, 20, 15, 10, 5, 2.5, 1.25, 0.5],
  lb: [45, 35, 25, 15, 10, 5, 2.5, 1.25],
}

/** Sizes a gym without an inventory of its own is assumed NOT to have. */
const UNCOMMON: Record<string, Set<number>> = {
  kg: new Set([0.5]),
  lb: new Set([15, 1.25]),
}

/** Pairs of each size the default inventory holds — plenty, the way a rack is. */
export const DEFAULT_PAIRS = 6

/** Equipment that loads a single stack rather than two sides of a bar. */
const SINGLE_EQ = new Set(['weighted', 'sled machine'])

/** How a weight is loaded: two sides of a bar, one stack, or nothing to load. */
export type LoadKind = 'pairs' | 'single' | 'none'

/** The slice of state the plate editor reads. */
export interface PlateState {
  unit?: string | null
  /** Pairs per size, per unit: `plates[unit]` is `{ [size]: pairs, _ts }`. */
  plates?: Record<string, Record<string, number> & { _ts?: number }> | null
  /** Per-exercise loading choice: `loadKind[exId]` is `{ kind, _ts }`. */
  loadKind?: Record<string, { kind?: LoadKind | null; _ts?: number }> | null
  /** Bar weight per exercise; 0 means "no bar". */
  barWeights?: Record<string, number> | null
}

/**
 * Both choices this module reads are stored with the time they were made. Going back to the default
 * is a stamped entry too (`kind: null`, a list with no sizes) rather than a deleted key, so it wins
 * a sync against the other device's older choice instead of coming back from it.
 */
const unitOf = (S: PlateState | null | undefined): string => (S?.unit === 'lb' ? 'lb' : 'kg')

const num = (v: unknown): number => (typeof v === 'number' && Number.isFinite(v) ? v : Number(v) || 0)

/** The sizes of a stored plate list with their counts, `_ts` and junk keys left out. */
const sizesOf = (entry: unknown): [string, number][] => {
  if (!entry || typeof entry !== 'object' || Array.isArray(entry)) return []
  return Object.entries(entry as Record<string, unknown>)
    .filter(([k]) => num(k) > 0)
    .map(([k, v]): [string, number] => [k, num(v)])
}

let equipmentBySlug = new Map<string, string>()

/**
 * Register the catalogue's equipment lookups.
 *
 * Called once by the app with the loaded catalogue. Injecting it keeps this module free of the
 * generated dataset and lets a test supply three exercises instead of 302.
 */
export function registerEquipment(map: Iterable<[string, string]>): void {
  equipmentBySlug = new Map(map)
}

/** The equipment string for an exercise slug, or '' when it is not in the catalogue. */
export const equipmentFor = (slug: string | undefined): string =>
  slug ? (equipmentBySlug.get(slug) ?? '') : ''

/** Whether this profile counts its own plates for its unit, rather than loading the standard set. */
export const ownsPlates = (S: PlateState | null | undefined): boolean =>
  sizesOf(S?.plates?.[unitOf(S)]).length > 0

/**
 * The plates this profile can load, heaviest first: `[{ w, n }]` with n pairs (or plates, for a
 * single stack) of each size. Absent or without any size → the default set.
 */
export function inventoryFor(S: PlateState | null | undefined): PlateSize[] {
  const unit = unitOf(S)
  const own = sizesOf(S?.plates?.[unit])
  const out: PlateSize[] = []
  if (own.length) {
    for (const [k, v] of own) {
      const w = num(k)
      const n = Math.floor(num(v))
      if (w > 0 && n > 0) out.push({ w, n })
    }
  } else {
    for (const w of PLATE_SIZES[unit]) if (!UNCOMMON[unit].has(w)) out.push({ w, n: DEFAULT_PAIRS })
  }
  return out.sort((a, b) => b.w - a.w)
}

/**
 * plates with `n` pairs of size `w` for the profile's unit, stamped. The first change copies the
 * standard set in, so the list the inventory sheet shows is always the one the rows load from.
 */
export function withPlatePairs(
  S: PlateState | null | undefined,
  w: number,
  n: number,
  now = Date.now(),
): NonNullable<PlateState['plates']> {
  const unit = unitOf(S)
  const list: Record<string, number> = ownsPlates(S)
    ? Object.fromEntries(sizesOf(S!.plates![unit]))
    : Object.fromEntries(inventoryFor(S).map(p => [p.w, p.n]))
  list[w] = Math.max(0, Math.round(num(n)))
  return { ...(S?.plates || {}), [unit]: { ...list, _ts: now } }
}

/** plates with the profile's unit back on the standard set: a stamped list with no sizes. */
export const withStandardPlates = (
  S: PlateState | null | undefined,
  now = Date.now(),
): NonNullable<PlateState['plates']> => ({ ...(S?.plates || {}), [unitOf(S)]: { _ts: now } })

/**
 * An exercise's own loading as it is stored, or null when the equipment decides. A bare string is
 * how the first builds stored it and still reads as that kind.
 */
export function loadKindOf(value: unknown): LoadKind | null {
  const k = value && typeof value === 'object' ? (value as { kind?: unknown }).kind : value
  return k === 'pairs' || k === 'single' || k === 'none' ? (k as LoadKind) : null
}

/** loadKind with the exercise's loading set to `kind`, or back on its equipment's for null. */
export const withLoadKind = (
  map: PlateState['loadKind'],
  exId: string,
  kind: LoadKind | null,
  now = Date.now(),
): NonNullable<PlateState['loadKind']> => ({
  ...(map || {}),
  [exId]: { kind: loadKindOf(kind), _ts: now },
})

/** The count of one size in this profile's inventory (0 when it has none). */
export const pairsOf = (S: PlateState | null | undefined, w: number): number =>
  inventoryFor(S).find(p => p.w === w)?.n || 0

// Everything is done in quarter-units so 1.25 and 2.5 stay exact integers.
const Q = 4
const q = (w: number) => Math.round(w * Q)

/** What plates a weight needs, and what the inventory cannot supply. */
export interface PlateStack {
  /** Plate weights, heaviest first. */
  plates: number[]
  /** Weight the inventory falls short by; 0 means exact. */
  missing: number
}

/**
 * Plates for `weight`, from `inv` (heaviest first).
 *
 * Heaviest-first greedy when that lands exactly — the way a bar is loaded in practice. When greedy
 * misses (a home gym with one pair of each size, an odd inventory) the fewest plates that hit the
 * weight exactly, biased to heavier plates on ties. When nothing hits it, the closest load BELOW and
 * what is missing.
 */
export function plateStack(weight: unknown, inv: PlateSize[] | null | undefined): PlateStack {
  const target = q(Math.max(0, num(weight)))
  if (target === 0) return { plates: [], missing: 0 }
  const items = (inv || []).filter(p => p.w > 0 && p.n > 0).sort((a, b) => b.w - a.w)

  // 1. greedy
  const greedy: number[] = []
  let left = target
  for (const p of items) {
    const unit = q(p.w)
    let k = Math.min(p.n, Math.floor(left / unit))
    while (k-- > 0) {
      greedy.push(p.w)
      left -= unit
    }
  }
  // At or beyond everything you own, greedy has already put every plate on and the rest is
  // missing. The search below would only find that again, with a table as long as the target — a
  // typo like 9999 in a weight field built it on every keystroke.
  const all = items.reduce((sum, p) => sum + q(p.w) * p.n, 0)
  if (left === 0 || target >= all) return { plates: greedy, missing: left / Q }

  // 2. exact fit with the fewest plates: f[i][s] = min plates using sizes i.. to make s
  const n = items.length
  const INF = 1e9
  const f = Array.from({ length: n + 1 }, () => new Int32Array(target + 1).fill(INF))
  f[n][0] = 0
  for (let i = n - 1; i >= 0; i--) {
    const unit = q(items[i].w)
    const cap = items[i].n
    for (let s = 0; s <= target; s++) {
      let best = f[i + 1][s]
      for (let k = 1; k <= cap && k * unit <= s; k++) {
        const v = f[i + 1][s - k * unit]
        if (v + k < best) best = v + k
      }
      f[i][s] = best
    }
  }
  // The heaviest reachable sum at or below the target (the target itself when it fits).
  let sum = target
  while (sum > 0 && f[0][sum] >= INF) sum--
  const plates: number[] = []
  let s = sum
  for (let i = 0; i < n; i++) {
    const unit = q(items[i].w)
    const cap = items[i].n
    // Largest k that still leaves an optimal remainder → heavier plates on ties.
    for (let k = Math.min(cap, Math.floor(s / unit)); k >= 0; k--) {
      if (f[i + 1][s - k * unit] + k === f[i][s]) {
        for (let j = 0; j < k; j++) plates.push(items[i].w)
        s -= k * unit
        break
      }
    }
  }
  return { plates, missing: (target - sum) / Q }
}

/** What comes off and what goes on when moving from one stack to the next. */
export interface PlateDelta {
  strip: number[]
  add: number[]
}

/** Going from one stack to the next: a multiset difference, each side heaviest first. */
export function plateDelta(
  prev: number[] | null | undefined,
  next: number[] | null | undefined,
): PlateDelta {
  const count = (arr: number[] | null | undefined) => {
    const m = new Map<number, number>()
    for (const w of arr || []) m.set(w, (m.get(w) || 0) + 1)
    return m
  }
  const a = count(prev)
  const b = count(next)
  const strip: number[] = []
  const add: number[] = []
  for (const [w, n] of a) for (let i = 0; i < n - (b.get(w) || 0); i++) strip.push(w)
  for (const [w, n] of b) for (let i = 0; i < n - (a.get(w) || 0); i++) add.push(w)
  const desc = (x: number, y: number) => y - x
  return { strip: strip.sort(desc), add: add.sort(desc) }
}

/**
 * How an exercise's weight is loaded.
 *
 * 'pairs' (a bar or a two-post machine — plates split per side beyond the bar), 'single' (one
 * stack: dip belt, landmine, plate-loaded machine, sled — all of it beyond the base weight), 'none'
 * (dumbbells, kettlebells, cables, pin machines, bands).
 *
 * The user's own choice wins; otherwise bar equipment → pairs, body-weight and "weighted" exercises
 * and sleds → single (the added load is what you hang on), the rest → none. A band's "weight" is its
 * tension, not plates, so bands are none even though isBw counts them.
 */
export function loadKindFor(
  S: PlateState | null | undefined,
  cfgOrId: RoutineExercise | string | null | undefined,
): LoadKind {
  const cfg: RoutineExercise =
    typeof cfgOrId === 'string' ? { id: cfgOrId } : (cfgOrId ?? ({} as RoutineExercise))
  const equipment = equipmentFor(cfg.id)
  const own = cfg.id ? loadKindOf(S?.loadKind?.[cfg.id]) : null
  if (own) return own
  if (usesBar(equipment)) return 'pairs'
  if (equipment === 'band' || equipment === 'resistance band') return 'none'
  if (SINGLE_EQ.has(equipment) || isBw(cfg)) return 'single'
  return 'none'
}

/**
 * The weight that is there before any plate goes on, in the profile unit: the bar for bar
 * exercises (an override, 0 meaning "no bar", else the type's default), an explicit override for
 * anything else (a sled's own weight), 0 otherwise.
 */
export function baseWeightFor(S: PlateState | null | undefined, exId: string | undefined): number {
  if (!exId) return 0
  const equipment = equipmentFor(exId)
  if (!equipment) return 0
  const own = S?.barWeights?.[exId]
  if (typeof own === 'number' && own >= 0) return own
  return defaultBarWeight(equipment, S?.unit) ?? 0
}

/** The load line for one set row. */
export interface RowLoad {
  kind: LoadKind
  /** Per-side (pairs) or total (single) load beyond the base. */
  perSide: number
  plates: number[]
  missing: number
  /** True when the weight is at or below the base and nothing goes on. */
  barOnly: boolean
}

/**
 * The load line for one set row: null when there is nothing to load (kind none, or no weight);
 * `barOnly` when the weight is at or below the base; otherwise the stack for the per-side or total
 * load plus what is missing from the inventory.
 */
export function rowLoad(
  kind: LoadKind,
  weight: unknown,
  base: number,
  inv: PlateSize[] | null | undefined,
): RowLoad | null {
  if (kind !== 'pairs' && kind !== 'single') return null
  const w = num(weight)
  if (!(w > 0)) return null
  const b = Math.max(0, num(base))
  if (w <= b) return { kind, barOnly: true, perSide: 0, plates: [], missing: 0 }
  const perSide = Math.round(((w - b) / (kind === 'pairs' ? 2 : 1)) * 100) / 100
  const { plates, missing } = plateStack(perSide, inv)
  return { kind, barOnly: false, perSide, plates, missing }
}

/** Two rows load the same when their stacks match, both are (or are not) bar-only, and the same amount is missing. */
export const sameLoad = (a: RowLoad | null, b: RowLoad | null): boolean =>
  !!a &&
  !!b &&
  a.barOnly === b.barOnly &&
  a.missing === b.missing &&
  a.plates.length === b.plates.length &&
  a.plates.every((w, i) => w === b.plates[i])

/** A grid: either the exercise's own increment, or a snapping function for counted plates. */
export type DropGrid = number | ((w: number) => number)

/**
 * Where a drop-set's next weight may land: on the plates this profile owns when it has counted
 * them and the exercise is plate-loaded — the heaviest load at or below the drop those plates make
 * — else on the exercise's own weight step.
 *
 * A drop rounded to .5 read 48.5 kg on a bar that loads in 2.5s, so the grid has to know what the
 * rack can actually hold.
 */
export function dropGrid(S: PlateState | null | undefined, cfg: RoutineExercise | null | undefined): DropGrid {
  const kind = loadKindFor(S, cfg)
  if (ownsPlates(S) && (kind === 'pairs' || kind === 'single')) {
    const base = baseWeightFor(S, cfg?.id)
    const inv = inventoryFor(S)
    const per = kind === 'pairs' ? 2 : 1
    return (w: number) => {
      if (w <= base) return base > 0 ? base : w
      const load = rowLoad(kind, w, base, inv)
      const perSide = load?.perSide ?? 0
      const missing = load?.missing ?? 0
      return base + per * Math.max(0, perSide - missing)
    }
  }
  return weightIncrement(cfg, S?.unit === 'lb' ? 'lb' : 'kg')
}