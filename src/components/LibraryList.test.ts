import { describe, it, expect } from 'vitest';
import { mount } from 'svelte';
import LibraryList from './LibraryList.svelte';
import type { CatalogueExercise } from '../lib/domain/catalogue';

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

describe('LibraryList', () => {
  it('renders all exercises when query is empty', () => {
    const target = document.createElement('div');
    mount(LibraryList, {
      target,
      props: { catalogue: fixtures }
    });

    expect(target.textContent).toContain('3 result');
    expect(target.textContent).toContain('Push Up');
    expect(target.textContent).toContain('Squat');
    expect(target.textContent).toContain('Pull Up');
  });

  it('filters exercises by name', () => {
    const target = document.createElement('div');
    mount(LibraryList, {
      target,
      props: { catalogue: fixtures, initialQuery: 'squat' }
    });

    expect(target.textContent).toContain('1 result');
    expect(target.textContent).toContain('Squat');
    expect(target.textContent).not.toContain('Push Up');
  });

  it('filters exercises by equipment', () => {
    const target = document.createElement('div');
    mount(LibraryList, {
      target,
      props: { catalogue: fixtures, initialEquipment: 'Pull-up Bar' }
    });

    expect(target.textContent).toContain('1 result');
    expect(target.textContent).toContain('Pull Up');
    expect(target.textContent).not.toContain('Squat');
  });

  it('renders empty state correctly', () => {
    const target = document.createElement('div');
    mount(LibraryList, {
      target,
      props: { catalogue: fixtures, initialQuery: 'unicorn' }
    });

    expect(target.textContent).toContain('0 result');
    expect(target.textContent).toContain('No results. Try another term or clear filters.');
  });
});
