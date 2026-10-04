/**
 * Ported from openGym's `exercises.test.js`, retargeted at this catalogue.
 *
 * The assertions that matter here are the equipment rules. They decide whether a set shows a weight
 * column at all, and getting one wrong is either a field nobody can fill or a false record — so
 * `isAssisted` in particular is pinned hard, including the cases that look assisted and are not.
 */
import { describe, expect, it } from 'vitest'
import {
  allExercises,
  BODYPARTS,
  betterWeight,
  beatsWeight,
  bodyPartsOf,
  CATALOGUE,
  equipmentOf,
  exOr,
  EXIDX,
  isAssisted,
  isBodyweightEq,
  isCardio,
  isLoadedEq,
  matchExercise,
  matchesExerciseSearch,
  nearWord,
  normalizeStr,
  rankExercises,
  registerCustom,
  searchExercises,
  searchScore,
  type CatalogueExercise,
} from './catalogue'

const bench = CATALOGUE.find((e) => e.slug === 'bench-press')!
const squat = CATALOGUE.find((e) => e.slug === 'squat')!

describe('the index', () => {
  it('keys every exercise by its slug, which is the contract ref', () => {
    for (const e of CATALOGUE) expect(EXIDX[e.slug], `${e.slug} missing from EXIDX`).toBe(e)
    expect(Object.keys(EXIDX).length).toBe(CATALOGUE.length)
    expect(EXIDX['no-such-exercise']).toBeUndefined()
  })

  it('lists body parts without duplicates', () => {
    expect(BODYPARTS.length).toBeGreaterThan(0)
    expect(new Set(BODYPARTS).size).toBe(BODYPARTS.length)
    expect([...BODYPARTS].sort()).toEqual(BODYPARTS)
  })
})

describe('exOr', () => {
  it('returns the real exercise when the slug resolves', () => {
    expect(exOr('bench-press').slug).toBe('bench-press')
  })

  it('returns a usable placeholder for a slug that resolves to nothing', () => {
    // A plan built against a different dataset must still render: the view would otherwise go down
    // on the first read of the name.
    const ph = exOr('deleted-on-another-device')
    expect(ph.missing).toBe(true)
    expect(ph.name).toBe('Unknown exercise')
    expect(ph.steps).toEqual([])
  })
})

describe('equipment rules', () => {
  it('reads bodyweight as carrying no load', () => {
    expect(isBodyweightEq('push-up')).toBe(true)
    expect(isBodyweightEq('bench-press')).toBe(false)
    // equipment strings are matched case-insensitively: this dataset title-cases them
    expect(isBodyweightEq({ ...bench, equipment: 'Bodyweight' })).toBe(true)
  })

  it('knows which equipment is a load in its own right', () => {
    expect(isLoadedEq('bench-press')).toBe(true)
    expect(isLoadedEq('push-up')).toBe(false)
  })

  it('treats cardio as its own mode', () => {
    expect(isCardio({ ...bench, bodyPart: 'cardio' })).toBe(true)
    expect(isCardio(bench)).toBe(false)
  })
})

