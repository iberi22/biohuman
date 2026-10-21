import type { ActiveSessionV2, BodyMetric, Program, RoutineV2, TrainingSession } from '../model/types';
import { openBio } from './db';

export class StaleRevError extends Error {
  constructor() { super('sesion cambiada en otra pestana'); this.name = 'StaleRevError'; }
}

export interface Entities {
  sessions: TrainingSession; routines: RoutineV2; programs: Program; bodyMetrics: BodyMetric;
  assessments: { id: string }; customExercises: { id: string };
}
export type StoreName = keyof Entities;
export interface Meta<T = unknown> { key: string; value: T; rev?: number }
export interface ChangeEvent { store: string; id: string }

const ACTIVE = 'active-session';
let channel: BroadcastChannel | null | undefined;
let persisted = false;

const chan = () => (channel ??= typeof BroadcastChannel === 'undefined' ? null : new BroadcastChannel('biohuman-db'));
const notify = (store: string, id: string) => { chan()?.postMessage({ store, id } satisfies ChangeEvent); };
function persistOnce() {
  if (persisted) return;
  persisted = true;
  try { void navigator.storage?.persist?.().catch(() => {}); } catch { /* unsupported */ }
}

export function onChange(cb: (e: ChangeEvent) => void): () => void {
  const c = chan();
  if (!c) return () => {};
  const h = (m: MessageEvent<ChangeEvent>) => cb(m.data);
  c.addEventListener('message', h);
  return () => c.removeEventListener('message', h);
}

export async function put<S extends StoreName>(store: S, value: Entities[S]): Promise<void> {
  const db = await openBio();
  await db.put(store, value);
  persistOnce();
  notify(store, value.id);
}
export async function get<S extends StoreName>(store: S, id: string): Promise<Entities[S] | undefined> {
  return (await openBio()).get(store, id);
}
export async function list<S extends StoreName>(store: S): Promise<Entities[S][]> {
  return (await openBio()).getAll(store);
}
export async function del(store: StoreName, id: string): Promise<void> {
  await (await openBio()).delete(store, id);
  notify(store, id);
}

export const putSession = (s: TrainingSession) => put('sessions', s);
export const getSession = (id: string) => get('sessions', id);
export const deleteSession = (id: string) => del('sessions', id);
/** Newest first. */
export async function listSessions(): Promise<TrainingSession[]> {
  return (await (await openBio()).getAllFromIndex('sessions', 'startedAt')).reverse();
}
export const putRoutine = (r: RoutineV2) => put('routines', r);
export const listRoutines = () => list('routines');
export const putBodyMetric = (m: BodyMetric) => put('bodyMetrics', m);
export const listBodyMetrics = async () => (await openBio()).getAllFromIndex('bodyMetrics', 'at') as Promise<BodyMetric[]>;

export async function getMeta<T = unknown>(key: string): Promise<T | undefined> {
  return ((await (await openBio()).get('meta', key)) as Meta<T> | undefined)?.value;
}
export async function setMeta(key: string, value: unknown): Promise<void> {
  await (await openBio()).put('meta', { key, value } satisfies Meta);
  persistOnce();
  notify('meta', key);
}

export async function getActive(): Promise<{ rev: number; value: ActiveSessionV2 } | null> {
  const m = (await (await openBio()).get('meta', ACTIVE)) as Meta<ActiveSessionV2> | undefined;
  return m ? { rev: m.rev ?? 0, value: m.value } : null;
}

export async function startActive(value: ActiveSessionV2): Promise<void> {
  const db = await openBio();
  const tx = db.transaction('meta', 'readwrite');
  if (await tx.store.get(ACTIVE)) { tx.abort(); await tx.done.catch(() => {}); throw new Error('Ya hay una sesion activa'); }
  await tx.store.put({ key: ACTIVE, rev: 1, value } satisfies Meta);
  await tx.done;
  persistOnce();
  notify('meta', ACTIVE);
}

/** Read-compare-put in one tx; rejects with StaleRevError when another tab already bumped rev. */
export async function updateActive(expectedRev: number, fn: (a: ActiveSessionV2) => ActiveSessionV2): Promise<number> {
  const db = await openBio();
  const tx = db.transaction('meta', 'readwrite');
  try {
    const cur = (await tx.store.get(ACTIVE)) as Meta<ActiveSessionV2> | undefined;
    if (!cur || (cur.rev ?? 0) !== expectedRev) throw new StaleRevError();
    const rev = expectedRev + 1;
    await tx.store.put({ key: ACTIVE, rev, value: fn(cur.value) } satisfies Meta);
    await tx.done;
    notify('meta', ACTIVE);
    return rev;
  } catch (e) {
    try { tx.abort(); } catch { /* already finished */ }
    await tx.done.catch(() => {});
    throw e;
  }
}

/** One readwrite tx over sessions + meta: delete active-session, put session. All or nothing. */
export async function finishWorkout(session: TrainingSession): Promise<void> {
  const db = await openBio();
  const tx = db.transaction(['sessions', 'meta'], 'readwrite');
  try {
    await tx.objectStore('meta').delete(ACTIVE);
    await tx.objectStore('sessions').put(session);
    await tx.done;
  } catch (e) {
    try { tx.abort(); } catch { /* already finished */ }
    await tx.done.catch(() => {});
    throw e;
  }
  persistOnce();
  notify('sessions', session.id);
  notify('meta', ACTIVE);
}
