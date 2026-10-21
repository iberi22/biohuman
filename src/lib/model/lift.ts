/** v1 -> v2 lift. Pure, idempotent (v2 input is returned as-is), unknown refs kept and flagged. */
import type { ActiveSession, Preferences, Routine, SetLog, Workout } from '../training';
import { exByRef, modeOf } from './catalogue';
import type { ActiveSessionV2, BodyMetric, Block, LoggedSet, Ref, RoutineV2, TrainingSession } from './types';

const isV2 = (x: unknown): boolean => (x as { v?: number })?.v === 2;

export const liftSet = (s: SetLog): LoggedSet => ({ ...s, phase: 'work', done: true });

export function liftBlock(e: { ref: string; sets: SetLog[] }): Block {
  const b: Block = { ref: e.ref as Ref, mode: modeOf(e.ref), sets: e.sets.map(liftSet) };
  if (!exByRef(e.ref)) b.unknown = true;
  return b;
}

export function liftWorkout(w: Workout | TrainingSession): TrainingSession {
  if (isV2(w)) return w as TrainingSession;
  const r = w as Workout, d = r.data;
  const s: TrainingSession = { v: 2, id: r.id, subject: r.subject, startedAt: d.startedAt, endedAt: d.endedAt,
    blocks: d.exercises.map(liftBlock), createdAt: r.createdAt, updatedAt: r.createdAt,
    origin: { source: { ...r.source }, gosDataset: r.gosDataset } };
  if (d.routineId !== undefined) s.routineId = d.routineId;
  if (d.perceivedEffort !== undefined) s.perceivedEffort = d.perceivedEffort;
  if (d.notes !== undefined) s.notes = d.notes;
  if (d.energy) s.energy = { ...d.energy };
  return s;
}

export function liftRoutine(r: Routine | RoutineV2, now = new Date().toISOString()): RoutineV2 {
  if (isV2(r)) return r as RoutineV2;
  const v1 = r as Routine;
  return { v: 2, id: v1.id, name: v1.name, items: v1.exercises.map((t) => ({ ...t })), updatedAt: now };
}

export function liftActive(a: ActiveSession | ActiveSessionV2, now = new Date().toISOString()): ActiveSessionV2 {
  if (isV2(a)) return a as ActiveSessionV2;
  const v1 = a as ActiveSession;
  return { v: 2, id: v1.id, routine: liftRoutine(v1.routine, now), startedAt: v1.startedAt, index: v1.index,
    blocks: v1.exercises.map(liftBlock), restUntil: v1.restUntil, bodyKg: v1.bodyKg };
}

/** prefs.bodyKg seeds one weight metric dated at migration. */
export function liftPrefsBody(p: Pick<Preferences, 'bodyKg'>, now = new Date().toISOString()): BodyMetric[] {
  return Number.isFinite(p.bodyKg) && p.bodyKg > 0 ? [{ id: `weight-${now}`, at: now, kind: 'weight', value: p.bodyKg }] : [];
}