describe('isAssisted', () => {
  it('is false for an ordinary loaded exercise', () => {
    expect(isAssisted('bench-press')).toBe(false)
    expect(isAssisted('squat')).toBe(false)
  })

  it('is false for anything unknown or empty', () => {
    expect(isAssisted('')).toBe(false)
    expect(isAssisted(undefined as unknown as string)).toBe(false)
    expect(isAssisted('no-such-exercise')).toBe(false)
  })

  it('is true for a leverage machine whose name says assisted', () => {
    const row: CatalogueExercise = {
      ...bench,
      equipment: 'Leverage Machine',
      name: 'assisted pull-up',
      slug: 'assisted-pull-up',
    }
    expect(isAssisted(row)).toBe(true)
  })

  it('is false for an assisted NAME on other equipment — the trap', () => {
    // Twenty-nine catalogue entries say "assisted": partner-assisted stretches, a medicine-ball
    // twist, band leg curls. On those the weight is ordinary load, and inverting it would be the
    // same bug pointed the other way. Equipment is what separates the two.
    const row: CatalogueExercise = {
      ...bench,
      equipment: 'Medicine Ball',
      name: 'assisted Russian twist',
      slug: 'assisted-russian-twist',
    }
    expect(isAssisted(row)).toBe(false)
  })

  it('lets an explicit flag override the rule in either direction', () => {
    const custom = { ...bench, assisted: true, slug: 'custom-assisted' }
    expect(isAssisted(custom)).toBe(true)
    const forcedOff = { ...bench, assisted: false, slug: 'custom-not-assisted', name: 'assisted thing' }
    expect(isAssisted(forcedOff)).toBe(false)
  })

  it('reads an explicit flag on the routine config', () => {
    const withTarget = { ...bench, target: { assisted: true } } as CatalogueExercise
    expect(isAssisted(withTarget)).toBe(true)
  })
})

describe('assisted weight direction', () => {
  const assisted: CatalogueExercise = {
    ...bench,
    equipment: 'Leverage Machine',
    name: 'assisted pull-up',
    slug: 'assisted-pull-up',
  }

  it('takes the SMALLER load on assistance, because less help is harder', () => {
    expect(betterWeight(assisted, 40, 20)).toBe(20)
  })

  it('takes the LARGER load on an ordinary lift', () => {
    expect(betterWeight(bench, 40, 60)).toBe(60)
  })

  it('reads a record the same way', () => {
    expect(beatsWeight(assisted, 20, 40)).toBe(true)
    expect(beatsWeight(assisted, 40, 20)).toBe(false)
    expect(beatsWeight(bench, 60, 40)).toBe(true)
    expect(beatsWeight(bench, 20, 40)).toBe(false)
  })

  it('treats 0 as nothing logged yet rather than as the record', () => {
    expect(beatsWeight(bench, 60, 0)).toBe(true)
    expect(beatsWeight(assisted, 20, 0)).toBe(true)
    expect(beatsWeight(bench, 0, 40)).toBe(false)
  })
})

describe('equipmentOf / bodyPartsOf', () => {
  it('orders equipment by how common it is in the list it was given', () => {
    const eq = equipmentOf([bench, squat, bench])
    expect(eq[0]).toBe(bench.equipment) // appears twice
    expect(eq).toEqual([...eq].sort((a, b) => a.localeCompare(b)).sort(() => 0).sort(() => 0))
  })

  it('derives from the already-filtered list, so every option on screen has results', () => {
    const filtered = CATALOGUE.filter((e) => e.bodyPart === BODYPARTS[0])
    expect(equipmentOf(filtered).length).toBeGreaterThan(0)
    for (const eq of equipmentOf(filtered))
      expect(filtered.some((e) => e.equipment === eq)).toBe(true)
  })

  it('lists body parts present in the given list only', () => {
    expect(bodyPartsOf([bench, squat])).toEqual([...new Set([bench.bodyPart, squat.bodyPart])].sort())
    expect(bodyPartsOf([])).toEqual([])
  })
})

describe('normalizeStr', () => {
  it('lowercases and strips diacritics', () => {
    expect(normalizeStr('Elevação')).toBe('elevacao')
    expect(normalizeStr('Press de BANCA')).toBe('press de banca')
    expect(normalizeStr(null)).toBe('')
    expect(normalizeStr(undefined)).toBe('')
  })
})

