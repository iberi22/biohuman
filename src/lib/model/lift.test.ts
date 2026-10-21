import { describe, expect, it } from 'vitest';
import { liftActive, liftPrefsBody, liftRoutine, liftWorkout } from './lift';
import { starterRoutines, type ActiveSession, type Workout } from '../training';

const w: Workout = { schema: 'swal.health/v1/workout-session', id: 'a', subject: 's', createdAt: '2026-01-01T00:00:00Z', source: { app: 'training', version: '0.1.0' },
  gosDataset: `0.0.0+sha256:${'0'.repeat(64)}`, data: { startedAt: '2026-01-01T00:00:00Z', endedAt: '2026-01-01T01:00:00Z', routineId: 'r',
    exercises: [{ ref: 'wg:bench-press', sets: [{ reps: 5, weightKg: 50, rpe: 8 }] }, { ref: 'wg:plank', sets: [{ durationS: 30 }] }, { ref: 'wg:zzz-unknown', sets: [{ reps: 3 }] }] } };

describe('model/lift', () => {
  it('lifts sets as done work sets and blocks with catalogue mode', () => {
    const s = liftWorkout(w);
    expect(s.v).toBe(2);
    expect(s.blocks[0].sets[0]).toEqual({ reps: 5, weightKg: 50, rpe: 8, phase: 'work', done: true });
    expect(s.blocks.map((b) => b.mode)).toEqual(['reps', 'time', 'reps']);
  });
  it('keeps unknown refs, flagged', () => {
    const b = liftWorkout(w).blocks[2];
    expect(b.ref).toBe('wg:zzz-unknown');
    expect(b.unknown).toBe(true);
    expect(b.sets).toHaveLength(1);
  });
  it('is idempotent', () => {
    const s = liftWorkout(w);
    expect(liftWorkout(s)).toEqual(s);
    const r = liftRoutine(starterRoutines[0], 'now');
    expect(liftRoutine(r, 'later')).toEqual(r);
  });
  it('routine keeps every Target field', () => {
    const r = liftRoutine(starterRoutines[1], 'now');
    expect(r.items).toEqual(starterRoutines[1].exercises);
    expect(r.updatedAt).toBe('now');
  });
  it('active session keeps index and restUntil', () => {
    const a: ActiveSession = { id: 'x', routine: starterRoutines[0], startedAt: 't', index: 2, exercises: [{ ref: 'wg:plank', sets: [{ durationS: 5 }] }], restUntil: 1234, bodyKg: 70 };
    const l = liftActive(a, 'now');
    expect(l).toMatchObject({ v: 2, index: 2, restUntil: 1234, bodyKg: 70 });
    expect(l.blocks[0].sets[0].done).toBe(true);
    expect(liftActive(l)).toBe(l);
  });
  it('prefs.bodyKg seeds one weight metric', () => {
    expect(liftPrefsBody({ bodyKg: 72 }, 'n')).toEqual([{ id: 'weight-n', at: 'n', kind: 'weight', value: 72 }]);
  });
});
