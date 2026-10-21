import { openDB, type IDBPDatabase } from 'idb';
import { migrateV1 } from './migrate';

export const DB_NAME = 'biohuman-v1';
export const DB_VERSION = 2;
export type BioDB = IDBPDatabase<unknown>;
export interface OpenHooks { onBlocked?: () => void; onBlocking?: () => void }

let cached: Promise<BioDB> | null = null;

/** The one and only openDB call. Aborted/failed opens are not cached. */
export function openBio(hooks: OpenHooks = {}): Promise<BioDB> {
  if (cached) return cached;
  const p = openDB(DB_NAME, DB_VERSION, {
    upgrade(db, old, _new, tx) {
      if (old < 1) db.createObjectStore('records', { keyPath: ['entity', 'id'] });
      db.createObjectStore('sessions', { keyPath: 'id' }).createIndex('startedAt', 'startedAt');
      db.createObjectStore('routines', { keyPath: 'id' });
      db.createObjectStore('programs', { keyPath: 'id' });
      db.createObjectStore('bodyMetrics', { keyPath: 'id' }).createIndex('at', 'at');
      db.createObjectStore('assessments', { keyPath: 'id' });
      db.createObjectStore('customExercises', { keyPath: 'id' });
      db.createObjectStore('meta', { keyPath: 'key' });
      if (old === 1) {
        // idb does not await upgrade(): abort explicitly so a throw leaves the DB at v1.
        tx.done.catch(() => {});
        migrateV1(tx).catch((err) => { console.error("biohuman migration failed", err); try { tx.abort(); } catch { /* already finished */ } });
      }
    },
    blocked() { hooks.onBlocked?.(); },
    blocking() {
      void p.then((d) => d.close()).catch(() => {});
      cached = null;
      if (hooks.onBlocking) hooks.onBlocking();
      else if (typeof location !== 'undefined') location.reload();
    },
    terminated() { cached = null; },
  });
  cached = p;
  p.catch(() => { if (cached === p) cached = null; });
  return p;
}

export async function closeBio(): Promise<void> {
  const p = cached;
  cached = null;
  if (p) (await p.catch(() => null))?.close();
}
