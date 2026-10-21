import { afterEach, describe, expect, it } from 'vitest';
import exercises from '../../data/exercises.json';
import { exByRef, modeOf, refOf, registerCustom, search, slugOf } from './catalogue';
import { searchExercises as legacySearch } from '../training';

describe('model/catalogue', () => {
  afterEach(() => registerCustom([]));
  it('modeOf is right for all 302 exercises', () => {
    expect(exercises).toHaveLength(302);
    const counts: Record<string, number> = {}, modes: Record<string, number> = {};
    for (const e of exercises as { id: string; exerciseType: string }[]) {
      counts[e.exerciseType] = (counts[e.exerciseType] ?? 0) + 1;
      const m = modeOf(e.id);
      modes[m] = (modes[m] ?? 0) + 1;
      expect(m).toBe(e.exerciseType === 'duration' ? 'time' : e.exerciseType === 'distance_duration' ? 'cardio' : 'reps');
    }
    expect(counts).toEqual({ weight_reps: 136, bodyweight_reps: 114, assisted_bodyweight: 3, duration: 39, distance_duration: 10 });
    expect(modes.cardio).toBe(10);
  });
  it('ref/slug round trip and lookup', () => {
    expect(refOf('bench-press')).toBe('wg:bench-press');
    expect(slugOf('wg:bench-press')).toBe('bench-press');
    expect(exByRef('wg:bench-press')?.name).toBe('Bench Press');
    expect(exByRef('wg:nope')).toBeUndefined();
  });
  it('search keeps training.ts filter semantics', () => {
    expect(search('', 'chest').every((e) => e.muscleGroup === 'chest')).toBe(true);
    expect(search('', '', '', 'duration')).toHaveLength(39);
    const ids = (l: Record<string, unknown>[]) => l.map((e) => e.id).sort();
    expect(ids(search('bench press'))).toEqual(expect.arrayContaining(ids(legacySearch('bench press')).slice(0, 1)));
    expect(search('press de banca').length).toBeGreaterThan(0);
  });
  it('custom exercises resolve via custom: refs', () => {
    registerCustom([{ slug: 'ABC', name: 'Mi ejercicio', bodyPart: 'core', equipment: 'None', primaryMuscle: 'Abs', secondaryMuscles: [], steps: [], artRef: null, exerciseType: 'duration' }]);
    expect(exByRef('custom:ABC')?.name).toBe('Mi ejercicio');
    expect(modeOf('custom:ABC')).toBe('time');
    expect(search('mi ejercicio')).toHaveLength(1);
    registerCustom([]);
    expect(exByRef('custom:ABC')).toBeUndefined();
  });
});
