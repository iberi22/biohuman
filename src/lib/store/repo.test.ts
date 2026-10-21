import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import { closeBio, DB_NAME, openBio } from './db';
import { finishWorkout, getActive, listSessions, putSession, StaleRevError, startActive, updateActive } from './repo';

const sess = (id: string, startedAt = '2025-01-01T00:00:00.000Z') =>
  ({ v: 2, id, subject: 's', startedAt, endedAt: startedAt, blocks: [], createdAt: startedAt, updatedAt: startedAt }) as never;
const active = (id = 'a') => ({ v: 2, id, routine: { v: 2, id: 'r', name: 'R', items: [], updatedAt: 'x' }, startedAt: 'x', index: 0, blocks: [], restUntil: 0, bodyKg: 80 }) as never;

beforeEach(async () => { await closeBio(); indexedDB.deleteDatabase(DB_NAME); });

describe('repo', () => {
  it('two concurrent putSession calls both survive', async () => {
    await Promise.all([putSession(sess('a')), putSession(sess('b', '2025-02-01T00:00:00.000Z'))]);
    expect((await listSessions()).map((s) => s.id)).toEqual(['b', 'a']);
  });

  it('rejects a stale rev and accepts the current one', async () => {
    await startActive(active());
    const first = (await getActive())!;
    await updateActive(first.rev, (a) => ({ ...a, index: 1 }));
    await expect(updateActive(first.rev, (a) => ({ ...a, index: 2 }))).rejects.toThrow(StaleRevError);
    await expect(updateActive(first.rev, (a) => a)).rejects.toThrow('sesion cambiada en otra pestana');
    const cur = (await getActive())!;
    expect(cur.value.index).toBe(1);
    expect(cur.rev).toBe(first.rev + 1);
  });

  it('finishWorkout puts the session and deletes active in one tx', async () => {
    await startActive(active());
    await finishWorkout(sess('done'));
    expect((await listSessions()).map((s) => s.id)).toEqual(['done']);
    expect(await getActive()).toBeNull();
  });

  it('finishWorkout is atomic: a failing put rolls back the active delete', async () => {
    await startActive(active());
    const bad = { ...(sess('bad') as object), fn: () => 1 } as never;
    await expect(finishWorkout(bad)).rejects.toBeTruthy();
    expect(await getActive()).not.toBeNull();
    expect(await listSessions()).toEqual([]);
    expect((await openBio()).version).toBe(2);
  });
});
