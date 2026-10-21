/** Canonical v2 training data model (ADR-001). Contract vocabulary plus optional extensions. */
import type { Policy } from '../domain/progression';
import type { Target } from '../training';

export type Ref = `wg:${string}` | `custom:${string}`;
/** From exerciseType: *_reps|assisted -> reps, duration -> time, distance_duration -> cardio. */
export type Mode = 'reps' | 'time' | 'cardio';

export interface SideSet { weightKg: number; reps: number; done: boolean; rir?: number | null; rpe?: number | null;
  type?: 'straight' | 'dropset' | 'restpause'; drops?: { weightKg: number; reps: number }[]; clusters?: { reps: number; restS: number }[] }

export interface LoggedSet { reps?: number; weightKg?: number; durationS?: number; distanceM?: number; rpe?: number | null; rir?: number | null;
  phase: 'warmup' | 'work'; type?: 'straight' | 'dropset' | 'restpause'; drops?: { weightKg: number; reps: number }[];
  clusters?: { reps: number; restS: number }[]; sides?: { L?: SideSet; R?: SideSet }; hrAvg?: number; done: boolean; at?: number }

export interface RoutineItem extends Target { mode?: Mode; repsMin?: number; inc?: number; prog?: Policy;
  warmupSets?: number; side?: boolean; groupId?: string; deloadFactor?: number }
export type PlannedItem = RoutineItem;

export interface Block { ref: Ref; mode: Mode; groupId?: string; sets: LoggedSet[]; planned?: PlannedItem; note?: string;
  protocol?: { kind: 'emom' | 'amrap' | 'tabata' | 'interval' | 'stopwatch'; workS: number; restS: number; rounds: number; capS?: number; roundsDone?: number };
  /** Extension: ref not in the catalogue (kept verbatim; UI shows "ejercicio desconocido"). */
  unknown?: true }

export interface TrainingSession { v: 2; id: string; subject: string; startedAt: string; endedAt: string; routineId?: string;
  program?: { id: string; week: number; day: number; deload: boolean }; blocks: Block[]; perceivedEffort?: number; notes?: string;
  energy?: { kcal: number; method: 'met-estimate' | 'device' | 'declared' | 'unknown' }; createdAt: string; updatedAt: string;
  /** Extension: contract envelope origin, kept so lift then projection is lossless. */
  origin?: { source: { app: string; version: string }; gosDataset: string } }

export interface RoutineV2 { v: 2; id: string; name: string; items: RoutineItem[];
  kind?: 'strength' | 'conditioning' | 'mobility' | 'warmup' | 'cooldown'; updatedAt: string }

export interface ActiveSessionV2 { v: 2; id: string; routine: RoutineV2; startedAt: string; index: number; blocks: Block[]; restUntil: number; bodyKg: number }

export interface Program { id: string; name: string; goal: string; startDate: string; weeks: number; daysPerWeek: number;
  days: { week: number; day: number; routineId: string; mods?: { loadPct?: number; volumePct?: number; rirTarget?: number } }[];
  deload: { everyNWeeks: number | null; factor: number; reactive: boolean }; source: 'template' | 'assessment' | 'user' }

export interface BodyMetric { id: string; at: string; kind: 'weight' | 'waist' | 'hip' | 'chest' | 'arm' | 'thigh' | 'bodyFatPct' | 'restingHr' | 'hrMax'; value: number }

export interface Injury { region: 'neck' | 'shoulder' | 'elbow' | 'wrist' | 'lumbar' | 'hip' | 'knee' | 'ankle'; severity: 'avoid' | 'caution'; since?: string; note?: string }
export interface UserProfile { goal: string; level: string; daysPerWeek: number; sessionMin: number; equipment: string[]; birthYear?: number; sex?: string; parqFlags: string[]; injuries: Injury[] }
