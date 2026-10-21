import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import { closeBio, DB_NAME, openBio } from './db';

beforeEach(async () => { await closeBio(); indexedDB.deleteDatabase(DB_NAME); });

describe('openBio', () => {
  it('creates a fresh v2 DB with one store per entity plus records', async () => {
    const db = await openBio();
    expect(db.version).toBe(2);
    expect(Array.from(db.objectStoreNames).sort()).toEqual(['assessments', 'bodyMetrics', 'customExercises', 'meta', 'programs', 'records', 'routines', 'sessions']);
    expect(db.transaction('sessions').store.indexNames.contains('startedAt')).toBe(true);
    expect(db.transaction('bodyMetrics').store.indexNames.contains('at')).toBe(true);
  });
  it('is a singleton per open', async () => {
    expect(await openBio()).toBe(await openBio());
  });
});
