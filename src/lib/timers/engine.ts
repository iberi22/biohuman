/** Pure conditioning timer engine (no DOM). Time is injected via `nowMs`. */

export type SegmentType = 'work' | 'rest';

export interface Segment {
  type: SegmentType;
  durationMs: number;
  /** 1-based round number. */
  round: number;
}

export interface TimerPlan {
  kind: 'emom' | 'amrap' | 'tabata' | 'intervals' | 'stopwatch';
  segments: Segment[];
  /** Stopwatch is open-ended: no segments, never finishes. */
  openEnded: boolean;
}

export type TimerEvent =
  | { type: 'segment-start'; atMs: number; segmentIndex: number; segmentType: SegmentType; round: number }
  | { type: 'countdown'; atMs: number; segmentIndex: number; secondsLeft: number }
  | { type: 'round-done'; atMs: number; round: number }
  | { type: 'finish'; atMs: number };

export interface TimerState {
  plan: TimerPlan;
  status: 'running' | 'paused' | 'finished';
  /** Wall-clock time of the last (re)start; null when paused/finished. */
  runningSinceMs: number | null;
  /** Timer time accumulated before runningSinceMs. */
  accumulatedMs: number;
  /** Timer time up to which events were already emitted (-1 = none). */
  emittedMs: number;
}

export interface TimerResult {
  state: TimerState;
  events: TimerEvent[];
}

export interface TimerSnapshot {
  status: TimerState['status'];
  elapsedMs: number;
  segmentIndex: number;
  segmentType: SegmentType | null;
  segmentRemainingMs: number | null;
  round: number;
}

const MIN = 60000;
const COUNTDOWN_SECONDS = [3, 2, 1];

function positive(n: number, name: string): void {
  if (!Number.isFinite(n) || n <= 0) throw new Error(`${name} must be > 0`);
}

export function customIntervals(rounds: number, workSec: number, restSec: number): TimerPlan {
  positive(rounds, 'rounds');
  positive(workSec, 'workSec');
  if (!Number.isFinite(restSec) || restSec < 0) throw new Error('restSec must be >= 0');
  const segments: Segment[] = [];
  for (let r = 1; r <= rounds; r++) {
    segments.push({ type: 'work', durationMs: workSec * 1000, round: r });
    if (restSec > 0) segments.push({ type: 'rest', durationMs: restSec * 1000, round: r });
  }
  return { kind: 'intervals', segments, openEnded: false };
}

export function emom(minutes: number): TimerPlan {
  positive(minutes, 'minutes');
  const segments: Segment[] = [];
  for (let r = 1; r <= minutes; r++) segments.push({ type: 'work', durationMs: MIN, round: r });
  return { kind: 'emom', segments, openEnded: false };
}

export function amrap(capMinutes: number): TimerPlan {
  positive(capMinutes, 'capMinutes');
  return { kind: 'amrap', segments: [{ type: 'work', durationMs: capMinutes * MIN, round: 1 }], openEnded: false };
}

export function tabata(rounds = 8, workSec = 20, restSec = 10): TimerPlan {
  return { ...customIntervals(rounds, workSec, restSec), kind: 'tabata' };
}

export function stopwatch(): TimerPlan {
  return { kind: 'stopwatch', segments: [], openEnded: true };
}

function totalMs(plan: TimerPlan): number {
  return plan.segments.reduce((a, s) => a + s.durationMs, 0);
}

const PRIORITY: Record<TimerEvent['type'], number> = { countdown: 0, 'round-done': 1, finish: 2, 'segment-start': 3 };

/** Events with from < atMs <= to (timer time). */
function eventsBetween(plan: TimerPlan, from: number, to: number): TimerEvent[] {
  const out: TimerEvent[] = [];
  const inRange = (t: number) => t > from && t <= to;
  let offset = 0;
  plan.segments.forEach((seg, i) => {
    const end = offset + seg.durationMs;
    if (inRange(offset)) {
      out.push({ type: 'segment-start', atMs: offset, segmentIndex: i, segmentType: seg.type, round: seg.round });
    }
    for (const s of COUNTDOWN_SECONDS) {
      const at = end - s * 1000;
      if (s * 1000 < seg.durationMs && inRange(at)) {
        out.push({ type: 'countdown', atMs: at, segmentIndex: i, secondsLeft: s });
      }
    }
    const next = plan.segments[i + 1];
    if ((!next || next.round !== seg.round) && inRange(end)) {
      out.push({ type: 'round-done', atMs: end, round: seg.round });
    }
    offset = end;
  });
  if (!plan.openEnded && inRange(offset)) out.push({ type: 'finish', atMs: offset });
  return out
    .map((e, idx) => ({ e, idx }))
    .sort((a, b) => a.e.atMs - b.e.atMs || PRIORITY[a.e.type] - PRIORITY[b.e.type] || a.idx - b.idx)
    .map((x) => x.e);
}

function elapsedAt(state: TimerState, nowMs: number): number {
  const live = state.runningSinceMs === null ? 0 : Math.max(0, nowMs - state.runningSinceMs);
  const raw = state.accumulatedMs + live;
  return state.plan.openEnded ? raw : Math.min(raw, totalMs(state.plan));
}

export function start(plan: TimerPlan, nowMs: number): TimerResult {
  return tick({ plan, status: 'running', runningSinceMs: nowMs, accumulatedMs: 0, emittedMs: -1 }, nowMs);
}

/** Advance to `nowMs`, emitting every event crossed since the last tick. */
export function tick(state: TimerState, nowMs: number): TimerResult {
  if (state.status !== 'running') return { state, events: [] };
  const elapsed = elapsedAt(state, nowMs);
  const events = eventsBetween(state.plan, state.emittedMs, elapsed);
  const finished = !state.plan.openEnded && elapsed >= totalMs(state.plan);
  const next: TimerState = finished
    ? { ...state, status: 'finished', runningSinceMs: null, accumulatedMs: elapsed, emittedMs: elapsed }
    : { ...state, emittedMs: Math.max(state.emittedMs, elapsed) };
  return { state: next, events };
}

export function pause(state: TimerState, nowMs: number): TimerState {
  if (state.status !== 'running') return state;
  const r = tick(state, nowMs).state;
  if (r.status !== 'running') return r;
  return { ...r, status: 'paused', runningSinceMs: null, accumulatedMs: elapsedAt(state, nowMs) };
}

export function resume(state: TimerState, nowMs: number): TimerState {
  if (state.status !== 'paused') return state;
  return { ...state, status: 'running', runningSinceMs: nowMs };
}

export function snapshot(state: TimerState, nowMs: number): TimerSnapshot {
  const elapsedMs = elapsedAt(state, nowMs);
  const segs = state.plan.segments;
  let offset = 0;
  for (let i = 0; i < segs.length; i++) {
    const end = offset + segs[i].durationMs;
    if (elapsedMs < end || i === segs.length - 1) {
      return {
        status: state.status,
        elapsedMs,
        segmentIndex: i,
        segmentType: segs[i].type,
        segmentRemainingMs: Math.max(0, end - elapsedMs),
        round: segs[i].round,
      };
    }
    offset = end;
  }
  return { status: state.status, elapsedMs, segmentIndex: -1, segmentType: null, segmentRemainingMs: null, round: 0 };
}
