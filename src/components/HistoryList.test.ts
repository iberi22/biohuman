import { describe, expect, it, vi } from 'vitest';
import { compile } from 'svelte/compiler';
import { entriesForExercise, type Workout as HistoryWorkout } from '../lib/domain/history';
import { kgToDisplay, sessionVolume, type Workout } from '../lib/training';
import historyListSource from './HistoryList.svelte?raw';
import historialSource from '../pages/historial.astro?raw';

// NOTE: this repo's vitest setup has no Svelte transform and no
// @testing-library/svelte (adding either would break the 3-file island
// budget), so the component cannot be mounted here. These tests instead
// verify the real compile output, the template contract (copy, CTA, button
// wiring, props-in/events-out), the domain grouping, and the real display
// helpers against domain-typed fixtures.

// Two-exercise session built from the training-layer domain types.
const session: Workout = {
  schema: 'swal.health/v1/workout-session',
  id: 's1',
  subject: 'subj',
  createdAt: '2026-01-01T10:00:00Z',
  source: { app: 'training', version: '1' },
  gosDataset: 'none',
  data: {
    startedAt: '2026-01-01T10:00:00Z',
    endedAt: '2026-01-01T11:00:00Z',
    exercises: [
      { ref: 'wg:squat', sets: [{ weightKg: 100, reps: 5 }] },
      {
        ref: 'wg:bench',
        sets: [
          { weightKg: 60, reps: 8 },
          { weightKg: 60, reps: 8 },
        ],
      },
    ],
    energy: { kcal: 300, method: 'met-estimate' },
  },
};

describe('HistoryList component contract', () => {
  it('compiles as a Svelte 5 client component with its copy intact', () => {
    const out = compile(historyListSource, { generate: 'client' });
    expect(out.js.code).toContain('Every beginning counts.');
    expect(out.js.code).toContain('/rutinas');
    expect(out.js.code).toContain('Export session');
    expect(out.js.code).toContain('Send to OrionHealth');
  });

  it('renders the empty state with a CTA link to /rutinas', () => {
    expect(historyListSource).toContain('Cada comienzo cuenta.');
    expect(historyListSource).toContain('href="/rutinas"');
    expect(historyListSource).toContain('Empezar una rutina');
  });

  it('renders per-session cards with set count, volume and per-exercise lines', () => {
    expect(historyListSource).toContain('entriesForExercise');
    expect(historyListSource).toContain('Exportar sesión');
    expect(historyListSource).toContain('Enviar a OrionHealth');
    expect(historyListSource).toContain('sessionVolume');
    expect(historyListSource).toContain('s.data.energy.kcal');
  });

  it('wires the Export and OrionHealth buttons to callback props with the session payload', () => {
    // Template wiring asserted on the source; payload identity on the contract.
    expect(historyListSource).toContain('onexport([s])');
    expect(historyListSource).toContain('onorion([s])');
    const onexport = vi.fn();
    const onorion = vi.fn();
    onexport([session]);
    onorion([session]);
    expect(onexport).toHaveBeenCalledWith([session]);
    expect(onorion).toHaveBeenCalledWith([session]);
  });

  it('keeps storage and navigation out of the component (props in, events out)', () => {
    for (const token of [
      'repository',
      'localStorage',
      'saveLocal',
      'readLocal',
      'TabBar',
      'AppShell',
      'menuLabel',
    ]) {
      expect(historyListSource).not.toContain(token);
    }
    expect(historyListSource).toContain("from '../lib/domain/history'");
  });
});

describe('history domain grouping', () => {
  const historyWorkout: HistoryWorkout = {
    entries: [
      { id: 'wg:squat', sets: [{ weightKg: 100, reps: 5 }] },
      { id: 'wg:bench', sets: [{ weightKg: 60, reps: 8 }] },
      { id: 'wg:bench', sets: [{ weightKg: 60, reps: 8 }] },
    ],
  };

  it('groups saved occurrences per exercise in stored order', () => {
    expect(entriesForExercise(historyWorkout, 'wg:squat')).toHaveLength(1);
    const bench = entriesForExercise(historyWorkout, 'wg:bench');
    expect(bench).toHaveLength(2);
    expect(bench[0]).toBe(historyWorkout.entries?.[1]);
  });

  it('returns no entries for unknown or blank exercise ids', () => {
    expect(entriesForExercise(historyWorkout, 'wg:unknown')).toEqual([]);
    expect(entriesForExercise(historyWorkout, '')).toEqual([]);
    expect(entriesForExercise(undefined, 'wg:squat')).toEqual([]);
  });
});

describe('session display helpers from the training layer', () => {
  it('computes session volume from the two-exercise fixture', () => {
    expect(sessionVolume(session)).toBe(100 * 5 + 60 * 8 + 60 * 8);
  });

  it('formats weight display units without reimplementing conversion', () => {
    expect(kgToDisplay(100, 'kg')).toBe(100);
    expect(kgToDisplay(100, 'lb')).toBeCloseTo(220.462, 2);
    expect(session.data.energy?.kcal).toBe(300);
  });
});

describe('historial page wiring', () => {
  // The standalone `mount(HistoryList)` page this block used to assert shipped
  // three defects, all of them visible in `pnpm test:e2e`:
  //   1. it never called `initializeLocalStorage()`, so `readLocal` hit an
  //      uninitialised adapter and /historial always rendered the empty state
  //      ("Cada comienzo cuenta.") even with saved sessions;
  //   2. it dropped `AppShell`, so /historial had no navigation at all;
  //   3. it dropped the OrionHealth deep-link panel, so the generated
  //      `orionhealth://import?p=...` URI was never shown.
  // The route now goes through `TrainingApp page="history"`, which owns the
  // shell, the storage initialisation and that panel. `HistoryList` stays in
  // the tree, still unwired, with its component-contract tests above.
  it('renders the history route through TrainingApp without a second navigation system', () => {
    expect(historialSource).toContain('TrainingApp');
    expect(historialSource).toContain('page="history"');
    expect(historialSource).toContain('Layout');
    expect(historialSource).toContain('prerender');
    for (const token of ['TabBar', 'readLocal', 'HistoryList']) {
      expect(historialSource).not.toContain(token);
    }
  });
});