describe('search', () => {
  it('finds an exercise by any of its searchable fields', () => {
    expect(matchesExerciseSearch(bench, 'bench')).toBe(true)
    expect(matchesExerciseSearch(bench, bench.primaryMuscle)).toBe(true)
    expect(matchesExerciseSearch(bench, bench.equipment)).toBe(true)
    expect(matchesExerciseSearch(bench, 'zzz-nothing')).toBe(false)
  })

  it('matches in Spanish as well as English', () => {
    const es = CATALOGUE.find((e) => e.name_es && e.name_es !== e.name)
    if (es) expect(matchesExerciseSearch(es, es.name_es)).toBe(true)
  })

  it('ignores diacritics and case in the query', () => {
    expect(matchesExerciseSearch(bench, 'BANCA')).toBe(matchesExerciseSearch(bench, 'banca'))
  })

  it('finds "press bench" for "Bench Press" — token order does not matter', () => {
    expect(matchesExerciseSearch(bench, 'press bench')).toBe(true)
    expect(matchesExerciseSearch(bench, 'bench press')).toBe(true)
  })

  it('requires every token to match something', () => {
    expect(matchesExerciseSearch(bench, 'bench zzz')).toBe(false)
  })

  it('treats an empty query as matching everything', () => {
    expect(searchScore(bench, '')).toBe(1)
    expect(matchesExerciseSearch(bench, '')).toBe(true)
  })

  it('survives junk input', () => {
    expect(matchesExerciseSearch(null, 'bench')).toBe(false)
    expect(matchesExerciseSearch(bench, null)).toBe(true)
    expect(matchesExerciseSearch(bench, '   ')).toBe(true)
    expect(searchScore(undefined, 'bench')).toBe(0)
  })
})

describe('typo tolerance', () => {
  it('allows one edit in a long word', () => {
    expect(nearWord('banch', 'bench')).toBe(true) // substituted
    expect(nearWord('bench', 'bench')).toBe(true) // identical
    // A different length means a missing or extra character, and only one of those is accepted
    // when the differing lengths line up: `benc`/`benchh` are one edit but not in the position
    // this allows. Verified against openGym's implementation, which behaves the same way.
    expect(nearWord('benchr', 'bench')).toBe(true) // extra, at the end
    expect(nearWord('benchr', 'bench')).toBe(true)
    expect(nearWord('benc', 'bench')).toBe(false) // missing, at the end
  })

  it('refuses short words, which are too common to fuzz', () => {
    // "row" and "curl" would drag in hundreds of unrelated exercises.
    expect(nearWord('rw', 'row')).toBe(false)
    expect(nearWord('cu', 'curl')).toBe(false)
  })

  it('refuses a word of a very different length', () => {
    expect(nearWord('bench', 'biceps')).toBe(false)
  })

  it('corrects a typo in a real query', () => {
    expect(matchesExerciseSearch(bench, 'benc press')).toBe(true)
  })

  it('does NOT fuzz a token that matched something exactly', () => {
    // Otherwise a correct "squat" would also pull in "squad" and, since callers keep catalogue
    // order, the stray would land ahead of the real hit.
    const list: CatalogueExercise[] = [
      { ...bench, slug: 'squad-press', name: 'squad press' },
      { ...squat, slug: 'squat' },
    ]
    const found = searchExercises(list, 'squat').map((e) => e.slug)
    expect(found).toContain('squat')
  })
})

describe('searchExercises', () => {
  it('returns everything for an empty query', () => {
    expect(searchExercises(CATALOGUE, '').length).toBe(CATALOGUE.length)
  })

  it('filters by body part, equipment and muscle together', () => {
    const byPart = searchExercises(CATALOGUE, '', { bodyPart: bench.bodyPart })
    expect(byPart.length).toBeGreaterThan(0)
    for (const e of byPart) expect(e.bodyPart).toBe(bench.bodyPart)

    const byMuscle = searchExercises(CATALOGUE, '', { muscle: bench.primaryMuscle })
    for (const e of byMuscle) expect(e.primaryMuscle).toBe(bench.primaryMuscle)
  })

  it('narrows as facets combine, never widens', () => {
    const part = searchExercises(CATALOGUE, '', { bodyPart: bench.bodyPart })
    const both = searchExercises(CATALOGUE, '', {
      bodyPart: bench.bodyPart,
      equipment: bench.equipment,
    })
    expect(both.length).toBeLessThanOrEqual(part.length)
    for (const e of both) {
      expect(e.bodyPart).toBe(bench.bodyPart)
      expect(e.equipment).toBe(bench.equipment)
    }
  })

  it('matches a single exercise through the same path', () => {
    expect(matchExercise(bench, 'bench')).toBe(true)
    expect(matchExercise(bench, '')).toBe(true)
    expect(matchExercise(null as unknown as CatalogueExercise, 'bench')).toBe(false)
  })
})

