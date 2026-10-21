import { describe, expect, it } from 'vitest';
import { fromContract, toContract, toContractAll } from './contract';
import { validateWorkout, type Workout } from '../training';
import type { LoggedSet, TrainingSession } from './types';

const files = import.meta.glob('../../../vendor/health-contract/schemas/v1/fixtures/valid/workout-session-*.json', { eager: true, import: 'default' }) as Record<string, Workout>;
const fixtures: Workout[] = Object.values(files);

const session = (sets: LoggedSet[], ref: `wg:${string}` | `custom:${string}` = 'wg:bench-press'): TrainingSession => ({ v: 2, id: '01J00000000000000000000000', subject: 'subj_01J00000000000000000000000', startedAt: '2026-01-01T00:00:00Z', endedAt: '2026-01-01T01:00:00Z',
  blocks: [{ ref, mode: 'reps', sets }], createdAt: '2026-01-01T01:00:00Z', updatedAt: '2026-01-01T01:00:00Z' });
const W = (o: Partial<LoggedSet>): LoggedSet => ({ phase: 'work', done: true, ...o });
const out = (s: TrainingSession) => toContract(s)!.data.exercises[0].sets;

describe('model/contract', () => {
  it('has workout fixtures', () => expect(fixtures.length).toBeGreaterThanOrEqual(3));
  it.each(fixtures.map((f) => [f.id, f] as const))('lift then project is identity (%s)', (_id, f) => {
    const p = toContract(fromContract(f))!;
    expect(p).toEqual(f);
    expect(() => validateWorkout(p)).not.toThrow();
  });
  it('emits only done work sets', () => {
    expect(out(session([W({ reps: 5, phase: 'warmup' }), W({ reps: 6, done: false }), W({ reps: 7 })]))).toEqual([{ reps: 7 }]);
  });
  it('rir -> rpe = clamp(10-rir) when rpe absent', () => {
    expect(out(session([W({ reps: 5, rir: 2 }), W({ reps: 5, rir: 12 }), W({ reps: 5, rir: 2, rpe: 9 })]))).toEqual([{ reps: 5, rpe: 8 }, { reps: 5, rpe: 0 }, { reps: 5, rpe: 9 }]);
  });
  it('drops become extra sets', () => {
    expect(out(session([W({ reps: 5, weightKg: 100, drops: [{ weightKg: 80, reps: 6 }, { weightKg: 60, reps: 8 }] })]))).toEqual([{ reps: 5, weightKg: 100 }, { reps: 6, weightKg: 80 }, { reps: 8, weightKg: 60 }]);
  });
  it('sides become L then R sets', () => {
    const sides = { R: { weightKg: 10, reps: 9, done: true }, L: { weightKg: 12, reps: 8, done: true } };
    expect(out(session([W({ reps: 8, weightKg: 12, sides })]))).toEqual([{ reps: 8, weightKg: 12 }, { reps: 9, weightKg: 10 }]);
  });
  it('skips empty sets, custom blocks and empty sessions', () => {
    expect(out(session([W({ weightKg: 40 }), W({ reps: 3 })]))).toEqual([{ reps: 3 }]);
    expect(toContract(session([W({ reps: 3 })], 'custom:X'))).toBeNull();
    const r = toContractAll([session([W({ reps: 3 })]), session([W({ reps: 3 })], 'custom:X'), session([])]);
    expect(r.records).toHaveLength(1);
    expect(r.skipped).toBe(2);
    r.records.forEach((x) => expect(() => validateWorkout(x)).not.toThrow());
  });
  it('recomputes met energy when bodyKg is given', () => {
    const rec = toContract(session([W({ reps: 3 })]), { bodyKg: 80 })!;
    expect(rec.data.energy).toEqual({ kcal: Math.round((3.5 * 3.5 * 80) / 200 * 60), method: 'met-estimate' });
  });
});
