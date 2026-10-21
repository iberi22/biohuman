/** v2 <-> openGym engine shapes. Weights are always kg: call the engine with S.unit='kg'. */
import type { RoutineExercise, Routine as EngineRoutine, Workout as EngineWorkout, HistoryState } from '../domain/history';
import type { WorkoutEntry, WorkoutSet, Side } from '../domain/workout-model';
import { modeOf, slugOf, refOf, exByRef } from './catalogue';
import type { Block, LoggedSet, Mode, Ref, RoutineItem, RoutineV2, SideSet, TrainingSession } from './types';

const num = (v: unknown): number | undefined => {
  if (v === undefined || v === null || v === '') return undefined;
  const n = Number(v);
  return Number.isFinite(n) ? n : undefined;
};
const put = <T extends object>(o: T, k: string, v: unknown) => { if (v !== undefined) (o as Record<string, unknown>)[k] = v; };

/** Slug -> ref: a registered custom exercise keeps its `custom:` prefix. */
const refFromSlug = (slug: string): Ref => (exByRef(`custom:${slug}`) ? (`custom:${slug}` as Ref) : refOf(slug));

const dropsTo = (d?: { weightKg: number; reps: number }[]) => d?.map((x) => ({ w: x.weightKg, r: x.reps }));
const dropsFrom = (d?: { w: number; r: number }[]) => d?.map((x) => ({ weightKg: x.w, reps: x.r }));
const clTo = (c?: { reps: number; restS: number }[]) => c?.map((x) => ({ r: x.reps, restSec: x.restS }));
const clFrom = (c?: { r: number; restSec: number }[]) => c?.map((x) => ({ reps: x.r, restS: x.restSec }));

function sideTo(s: SideSet): Side {
  const o: Side = { w: s.weightKg, r: s.reps, done: s.done };
  put(o, 'rir', s.rir); put(o, 'rpe', s.rpe); put(o, 'type', s.type); put(o, 'drops', dropsTo(s.drops)); put(o, 'clusters', clTo(s.clusters));
  return o;
}
function sideFrom(s: Side): SideSet {
  const o: SideSet = { weightKg: Number(s.w), reps: Number(s.r), done: !!s.done };
  put(o, 'rir', s.rir); put(o, 'rpe', s.rpe); put(o, 'type', s.type); put(o, 'drops', dropsFrom(s.drops)); put(o, 'clusters', clFrom(s.clusters));
  return o;
}

export function toEngineSet(s: LoggedSet, mode: Mode): WorkoutSet {
  const o: WorkoutSet = { done: s.done, phase: s.phase };
  put(o, 'w', s.weightKg); put(o, 'r', s.reps);
  if (mode === 'time') put(o, 'sec', s.durationS);
  if (mode === 'cardio') {
    if (s.durationS !== undefined) o.min = s.durationS / 60;
    if (s.distanceM !== undefined && s.durationS) o.speed = s.distanceM / 1000 / (s.durationS / 3600);
  }
  put(o, 'rir', s.rir); put(o, 'rpe', s.rpe); put(o, 'type', s.type); put(o, 'drops', dropsTo(s.drops)); put(o, 'clusters', clTo(s.clusters));
  put(o, 'hrAvg', s.hrAvg); put(o, 'at', s.at);
  if (s.sides) { o.sides = {}; if (s.sides.L) o.sides.L = sideTo(s.sides.L); if (s.sides.R) o.sides.R = sideTo(s.sides.R); }
  return o;
}

export function fromEngineSet(e: WorkoutSet, mode: Mode): LoggedSet {
  const s: LoggedSet = { phase: e.phase === 'warmup' || e.warmup === true ? 'warmup' : 'work', done: !!e.done };
  put(s, 'weightKg', num(e.w)); put(s, 'reps', num(e.r));
  if (mode === 'time') put(s, 'durationS', num(e.sec));
  if (mode === 'cardio') {
    const min = num(e.min), speed = num(e.speed);
    if (min !== undefined) s.durationS = min * 60;
    if (min && speed !== undefined) s.distanceM = speed * (min / 60) * 1000;
  }
  put(s, 'rir', e.rir); put(s, 'rpe', e.rpe); put(s, 'type', e.type); put(s, 'drops', dropsFrom(e.drops)); put(s, 'clusters', clFrom(e.clusters));
  put(s, 'hrAvg', num(e.hrAvg)); put(s, 'at', num(e.at));
  if (e.sides) { s.sides = {}; if (e.sides.L) s.sides.L = sideFrom(e.sides.L); if (e.sides.R) s.sides.R = sideFrom(e.sides.R); }
  return s;
}

