import 'fake-indexeddb/auto';
import { openDB } from 'idb';
import { beforeEach, describe, expect, it } from 'vitest';
import { closeBio, DB_NAME, openBio } from './db';

const ex = (ref: string) => ({ ref, sets: [{ reps: 5, weightKg: 60 }] });
const workout = (n: number) => ({
  schema: 'swal.health/v1/workout-session', id: `w${n}`, subject: 's1', source: { app: 'bio' }, gosDataset: 'x',
  createdAt: `2025-01-0${n}T10:00:00.000Z`,
  data: { startedAt: `2025-01-0${n}T09:00:00.000Z`, endedAt: `2025-01-0${n}T10:00:00.000Z`, exercises: [ex('wg:squat')] },
});
const routine = (n: number) => ({ id: `r${n}`, name: `R${n}`, exercises: [{ ref: 'wg:squat', sets: 3, reps: 5, weightKg: 60, durationS: 0, distanceM: 0, restS: 90 }] });
const row = (entity: string, payload: unknown) => ({ entity, id: 'local', instance_id: 'default', created_at: 'x', updated_at: 'x', payload });

async function seedV1(workouts: unknown[]) {
  const db = await openDB(DB_NAME, 1, { upgrade(d) { d.createObjectStore('records', { keyPath: ['entity', 'id'] }); } });
  await db.put('records', row('workout-session', workouts));
  await db.put('records', row('routine', [routine(1), routine(2)]));
  await db.put('records', row('active-session', { id: 'a1', routine: routine(1), startedAt: 'z', index: 0, exercises: [ex('wg:squat')], restUntil: 0, bodyKg: 80 }));
  await db.put('records', row('preferences', { subject: 's1', bodyKg: 80, units: 'kg' }));
  db.close();
}

beforeEach(async () => { await closeBio(); indexedDB.deleteDatabase(DB_NAME); });

describe('v1 -> v2 migration', () => {
  it('migrates 1:1 and retains records', async () => {
    await seedV1([workout(1), workout(2), workout(3)]);
    const db = await openBio();
    expect(db.version).toBe(2);
    expect((await db.getAll('sessions')).map((s) => s.id).sort()).toEqual(['w1', 'w2', 'w3']);
    expect((await db.getAll('sessions'))[0].v).toBe(2);
    expect((await db.getAll('routines')).map((r) => r.id).sort()).toEqual(['r1', 'r2']);
    expect((await db.get('meta', 'active-session')).value.id).toBe('a1');
    expect((await db.get('meta', 'active-session')).rev).toBeGreaterThanOrEqual(1);
    expect((await db.get('meta', 'preferences')).value.subject).toBe('s1');
    expect((await db.getAll('bodyMetrics'))[0].value).toBe(80);
    expect(await db.get('meta', 'schema')).toMatchObject({ value: { v: 2, from: 1 } });
    expect(await db.count('records')).toBe(4);
  });

  it('a throwing lift aborts and leaves the DB at v1 with data intact', async () => {
    await seedV1([workout(1), { id: 'bad', data: null }]);
    await expect(openBio()).rejects.toBeTruthy();
    await closeBio();
    const db = await openDB(DB_NAME);
    expect(db.version).toBe(1);
    expect(Array.from(db.objectStoreNames)).toEqual(['records']);
    expect(await db.count('records')).toBe(4);
    db.close();
  });
});
