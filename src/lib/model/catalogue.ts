import { CATALOGUE, EXIDX, registerCustom as registerDomainCustom, searchExercises, type CatalogueExercise } from '../domain/catalogue';
import type { Mode, Ref } from './types';

const customs = new Map<string, CatalogueExercise>();

export const refOf = (slug: string): Ref => `wg:${slug}`;
export const slugOf = (ref: string): string => ref.slice(ref.indexOf(':') + 1);

/** Resolves a `wg:`/`custom:` ref. Customs are only found through `custom:`. */
export function exByRef(ref: string): CatalogueExercise | undefined {
  if (ref.startsWith('custom:')) return customs.get(slugOf(ref));
  if (!ref.startsWith('wg:')) return undefined;
  const slug = slugOf(ref);
  const e = EXIDX[slug];
  return e && !customs.has(slug) ? e : CATALOGUE.find((x) => x.slug === slug);
}

export function modeFromType(type: string | undefined): Mode {
  if (type === 'duration') return 'time';
  if (type === 'distance_duration') return 'cardio';
  return 'reps';
}
/** Always derived from exerciseType (domain isCardio is wrong for this dataset). */
export const modeOf = (ref: string): Mode => modeFromType(exByRef(ref)?.exerciseType);

/** Registers user exercises (slug = custom id) in the shared index. */
export function registerCustom(list: CatalogueExercise[]): void {
  customs.clear();
  for (const e of list) customs.set(e.slug, e);
  registerDomainCustom(list);
}

/** training.ts:19 filter semantics (muscleGroup, equipment, exerciseType) with domain fuzzy matching. */
export function search(query = '', muscle = '', equipment = '', type = ''): CatalogueExercise[] {
  const pool = [...customs.values(), ...CATALOGUE].filter((e) => (!muscle || e.muscleGroup === muscle) && (!equipment || e.equipment === equipment) && (!type || e.exerciseType === type));
  return searchExercises(pool, query);
}