export function toEngineRoutineExercise(i: RoutineItem): RoutineExercise {
  const o: RoutineExercise = { id: slugOf(i.ref), sets: i.sets, reps: i.reps, weightKg: i.weightKg, restSec: i.restS,
    durationS: i.durationS, distanceM: i.distanceM, mode: i.mode ?? modeOf(i.ref), unit: 'kg' };
  put(o, 'repsMin', i.repsMin); put(o, 'inc', i.inc); put(o, 'prog', i.prog); put(o, 'warmupSets', i.warmupSets);
  put(o, 'side', i.side); put(o, 'groupId', i.groupId); put(o, 'deloadFactor', i.deloadFactor);
  return o;
}
export function fromEngineRoutineExercise(e: RoutineExercise): RoutineItem {
  const i: RoutineItem = { ref: refFromSlug(e.id), sets: e.sets ?? 0, reps: e.reps ?? 0, weightKg: e.weightKg ?? 0,
    durationS: num(e.durationS) ?? 0, distanceM: num(e.distanceM) ?? 0, restS: e.restSec ?? 0 };
  put(i, 'mode', e.mode); put(i, 'repsMin', e.repsMin); put(i, 'inc', e.inc); put(i, 'prog', e.prog); put(i, 'warmupSets', e.warmupSets);
  put(i, 'side', e.side); put(i, 'groupId', e.groupId); put(i, 'deloadFactor', e.deloadFactor);
  return i;
}

export const toEngineRoutine = (r: RoutineV2): EngineRoutine => ({ id: r.id, name: r.name, ex: r.items.map(toEngineRoutineExercise) });
export const fromEngineRoutine = (r: EngineRoutine, updatedAt: string): RoutineV2 =>
  ({ v: 2, id: r.id, name: r.name, items: r.ex.map(fromEngineRoutineExercise), updatedAt });

export function toEngineEntry(b: Block): WorkoutEntry {
  const target: Record<string, unknown> = { mode: b.mode, unit: 'kg' };
  const en: WorkoutEntry = { id: slugOf(b.ref), target, sets: b.sets.map((s) => toEngineSet(s, b.mode)) };
  if (b.groupId) target.groupId = b.groupId;
  if (b.note) en.note = b.note;
  en.ref = b.ref;
  put(en, 'protocol', b.protocol); put(en, 'planned', b.planned); put(en, 'unknown', b.unknown);
  return en;
}
export function fromEngineEntry(e: WorkoutEntry): Block {
  const ref = (typeof e.ref === 'string' && e.ref ? e.ref : refFromSlug(e.id ?? '')) as Ref;
  const mode = (e.target?.mode as Mode | undefined) ?? modeOf(ref);
  const b: Block = { ref, mode, sets: (e.sets ?? []).map((s) => fromEngineSet(s, mode)) };
  if (typeof e.target?.groupId === 'string') b.groupId = e.target.groupId;
  if (typeof e.note === 'string') b.note = e.note;
  if (e.protocol && typeof e.protocol === 'object') b.protocol = e.protocol as Block['protocol'];
  if (e.planned && typeof e.planned === 'object') b.planned = e.planned as Block['planned'];
  if (e.unknown === true) b.unknown = true;
  return b;
}

export function toEngineWorkout(s: TrainingSession): EngineWorkout {
  const w: EngineWorkout = { d: s.startedAt.slice(0, 10), start: Date.parse(s.startedAt), entries: s.blocks.map(toEngineEntry) };
  if (s.routineId) { w.routineId = s.routineId; w.routineIds = [s.routineId]; }
  return w;
}
export const toEngineHistory = (sessions: TrainingSession[], routines: RoutineV2[]): HistoryState =>
  ({ workouts: sessions.map(toEngineWorkout), routines: routines.map(toEngineRoutine), unit: 'kg' });
/** Replaces the blocks of a session from the engine's workout, keeping the session metadata. */
export const fromEngineWorkout = (w: EngineWorkout, base: TrainingSession): TrainingSession =>
  ({ ...base, blocks: (w.entries ?? []).map(fromEngineEntry) });
