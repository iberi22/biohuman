/**
 * Catalogue resolution over the exercise dataset.
 *
 * Adapted from openGym's `exercises.js` (https://github.com/DuarteSantos8/openGym, AGPL-3.0-or-later,
 * Copyright (C) 2026 Duarte Santos). See NOTICE.md.
 *
 * Two things are different from upstream and both are deliberate:
 *
 * - **Ids are slugs, not numbers.** The contract's exercise ref is `wg:<slug>`, so `EXIDX` is keyed
 *   by slug. Upstream used openGym's 4-digit ids, which the ecosystem never adopted.
 * - **No media.** Upstream resolves `imgSrc`/`gifSrc` to a CDN or a mounted directory. The photos and
 *   GIFs have unresolved title and are not vendored here at all, so there is nothing to resolve. An
 *   exercise without artwork gets `artRef: null` and the UI shows an honest placeholder.
 *
 * Everything else is the point of the module: the searches, and the equipment rules that decide
 * whether a set carries a load column at all.
 */

import EXERCISES from '../../data/exercises.json'

/** One exercise as the catalogue knows it. */
export interface CatalogueExercise {
  /** The `wg:` half of the contract's exercise ref. */
  slug: string
  /** Display name. */
  name: string
  /** Spanish display name, when the dataset carries one. */
  name_es?: string
  bodyPart: string
  equipment: string
  primaryMuscle: string
  secondaryMuscles: string[]
  steps: string[]
  /** `workout-guide` slug when the name matched exactly; null means no artwork. */
  artRef: string | null
  /** Declared logging mode; `assisted_bodyweight` is the reliable assisted signal. */
  exerciseType?: string
  [key: string]: unknown
}

/**
 * The shipped catalogue and its id index.
 *
 * Loaded from `src/data/exercises.json`, which the build generates from the vendored
 * `workout-guide` set. Kept as a plain array plus a slug index rather than a class so every consumer
 * — UI, search, MCP, contract export — reads the same objects.
 */
export const CATALOGUE: CatalogueExercise[] = (
  EXERCISES as unknown as CatalogueExercise[]
).map((e) => ({
  ...e,
  // This dataset groups by muscle region rather than by the body-part taxonomy GOS uses, and
  // carries no technique text — so `bodyPart` falls back to the region and `steps` to an empty
  // list rather than pretending the two catalogues agree.
  bodyPart: e.bodyPart ?? e.muscleGroup ?? '',
  steps: e.steps ?? [],
}))

export const EXIDX: Record<string, CatalogueExercise> = Object.create(null)
for (const e of CATALOGUE) EXIDX[e.slug] = e

/** Slugs currently shadowed by a user-created exercise, so unregistering can restore them. */
let customSlugs: string[] = []

/** Every body part in the catalogue, alphabetical. */
export const BODYPARTS: string[] = [...new Set(CATALOGUE.map((e) => e.bodyPart))].sort()

/** Equipment that is a load in its own right: a bar, a bell, a stack, a sled, a weight. */
const LOADED_EQ = new Set([
  'barbell',
  'ez barbell',
  'olympic barbell',
  'trap bar',
  'dumbbell',
  'kettlebell',
  'cable',
  'leverage machine',
  'smith machine',
  'sled machine',
  'weighted',
])

/**
 * Equipment with no meaningful load in kilograms: your own body, or a band whose "weight" is a
 * colour. Both default to the bodyweight model — one reps stepper, progression in reps — while the
 * per-exercise Bodyweight switch still overrides it either way.
 */
const BODYWEIGHT_EQ = new Set(['body weight', 'band', 'resistance band', 'bodyweight'])

/**
 * Equipment that can carry part of your body weight.
 *
 * This catalogue has no `leverage machine` value — it uses `Machine`, which covers 35 exercises
 * of which only three are assisted. So equipment alone cannot decide, and the row's declared
 * `exerciseType` is the reliable signal where it exists.
 */
const ASSISTED_EQ = new Set(['machine', 'leverage machine'])
const assistedName = (n: unknown) => /\bassist(ed)?\b/i.test(String(n || ''))

/** Accepts a slug or an exercise, so callers never have to know which they hold. */
export type Ref = string | CatalogueExercise

const resolve = (idOrEx: Ref): CatalogueExercise | undefined =>
  typeof idOrEx === 'string' ? EXIDX[idOrEx] : idOrEx

