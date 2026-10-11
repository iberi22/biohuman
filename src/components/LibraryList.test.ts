import { describe, it, expect } from 'vitest';
import { searchExercises, equipmentOf, type CatalogueExercise } from '../lib/domain/catalogue';

const fixtures: CatalogueExercise[] = [
  {
    slug: 'push-up',
    name: 'Push Up',
    name_es: 'Flexión',
    bodyPart: 'chest',
    equipment: 'Bodyweight',
    primaryMuscle: 'chest',
    secondaryMuscles: ['triceps'],
    steps: [],
    artRef: 'push-up',
    exerciseType: 'bodyweight_reps',
    muscleGroup: 'chest',
  },
  {
    slug: 'squat',
    name: 'Squat',
    name_es: 'Sentadilla',
    bodyPart: 'legs',
    equipment: 'Barbell',
    primaryMuscle: 'quads',
    secondaryMuscles: ['glutes'],
    steps: [],
    artRef: 'squat',
    exerciseType: 'weight_reps',
    muscleGroup: 'legs',
  },
  {
    slug: 'pull-up',
    name: 'Pull Up',
    name_es: 'Dominada',
    bodyPart: 'back',
    equipment: 'Pull-up Bar',
    primaryMuscle: 'lats',
    secondaryMuscles: ['biceps'],
    steps: [],
    artRef: 'pull-up',
    exerciseType: 'bodyweight_reps',
    muscleGroup: 'back',
  }
];

describe('LibraryList Logic Delegation', () => {
  it('renders all exercises when query is empty (passthrough)', () => {
    const filtered = searchExercises(fixtures, '', { muscle: '', equipment: '' });
    expect(filtered.length).toBe(3);
    expect(filtered.map(e => e.slug)).toEqual(['push-up', 'squat', 'pull-up']);
  });

  it('filters exercises by name', () => {
    const filtered = searchExercises(fixtures, 'squat', { muscle: '', equipment: '' });
    expect(filtered.length).toBe(1);
    expect(filtered[0].slug).toBe('squat');
  });

  it('filters exercises by equipment facet', () => {
    const filtered = searchExercises(fixtures, '', { muscle: '', equipment: 'Pull-up Bar' });
    expect(filtered.length).toBe(1);
    expect(filtered[0].slug).toBe('pull-up');

    // Test the equipment extraction helper
    const equipment = equipmentOf(fixtures);
    expect(equipment).toEqual(['Barbell', 'Bodyweight', 'Pull-up Bar']);
  });

  it('filters exercises by bodyPart/muscle facet', () => {
    const filtered = searchExercises(fixtures, '', { muscle: 'chest', equipment: '' });
    expect(filtered.length).toBe(1);
    expect(filtered[0].slug).toBe('push-up');
  });

  it('renders empty results when query does not match anything', () => {
    const filtered = searchExercises(fixtures, 'unicorn', { muscle: '', equipment: '' });
    expect(filtered.length).toBe(0);
  });
});
