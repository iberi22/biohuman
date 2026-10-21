import { describe, expect, it } from 'vitest';
import { fromEngineEntry, fromEngineRoutine, fromEngineSet, fromEngineWorkout, toEngineEntry, toEngineHistory, toEngineRoutine, toEngineSet, toEngineWorkout } from './engine';
import type { LoggedSet, RoutineV2, TrainingSession } from './types';
import { registerCustom } from './catalogue';
import { liftRoutine } from './lift';
import { starterRoutines } from '../training';

const sides = { L: { weightKg: 20, reps: 8, done: true, rir: 2, rpe: 8, type: 'dropset' as const, drops: [{ weightKg: 15, reps: 9 }], clusters: [{ reps: 3, restS: 15 }] }, R: { weightKg: 18, reps: 7, done: false } };

describe('model/engine', () => {
  const sets: [LoggedSet, 'reps' | 'time' | 'cardio'][] = [
    [{ phase: 'work', done: true, weightKg: 60, reps: 8, rir: 2, rpe: 8, type: 'dropset', drops: [{ weightKg: 50, reps: 10 }] }, 'reps'],
    [{ phase: 'warmup', done: false, weightKg: 20, reps: 10, rir: null, rpe: null }, 'reps'],
    [{ phase: 'work', done: true, reps: 12, type: 'restpause', clusters: [{ reps: 4, restS: 15 }, { reps: 3, restS: 15 }] }, 'reps'],
    [{ phase: 'work', done: true, weightKg: 20, reps: 8, sides }, 'reps'],
    [{ phase: 'work', done: true, durationS: 45 }, 'time'],
    [{ phase: 'work', done: true, durationS: 1800, distanceM: 5000 }, 'cardio'],
  ];
  it.each(sets.map((s, i) => [i, ...s] as const))('set %i round-trips v2 -> engine -> v2', (_i, s, mode) => {
    expect(fromEngineSet(toEngineSet(s, mode), mode)).toEqual(s);
  });
  it('maps every WorkoutSet field', () => {
    const e = toEngineSet(sets[0][0], 'reps');
    expect(e).toMatchObject({ w: 60, r: 8, rir: 2, rpe: 8, phase: 'work', type: 'dropset', drops: [{ w: 50, r: 10 }], done: true });
    expect(toEngineSet(sets[2][0], 'reps').clusters).toEqual([{ r: 4, restSec: 15 }, { r: 3, restSec: 15 }]);
    expect(toEngineSet(sets[3][0], 'reps').sides?.L).toMatchObject({ w: 20, r: 8, done: true, drops: [{ w: 15, r: 9 }], clusters: [{ r: 3, restSec: 15 }] });
    expect(toEngineSet(sets[4][0], 'time').sec).toBe(45);
    expect(toEngineSet(sets[5][0], 'cardio')).toMatchObject({ min: 30, speed: 10 });
  });
  it('engine -> v2 -> engine keeps every field', () => {
    const s = { w: 60, r: 8, rir: 2, rpe: 8, phase: 'work', type: 'dropset', drops: [{ w: 50, r: 10 }], clusters: [{ r: 3, restSec: 10 }], done: true };
    expect(toEngineSet(fromEngineSet(s, 'reps'), 'reps')).toEqual(s);
    const sd = { w: 20, r: 8, phase: 'work', done: true, sides: toEngineSet(sets[3][0], 'reps').sides };
    expect(toEngineSet(fromEngineSet(sd, 'reps'), 'reps')).toEqual(sd);
    const t = { sec: 45, done: true, phase: 'work' };
    expect(toEngineSet(fromEngineSet(t, 'time'), 'time')).toEqual(t);
    const c = { min: 20, speed: 12, done: true, phase: 'warmup' };
    expect(toEngineSet(fromEngineSet(c, 'cardio'), 'cardio')).toEqual(c);
  });
  it('routine round trip keeps item fields and uses slug ids', () => {
    const r: RoutineV2 = { ...liftRoutine(starterRoutines[1], 'u'), };
    r.items[0] = { ...r.items[0], repsMin: 6, inc: 2.5, prog: 'linear', warmupSets: 2, side: true, groupId: 'g1', deloadFactor: 0.9, mode: 'reps' };
    const e = toEngineRoutine(r);
    expect(e.ex[0]).toMatchObject({ id: 'bench-press', repsMin: 6, inc: 2.5, prog: 'linear', warmupSets: 2, side: true, unit: 'kg', mode: 'reps' });
    expect(fromEngineRoutine(e, 'u')).toEqual({ ...r, items: r.items.map((i) => ({ ...i, mode: i.mode ?? expect.any(String) })) });
  });
  it('session -> engine workout -> session; explicit mode for cardio exercises', () => {
    const s: TrainingSession = { v: 2, id: 'i', subject: 's', startedAt: '2026-03-04T10:00:00Z', endedAt: '2026-03-04T11:00:00Z', routineId: 'r', createdAt: 'c', updatedAt: 'c',
      blocks: [{ ref: 'wg:bench-press', mode: 'reps', groupId: 'g', note: 'n', sets: [sets[0][0]] }, { ref: 'wg:plank', mode: 'time', sets: [sets[4][0]] }] };
    const w = toEngineWorkout(s);
    expect(w).toMatchObject({ d: '2026-03-04', start: Date.parse(s.startedAt), routineId: 'r' });
    expect(w.entries![1].target).toMatchObject({ mode: 'time', unit: 'kg' });
    expect(fromEngineWorkout(w, s)).toEqual(s);
    expect(fromEngineEntry(toEngineEntry(s.blocks[0]))).toEqual(s.blocks[0]);
    expect(toEngineHistory([s], []).unit).toBe('kg');
  });
  it('custom ref round-trips as custom:<id> and keeps mode', () => {
    registerCustom([{ slug: 'ABC', name: 'Mi', bodyPart: 'core', equipment: 'None', primaryMuscle: 'Abs', secondaryMuscles: [], steps: [], artRef: null, exerciseType: 'duration' }]);
    try {
      const b = { ref: 'custom:ABC' as const, mode: 'time' as const, sets: [{ phase: 'work' as const, done: true, durationS: 30 }] };
      expect(fromEngineEntry(toEngineEntry(b)).ref).toBe('custom:ABC');
      const e = toEngineEntry(b); delete e.ref;
      expect(fromEngineEntry(e).ref).toBe('custom:ABC');
      const item = { ref: 'custom:ABC' as const, sets: 1, reps: 0, weightKg: 0, durationS: 30, distanceM: 0, restS: 0 };
      expect(fromEngineRoutine(toEngineRoutine({ v: 2, id: 'r', name: 'n', items: [item], updatedAt: 'u' }), 'u').items[0].ref).toBe('custom:ABC');
    } finally { registerCustom([]); }
  });
  it('keeps protocol, planned, unknown, hrAvg and at through the engine', () => {
    const planned = { ref: 'wg:bench-press' as const, sets: 3, reps: 5, weightKg: 50, durationS: 0, distanceM: 0, restS: 60 };
    const protocol = { kind: 'emom' as const, workS: 40, restS: 20, rounds: 5, capS: 300, roundsDone: 2 };
    const s: TrainingSession = { v: 2, id: 'i', subject: 's', startedAt: '2026-03-04T10:00:00Z', endedAt: '2026-03-04T11:00:00Z', createdAt: 'c', updatedAt: 'c',
      blocks: [{ ref: 'wg:bench-press', mode: 'reps', planned, protocol, unknown: true, sets: [{ phase: 'work', done: true, reps: 5, weightKg: 50, hrAvg: 140, at: 1700000000 }] }] };
    expect(fromEngineWorkout(toEngineWorkout(s), s)).toEqual(s);
  });
});