/** Lowercase and strip diacritics, so "elevação" matches a query typed as "elevacao". */
export const normalizeStr = (s: unknown): string =>
  String(s ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()

/** Lowercase, de-accented, punctuation collapsed to single spaces. */
const normalizeSearch = (s: unknown): string =>
  normalizeStr(s)
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()

/**
 * Cardio exercises log time and speed instead of weight × reps.
 */
export const isCardio = (idOrEx: Ref): boolean => resolve(idOrEx)?.bodyPart === 'cardio'

/** Equipment with no load to enter, so a set on one of these is logged in reps alone. */
export const isBodyweightEq = (idOrEx: Ref): boolean =>
  BODYWEIGHT_EQ.has(String(resolve(idOrEx)?.equipment).toLowerCase())

/** Equipment where a logged 0 kg is a number nobody typed in. */
export const isLoadedEq = (idOrEx: Ref): boolean =>
  LOADED_EQ.has(String(resolve(idOrEx)?.equipment).toLowerCase())

/**
 * Assistance machines run the other way round: the stack carries part of your body weight, so a
 * smaller number is the harder set and the record. Inverting a normal lift would hide real
 * progress, so the rule is deliberately narrow — the machine that takes load off you is the
 * leverage machine whose name says "assisted".
 *
 * The name alone is not enough. Twenty-nine catalogue entries say "assisted": partner-assisted
 * stretches, a medicine-ball twist, band and bodyweight leg curls. On those the weight is ordinary
 * load and inverting them would be the same bug pointed the other way. Equipment is what separates
 * the two.
 *
 * `assisted: true|false` on a custom exercise or on a routine's config overrides the rule in either
 * direction, which is how anything the catalogue does not know gets marked.
 */
function assistedShape(
  ex: (CatalogueExercise & { assisted?: boolean; exerciseType?: string }) | undefined,
): boolean {
  if (typeof ex?.assisted === 'boolean') return ex.assisted
  // The dataset states it outright for the bodyweight cases; trust that over any inference.
  if (ex?.exerciseType === 'assisted_bodyweight') return true
  return ASSISTED_EQ.has(String(ex?.equipment).toLowerCase()) && assistedName(ex?.name)
}

export function isAssisted(idOrEx: Ref): boolean {
  if (!idOrEx) return false
  if (typeof idOrEx === 'string') return assistedShape(EXIDX[idOrEx])
  if (typeof (idOrEx as { assisted?: boolean }).assisted === 'boolean')
    return (idOrEx as { assisted?: boolean }).assisted as boolean
  const target = (idOrEx as { target?: { assisted?: boolean } }).target
  if (typeof target?.assisted === 'boolean') return target.assisted
  const known = idOrEx.slug ? EXIDX[idOrEx.slug] : null
  return assistedShape(known || idOrEx)
}

/** The better of two loads for this exercise: less assistance, or more weight. */
export const betterWeight = (idOrEx: Ref, a: number, b: number): number =>
  isAssisted(idOrEx) ? Math.min(a, b) : Math.max(a, b)

/** Is `w` a better load than `prev`? `prev` of 0 means nothing logged yet. */
export const beatsWeight = (idOrEx: Ref, w: number, prev: number): boolean =>
  w > 0 && (prev <= 0 || (isAssisted(idOrEx) ? w < prev : w > prev))

/**
 * An id that resolves to nothing — a plan built against a different dataset, a custom exercise
 * deleted on another device before the sync arrived — still has to render. A placeholder keeps it
 * visible and removable instead of taking the whole view down on the first read of its name.
 */
export function exOr(slug: string): CatalogueExercise {
  return (
    EXIDX[slug] || {
      slug,
      name: 'Unknown exercise',
      bodyPart: '',
      equipment: '',
      primaryMuscle: '',
      secondaryMuscles: [],
      steps: [],
      artRef: null,
      missing: true,
    }
  )
}

/** Equipment present in an already-filtered list, most common first. */
export function equipmentOf(list: CatalogueExercise[]): string[] {
  const counts: Record<string, number> = {}
  for (const e of list) {
    const eq = String(e.equipment ?? '')
    if (eq) counts[eq] = (counts[eq] ?? 0) + 1
  }
  return Object.keys(counts).sort((a, b) => counts[b] - counts[a] || a.localeCompare(b))
}

/** Body parts present in an already-filtered list, alphabetical. */
export const bodyPartsOf = (list: CatalogueExercise[]): string[] =>
  [...new Set(list.map((e) => e.bodyPart).filter(Boolean))].sort()

// --- search -----------------------------------------------------------------------------------

/** True when `needle` is an ordered subsequence of `hay`: lets "bnch" find "bench". */
function isSubsequence(needle: string, hay: string): boolean {
  let i = 0
  for (const ch of hay) {
    if (ch === needle[i]) i++
    if (i === needle.length) return true
  }
  return false
}

/**
 * Allow one missing, extra or substituted character, or an adjacent transposition, in long query
 * tokens. Short tokens stay exact/substring only: "row" and "curl" are too common for typo
 * tolerance to be useful — it would list hundreds of unrelated exercises ahead of the real hits.
 *
 * Only the exercise's own name words are ever compared this way. Body part, target and equipment
 * words are shared by a whole slice of the catalogue, so "wrist" ~ "waist" or "power" ~ "lower arms"
 * would flood the results.
 */
export function nearWord(a: string, b: string): boolean {
  if (a.length < 5 || Math.abs(a.length - b.length) > 1) return false
  let i = 0
  while (i < a.length && a[i] === b[i]) i++
  if (i === a.length) return b.length - i <= 1
  if (a.length === b.length) {
    return (
      a.slice(i + 1) === b.slice(i + 1) ||
      (a[i] === b[i + 1] && a[i + 1] === b[i] && a.slice(i + 2) === b.slice(i + 2))
    )
  }
  return a.length > b.length ? a.slice(i + 1) === b.slice(i) : a.slice(i) === b.slice(i + 1)
}

/** Fields are weighted: the name dominates, equipment and target muscle matter, the rest support. */
const SEARCH_FIELDS: [keyof CatalogueExercise, number][] = [
  ['name', 100],
  ['name_es', 100],
  ['equipment', 40],
  ['primaryMuscle', 40],
  ['bodyPart', 30],
  ['secondaryMuscles', 30],
]

/** Everything searchable on one exercise, lowercased and de-accented. */
function corpusOf(e: CatalogueExercise): string {
  return normalizeSearch([
    e.name,
    e.name_es ?? '',
    e.primaryMuscle,
    e.equipment,
    e.bodyPart,
    ...(Array.isArray(e.secondaryMuscles) ? e.secondaryMuscles : []),
  ].join(' '))
}

/** The name with spaces and hyphens removed, so "benchpress" finds "bench press". */
const joinWords = (s: string) => s.replace(/[\s\-‐-―]+/g, '')

/**
 * Fuzzy score for one exercise against a query. Best hits first: exact field match, then field
 * prefix, then word-boundary starts, then substrings (closer to the start scores better), and
 * finally typo-tolerant ordered subsequences.
 *
 * 0 means no match, so this stays usable as a boolean filter while a picker ranks by score.
 */
export function searchScore(exercise: unknown, query: unknown): number {
  const needle = normalizeSearch(query)
  if (!needle) return 1
  const source = (exercise && typeof exercise === 'object' ? exercise : {}) as CatalogueExercise
  const tokens = needle.split(/\s+/).filter(Boolean)
  if (!tokens.length) return 0

  let total = 0
  // Extra words in the name that the query did not ask for make a hit worse, not equal. Without
  // this, "bench press" and "bench press with bands" score identically and the picker can only
  // fall back on catalogue order — which buries the exact answer under every longer variant of it.
  // Scaled against the field weight so it cannot outweigh a match on a stronger field.
  const nameWords = normalizeSearch(source.name).split(/\s+/).filter(Boolean).length
  const surplus = Math.max(0, nameWords - tokens.length)
  const surplusPenalty = surplus * 5

  for (const token of tokens) {
    let best = 0
    for (const [field, weight] of SEARCH_FIELDS) {
      const hay = normalizeSearch(source[field])
      if (!hay) continue
      if (hay === token) best = Math.max(best, weight * 4)
      else if (hay.startsWith(token)) best = Math.max(best, weight * 3)
      const idx = hay.indexOf(token)
      if (idx > 0) best = Math.max(best, weight * 2 - Math.min(idx, 20) * 0.5)
      if (hay.split(/\s+/).some((w) => w.startsWith(token)))
        best = Math.max(best, weight * 2.5)
      if (isSubsequence(token, hay))
        best = Math.max(best, weight + Math.max(0, 10 - (hay.length - token.length)))
    }
    // Every token has to match something, so "press bench" finds "Bench Press".
    if (!best) return 0
    total += best
  }
  return Math.max(1, total - surplusPenalty)
}

export const matchesExerciseSearch = (exercise: unknown, query: unknown): boolean =>
  searchScore(exercise, query) > 0

const queryTokens = (query: unknown): string[] => normalizeSearch(query).split(/\s+/).filter(Boolean)

/** A token appears in the corpus as typed, or in the name with its spaces and hyphens left out. */
const hits = (hay: string, tok: string): boolean =>
  hay.includes(tok) || (tok.length >= 4 && hay.includes(joinWords(tok)))

/**
 * Search a list, exact hits first: a token that appears literally in at least one exercise is
 * taken at its word for the whole list, and only a token with no exact hit anywhere ("bnech",
 * "dumbell") gets typo tolerance. Otherwise a correctly spelled query such as "squat" would also
 * drag in "squad", and since callers keep catalogue order those strays would land first.
 *
 * Filters compose: pass only the facets the screen is showing, so every combination on screen has
 * results behind it.
 */
export function searchExercises(
  list: CatalogueExercise[],
  query = '',
  facets: { bodyPart?: string; equipment?: string; muscle?: string } = {},
): CatalogueExercise[] {
  const { bodyPart = '', equipment = '', muscle = '' } = facets
  const filtered = list.filter(
    (e) =>
      (!bodyPart || e.bodyPart === bodyPart) &&
      (!equipment || e.equipment === equipment) &&
      (!muscle || e.primaryMuscle === muscle),
  )
  const tokens = queryTokens(query)
  if (!tokens.length) return filtered

  const corpora = filtered.map((e) => ({ e, hay: corpusOf(e) }))
  const nameWordsOf = (e: CatalogueExercise) =>
    normalizeSearch(e.name).split(/\s+/).filter(Boolean)
  const fuzzy = new Set(
    tokens.filter((tok) => !corpora.some(({ hay }) => hits(hay, tok))),
  )

  return corpora
    .filter(({ e, hay }) =>
      tokens.every(
        (tok) =>
          hits(hay, tok) ||
          (fuzzy.has(tok) && nameWordsOf(e).some((word) => nearWord(tok, word))),
      ),
    )
    .map(({ e }) => e)
}

/** Single-exercise check, for callers that filter one option at a time. */
export function matchExercise(e: CatalogueExercise, query: string): boolean {
  const tokens = queryTokens(query)
  if (!tokens.length) return true
  if (!e || typeof e !== 'object') return false
  const hay = corpusOf(e)
  const fuzzy = new Set(tokens)
  return tokens.every(
    (tok) =>
      hits(hay, tok) ||
      (fuzzy.has(tok) && normalizeSearch(e.name).split(/\s+/).some((w) => nearWord(tok, w))),
  )
}

/**
 * Ranked search, best first — for a picker that shows one list ordered by relevance.
 *
 * Ties keep catalogue order, so a query with several equally good hits does not reshuffle the list
 * under the reader.
 */
export function rankExercises(list: CatalogueExercise[], query: string): CatalogueExercise[] {
  return list
    .map((e, i) => ({ e, i, score: searchScore(e, query) }))
    .filter((r) => r.score > 0)
    .sort((a, b) => b.score - a.score || a.i - b.i)
    .map((r) => r.e)
}

/**
 * Custom (user-created) exercises live in synced state, not in the shipped catalogue, and are
 * merged into the id index so every lookup keeps working unchanged. Passing an empty list removes
 * them again and restores the built-ins they shadowed.
 */
export function registerCustom(list: CatalogueExercise[]): void {
  for (const slug of customSlugs) {
    delete EXIDX[slug]
    const builtIn = CATALOGUE.find((e) => e.slug === slug)
    if (builtIn) EXIDX[slug] = builtIn
  }
  customSlugs = (list ?? []).map((e) => e.slug)
  for (const e of list ?? []) EXIDX[e.slug] = e
}

/** The full searchable catalogue — customs first, so your own exercises are easy to find. */
export const allExercises = (custom: CatalogueExercise[] = []): CatalogueExercise[] => [
  ...custom,
  ...CATALOGUE,
]