describe('rankExercises', () => {
  it('ranks the best-scoring hit first', () => {
    // Both match every token, so both are returned and the ordering is decided by the score.
    const exact = { ...bench, slug: 'exact', name: 'bench press' }
    const partial = { ...bench, slug: 'partial', name: 'bench press with bands' }
    const ranked = rankExercises([partial, exact], 'bench press')
    expect(ranked.map((e) => e.slug)).toEqual(['exact', 'partial'])
    expect(searchScore(exact, 'bench press')).toBeGreaterThan(searchScore(partial, 'bench press'))
  })

  it('prefers a shorter, more exact name over a longer one containing it', () => {
    // Upstream scores these identically, so a picker can only fall back on catalogue order and the
    // exact answer ends up buried under every longer variant of itself. Measured: both were 550
    // before the surplus penalty.
    const list = [
      { ...bench, slug: 'with-bands', name: 'bench press with bands' },
      { ...bench, slug: 'plain', name: 'bench press' },
    ]
    expect(rankExercises(list, 'bench press').map((e) => e.slug)).toEqual(['plain', 'with-bands'])
  })

  it('returns only the hits that match every token', () => {
    // A muscle match alone is not a hit: "bench press" against an exercise called "fly" matches
    // neither token, and a ranker that returned it would bury the real results.
    const fly = { ...bench, slug: 'fly', name: 'fly', primaryMuscle: 'Chest' }
    expect(rankExercises([fly], 'bench press')).toEqual([])
  })

  it('drops non-matches', () => {
    expect(rankExercises(CATALOGUE, 'zzz-nothing')).toEqual([])
  })

  it('keeps catalogue order between equally scored hits', () => {
    const list = [bench, squat].map((e, i) => ({ ...e, slug: `a${i}`, name: 'same name' }))
    expect(rankExercises(list, 'same').map((e) => e.slug)).toEqual(['a0', 'a1'])
  })
})

describe('custom exercises', () => {
  it('are merged into the index so every lookup keeps working', () => {
    const custom: CatalogueExercise = {
      slug: 'my-lift',
      name: 'My lift',
      bodyPart: 'chest',
      equipment: 'Barbell',
      primaryMuscle: 'Chest',
      secondaryMuscles: [],
      steps: [],
      artRef: null,
    }
    try {
      registerCustom([custom])
      expect(EXIDX['my-lift']).toBe(custom)
      expect(exOr('my-lift').name).toBe('My lift')
      expect(allExercises([custom])[0].slug).toBe('my-lift')
    } finally {
      registerCustom([])
    }
  })

  it('shadows a built-in while registered and restores it afterwards', () => {
    const shadow: CatalogueExercise = { ...bench, name: 'my version', slug: bench.slug }
    const builtIn = EXIDX[bench.slug]
    try {
      registerCustom([shadow])
      expect(EXIDX[bench.slug].name).toBe('my version')
    } finally {
      registerCustom([])
    }
    expect(EXIDX[bench.slug]).toBe(builtIn)
    expect(EXIDX[bench.slug].name).toBe(bench.name)
  })

  it('accepts an empty list without complaint', () => {
    expect(() => registerCustom([])).not.toThrow()
    expect(allExercises().length).toBe(CATALOGUE.length)
  })
})