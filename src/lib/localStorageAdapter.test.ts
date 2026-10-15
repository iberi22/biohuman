import { describe, it, expect } from 'vitest';
import { ensureCloneable } from './localStorageAdapter';

describe('ensureCloneable', () => {
  it('returns plain records unchanged', () => {
    const record = { id: '1', payload: { a: 1, list: [1, 2] } };
    expect(ensureCloneable(record)).toBe(record);
  });

  it('turns a $state-like Proxy into a plain copy instead of a DataCloneError', () => {
    const routine = new Proxy({ name: 'Full body', exercises: [{ sets: 3, reps: 10 }] }, {});
    const record = { id: 'local', payload: [routine] };
    expect(() => structuredClone(record)).toThrow();
    const safe = ensureCloneable(record);
    expect(() => structuredClone(safe)).not.toThrow();
    expect(safe.payload).toEqual([{ name: 'Full body', exercises: [{ sets: 3, reps: 10 }] }]);
  });
});
