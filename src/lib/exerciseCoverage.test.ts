import { existsSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

interface CatalogueEntry {
  id: string;
  slug: string;
  name_es?: unknown;
  muscleGroup?: unknown;
}

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, '..', '..');
const catalogue = JSON.parse(
  readFileSync(resolve(repoRoot, 'src/data/exercises.json'), 'utf8'),
) as CatalogueEntry[];

const EXPECTED_EXERCISE_COUNT = 302;
const FRAME_FILES = [1, 2, 3].map((n) => `frame-${n}.svg`);

const isFilled = (value: unknown): value is string =>
  typeof value === 'string' && value.trim().length > 0;

describe('exercise catalogue coverage', () => {
  it('contains exactly 302 exercises', () => {
    expect(catalogue).toHaveLength(EXPECTED_EXERCISE_COUNT);
  });

  it('has unique ids', () => {
    const ids = catalogue.map((entry) => entry.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('has unique slugs', () => {
    const slugs = catalogue.map((entry) => entry.slug);
    expect(new Set(slugs).size).toBe(slugs.length);
  });

  it('gives every exercise a non-empty Spanish name', () => {
    const missing = catalogue.filter((entry) => !isFilled(entry.name_es)).map((e) => e.id);
    expect(missing).toEqual([]);
  });

  it('gives every exercise a non-empty muscleGroup', () => {
    const missing = catalogue.filter((entry) => !isFilled(entry.muscleGroup)).map((e) => e.id);
    expect(missing).toEqual([]);
  });

  it('ships frame-1..3 SVG illustrations for every slug', () => {
    const missing = catalogue.flatMap((entry) =>
      FRAME_FILES.map((file) => `${entry.slug}/${file}`).filter(
        (rel) => !existsSync(resolve(repoRoot, 'public/exercises', rel)),
      ),
    );
    expect(missing).toEqual([]);
  });
});
