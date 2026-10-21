import type { IDBPTransaction } from 'idb';
import { liftActive, liftPrefsBody, liftRoutine, liftWorkout } from '../model/lift';

interface V1Row { entity: string; id: string; payload: unknown }

const list = (p: unknown, entity: string): unknown[] => {
  if (p == null) return [];
  if (!Array.isArray(p)) throw new Error(`migrate: ${entity} payload is not an array`);
  return p;
};

/** v1 `records` blobs -> one row per record. Runs inside the versionchange tx; any throw must abort it. */
export async function migrateV1(tx: IDBPTransaction<unknown, string[], 'versionchange'>, now = new Date().toISOString()): Promise<void> {
  const rows = (await tx.objectStore('records').getAll()) as V1Row[];
  const meta = tx.objectStore('meta');
  for (const r of rows) {
    if (r.id !== 'local') continue;
    switch (r.entity) {
      case 'workout-session':
        for (const w of list(r.payload, r.entity)) await tx.objectStore('sessions').put(liftWorkout(w as never));
        break;
      case 'routine':
        for (const x of list(r.payload, r.entity)) await tx.objectStore('routines').put(liftRoutine(x as never, now));
        break;
      case 'active-session':
        if (r.payload) await meta.put({ key: 'active-session', rev: 1, value: liftActive(r.payload as never, now) });
        break;
      case 'preferences':
        if (r.payload) {
          await meta.put({ key: 'preferences', value: r.payload });
          for (const m of liftPrefsBody(r.payload as never, now)) await tx.objectStore('bodyMetrics').put(m);
        }
        break;
      case 'dietary-profile':
        if (r.payload) await meta.put({ key: 'dietary-profile', value: r.payload });
        break;
    }
  }
  await meta.put({ key: 'schema', value: { v: 2, migratedAt: now, from: 1 } });
}
