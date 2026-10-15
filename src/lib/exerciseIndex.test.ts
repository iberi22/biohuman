import { describe, it, expect } from 'vitest';
import { filterExercises } from './exerciseIndex';

describe('exerciseIndex', () => {
  it('should return all indices when query is empty', () => {
    const items = ['uno', 'dos', 'tres'];
    expect(filterExercises(items, '')).toEqual([0, 1, 2]);
    expect(filterExercises(items, '   ')).toEqual([0, 1, 2]);
  });

  it('should filter items case-insensitively', () => {
    const items = ['Press de banca', 'Sentadilla', 'Dominada'];
    expect(filterExercises(items, 'press')).toEqual([0]);
    expect(filterExercises(items, 'SENTADILLA')).toEqual([1]);
    expect(filterExercises(items, 'dominada')).toEqual([2]);
  });

  it('should filter items accent-insensitively', () => {
    const items = ['Extensión de tríceps', 'Glúteos', 'Cajón'];
    expect(filterExercises(items, 'triceps')).toEqual([0]);
    expect(filterExercises(items, 'gluteos')).toEqual([1]);
    expect(filterExercises(items, 'cajon')).toEqual([2]);
  });

  it('should return empty array if no match is found', () => {
    const items = ['Press', 'Sentadilla'];
    expect(filterExercises(items, 'dominada')).toEqual([]);
  });
});
