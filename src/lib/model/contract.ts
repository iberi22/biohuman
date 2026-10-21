/** v2 -> swal.health/v1 (lossy) projection and contract -> v2 lift. */
import { GOS_DATASET_NONE, metEnergy, metFor, validateWorkout, type SetLog, type Workout } from '../training';
import { exByRef } from './catalogue';
import { liftWorkout } from './lift';
import type { LoggedSet, SideSet, TrainingSession } from './types';

export const fromContract = (w: Workout): TrainingSession => liftWorkout(w);

const clamp = (n: number) => Math.min(10, Math.max(0, n));
const pos = (n: unknown): n is number => typeof n === 'number' && Number.isFinite(n) && n > 0;

function emit(s: { reps?: number; weightKg?: number; durationS?: number; distanceM?: number }, rpe: number | undefined): SetLog | null {
  const o: SetLog = {};
  if (pos(s.reps)) o.reps = s.reps;
  if (typeof s.weightKg === 'number' && s.weightKg >= 0) o.weightKg = s.weightKg;
  if (pos(s.durationS)) o.durationS = s.durationS;
  if (pos(s.distanceM)) o.distanceM = s.distanceM;
  if (!o.reps && !o.durationS && !o.distanceM) return null;
  if (rpe !== undefined) o.rpe = rpe;
  return o;
}
const rpeOf = (x: { rpe?: number | null; rir?: number | null }): number | undefined =>
  x.rpe != null ? x.rpe : x.rir != null ? clamp(10 - x.rir) : undefined;

function setsOf(s: LoggedSet): SetLog[] {
  if (!s.done || s.phase !== 'work') return [];
  const out: (SetLog | null)[] = [];
  const part = (x: LoggedSet | SideSet) => {
    out.push(emit(x as LoggedSet, rpeOf(x)));
    for (const d of x.drops ?? []) out.push(emit({ reps: d.reps, weightKg: d.weightKg }, undefined));
  };
  if (s.sides && (s.sides.L || s.sides.R)) {
    for (const side of [s.sides.L, s.sides.R]) if (side?.done) part(side);
  } else part(s);
  return out.filter((x): x is SetLog => x !== null);
}

export interface ProjectOptions { /** When given, met-estimate energy is recomputed from the blocks. */ bodyKg?: number; version?: string }

/** Returns null when the session projects to zero blocks. Validates the record. */
export function toContract(s: TrainingSession, opts: ProjectOptions = {}): Workout | null {
  const exercises = s.blocks.filter((b) => !b.ref.startsWith('custom:'))
    .map((b) => ({ ref: b.ref as string, sets: b.sets.flatMap(setsOf) })).filter((e) => e.sets.length);
  if (!exercises.length) return null;
  const data: Workout['data'] = { startedAt: s.startedAt, endedAt: s.endedAt, exercises };
  if (s.routineId !== undefined) data.routineId = s.routineId;
  if (s.perceivedEffort !== undefined) data.perceivedEffort = s.perceivedEffort;
  if (s.notes !== undefined) data.notes = s.notes;
  if (s.energy) data.energy = { ...s.energy };
  if (opts.bodyKg !== undefined && (!s.energy || s.energy.method === 'met-estimate')) {
    const seconds = (Date.parse(s.endedAt) - Date.parse(s.startedAt)) / 1000;
    const mets = exercises.map((e) => { const x = exByRef(e.ref); return x ? metFor(x as never) : 3.5; });
    const met = mets.reduce((a, b) => a + b, 0) / mets.length;
    data.energy = { kcal: metEnergy(met, opts.bodyKg, seconds), method: 'met-estimate' };
  }
  const rec: Workout = { schema: 'swal.health/v1/workout-session', id: s.id, subject: s.subject, createdAt: s.createdAt,
    source: (s.origin ? { ...s.origin.source } : { app: 'training', version: opts.version ?? '0.1.0' }) as Workout['source'],
    gosDataset: s.origin?.gosDataset ?? GOS_DATASET_NONE, data };
  validateWorkout(rec);
  return rec;
}

export function toContractAll(list: TrainingSession[], opts: ProjectOptions = {}): { records: Workout[]; skipped: number } {
  const records: Workout[] = [];
  let skipped = 0;
  for (const s of list) { const r = toContract(s, opts); if (r) records.push(r); else skipped++; }
  return { records, skipped };
}
