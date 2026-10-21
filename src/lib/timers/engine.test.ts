import { describe, expect, it } from 'vitest';
import {
  amrap, customIntervals, emom, pause, resume, snapshot, start, stopwatch, tabata, tick,
  type TimerEvent,
} from './engine';

const types = (e: TimerEvent[]) => e.map((x) => x.type);

describe('presets', () => {
  it('emom builds n one-minute work segments', () => {
    const p = emom(3);
    expect(p.segments).toHaveLength(3);
    expect(p.segments.every((s) => s.type === 'work' && s.durationMs === 60000)).toBe(true);
  });
  it('tabata is 20/10 x 8', () => {
    const p = tabata();
    expect(p.segments).toHaveLength(16);
    expect(p.segments[0]).toMatchObject({ type: 'work', durationMs: 20000, round: 1 });
    expect(p.segments[1]).toMatchObject({ type: 'rest', durationMs: 10000, round: 1 });
    expect(p.segments[15].round).toBe(8);
  });
  it('amrap is a single capped work segment', () => {
    expect(amrap(10).segments).toEqual([{ type: 'work', durationMs: 600000, round: 1 }]);
  });
  it('custom intervals skip zero rest', () => {
    expect(customIntervals(2, 5, 0).segments).toHaveLength(2);
  });
  it('rejects invalid input', () => {
    expect(() => emom(0)).toThrow();
    expect(() => customIntervals(1, -1, 1)).toThrow();
  });
});

describe('engine', () => {
  it('start emits first segment-start', () => {
    const r = start(tabata(), 1000);
    expect(types(r.events)).toEqual(['segment-start']);
    expect(r.state.status).toBe('running');
  });

  it('emits countdown, round-done and segment-start across a boundary', () => {
    let r = start(customIntervals(2, 10, 5), 0);
    r = tick(r.state, 6999);
    expect(r.events.filter((e) => e.type === 'countdown')).toEqual([]);
    r = tick(r.state, 10000);
    expect(r.events.filter((e) => e.type === 'countdown').map((e: any) => e.secondsLeft)).toEqual([3, 2, 1]);
    expect(types(r.events)).toEqual(['countdown', 'countdown', 'countdown', 'segment-start']);
    expect(r.events.some((e) => e.type === 'segment-start' && (e as any).segmentType === 'rest')).toBe(true);
  });

  it('does not repeat events on repeated ticks', () => {
    let r = start(emom(2), 0);
    r = tick(r.state, 30000);
    expect(tick(r.state, 30000).events).toEqual([]);
  });

  it('survives tab sleep: one big tick emits everything in order and finishes', () => {
    const r0 = start(tabata(), 0);
    const r = tick(r0.state, 10 * 60000);
    expect(r.state.status).toBe('finished');
    expect(r.events.filter((e) => e.type === 'segment-start')).toHaveLength(15);
    expect(r.events.filter((e) => e.type === 'round-done')).toHaveLength(8);
    expect(types(r.events).at(-1)).toBe('finish');
    const ats = r.events.map((e) => e.atMs);
    expect([...ats].sort((a, b) => a - b)).toEqual(ats);
    expect(snapshot(r.state, 99999999).elapsedMs).toBe(240000);
  });

  it('pause freezes time and resume continues', () => {
    let r = start(emom(1), 0);
    const p = pause(tick(r.state, 20000).state, 20000).state;
    expect(tick(p, 500000).events).toEqual([]);
    expect(snapshot(p, 500000).elapsedMs).toBe(20000);
    const s = resume(p, 500000);
    expect(snapshot(s, 510000).elapsedMs).toBe(30000);
    const f = tick(s, 540000);
    expect(f.state.status).toBe('finished');
  });

  it('pause returns events crossed since the last tick', () => {
    const r = start(emom(1), 0);
    const p = pause(r.state, 57500);
    expect(p.state.status).toBe('paused');
    expect(p.events.map((e) => e.type)).toEqual(['countdown']);
    expect(pause(tick(r.state, 59000).state, 60000).events.map((e) => e.type)).toEqual(['round-done', 'finish']);
  });

  it('rejects fractional rounds and minutes', () => {
    expect(() => emom(2.5)).toThrow(/integer/);
    expect(() => customIntervals(2.5, 20, 10)).toThrow(/integer/);
    expect(() => tabata(1.5)).toThrow(/integer/);
    expect(amrap(2.5).segments[0].durationMs).toBe(150000);
  });

  it('snapshot reports segment, remaining and round', () => {
    const r = start(tabata(), 0);
    const s = snapshot(r.state, 25000);
    expect(s).toMatchObject({ segmentIndex: 1, segmentType: 'rest', segmentRemainingMs: 5000, round: 1 });
  });

  it('stopwatch counts up and never finishes', () => {
    const r = start(stopwatch(), 0);
    const t = tick(r.state, 3600000);
    expect(t.state.status).toBe('running');
    expect(snapshot(t.state, 3600000).elapsedMs).toBe(3600000);
  });

  it('ignores backwards clock', () => {
    const r = start(emom(1), 1000);
    expect(snapshot(r.state, 500).elapsedMs).toBe(0);
  });
});
