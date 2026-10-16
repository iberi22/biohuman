import { describe, expect, it } from 'vitest'
import {
  initialState,
  loadState,
  saveState,
  markSeen,
  skipNeed,
  nextNeed,
  progress,
  isComplete,
  ONBOARDING_NEEDS,
  ONBOARDING_STORAGE_KEY,
  type OnboardingStorage
} from './needs'

class FakeStorage implements OnboardingStorage {
  private data = new Map<string, string>()

  get(key: string): string | null {
    return this.data.get(key) || null
  }

  set(key: string, value: string): void {
    this.data.set(key, value)
  }
}

describe('Onboarding Model', () => {
  it('has exactly the five required topics in the correct order', () => {
    expect(ONBOARDING_NEEDS.map(n => n.id)).toEqual([
      'no-account',
      'device-lock',
      'local-ai',
      'vault-family',
      'inventory'
    ])
  })

  it('nextNeed returns the first unresolved need', () => {
    let state = initialState()
    expect(nextNeed(state)?.id).toBe('no-account')

    state = markSeen(state, 'no-account')
    expect(nextNeed(state)?.id).toBe('device-lock')

    state = skipNeed(state, 'device-lock')
    expect(nextNeed(state)?.id).toBe('local-ai')
  })

  it('markSeen advances the state and is immutable', () => {
    const state = initialState()
    const nextState = markSeen(state, 'no-account')

    expect(nextState).not.toBe(state) // Immutability
    expect(nextState.seen).toContain('no-account')
    expect(state.seen).not.toContain('no-account')
  })

  it('skipNeed advances the state, is immutable, and counts as done', () => {
    const state = initialState()
    const nextState = skipNeed(state, 'no-account')

    expect(nextState).not.toBe(state) // Immutability
    expect(nextState.skipped).toContain('no-account')
    expect(state.skipped).not.toContain('no-account')

    const p = progress(nextState)
    expect(p.done).toBe(1)
  })

  it('isComplete is false initially and true when all are done', () => {
    let state = initialState()
    expect(isComplete(state)).toBe(false)

    for (const need of ONBOARDING_NEEDS) {
      state = markSeen(state, need.id)
    }

    expect(isComplete(state)).toBe(true)
  })

  it('capability flag set to false removes the need from nextNeed and progress.total', () => {
    const state = initialState()
    const available = { 'local-ai': false, inventory: false } // Disable some capabilities

    // Total should be 3 instead of 5
    expect(progress(state, available).total).toBe(3)

    let currentState = state
    currentState = markSeen(currentState, 'no-account')
    currentState = markSeen(currentState, 'device-lock')

    // Since 'local-ai' is disabled, the next need should be 'vault-family'
    expect(nextNeed(currentState, available)?.id).toBe('vault-family')

    currentState = markSeen(currentState, 'vault-family')

    // Since 'inventory' is disabled, the flow should be complete now
    expect(isComplete(currentState, available)).toBe(true)
    expect(nextNeed(currentState, available)).toBeNull()
  })

  it('progress.pct is 0 at the start and 100 at the end', () => {
    let state = initialState()
    expect(progress(state).pct).toBe(0)

    for (const need of ONBOARDING_NEEDS) {
      state = skipNeed(state, need.id)
    }

    expect(progress(state).pct).toBe(100)
  })

  it('progress.pct rounds consistently', () => {
    let state = initialState()
    state = markSeen(state, 'no-account')
    // 1/5 done is 20%
    expect(progress(state).pct).toBe(20)

    state = markSeen(state, 'device-lock')
    // 2/5 done is 40%
    expect(progress(state).pct).toBe(40)
  })

  it('loadState recovers from not json', () => {
    const storage = new FakeStorage()
    storage.set(ONBOARDING_STORAGE_KEY, 'not json')

    const state = loadState(storage)
    expect(state).toEqual(initialState())
  })

  it('loadState recovers when storage read throws', () => {
    const throwingStorage: OnboardingStorage = {
      get() { throw new DOMException('SecurityError') },
      set() {}
    }

    const state = loadState(throwingStorage)
    expect(state).toEqual(initialState())
  })

  it('loadState recovers from corrupt/empty objects', () => {
    const storage = new FakeStorage()
    storage.set(ONBOARDING_STORAGE_KEY, '{}') // Missing v: 1

    let state = loadState(storage)
    expect(state).toEqual(initialState())

    storage.set(ONBOARDING_STORAGE_KEY, '{"v": 2}') // Wrong version
    state = loadState(storage)
    expect(state).toEqual(initialState())
  })

  it('loadState drops unknown ids', () => {
    const storage = new FakeStorage()
    storage.set(ONBOARDING_STORAGE_KEY, JSON.stringify({
      v: 1,
      seen: ['no-account', 'unknown-id'],
      skipped: ['another-unknown']
    }))

    const state = loadState(storage)
    expect(state.seen).toEqual(['no-account'])
    expect(state.skipped).toEqual([])
  })

  it('saveState and loadState roundtrip correctly', () => {
    const storage = new FakeStorage()
    let state = initialState()
    state = markSeen(state, 'no-account')
    state = skipNeed(state, 'device-lock')
    state.completedAt = '2026-10-16T12:00:00Z'

    saveState(storage, state)

    const loaded = loadState(storage)
    expect(loaded).toEqual(state)
  })

  it('copy does not contain forbidden cloud/account promise words', () => {
    const forbidden = /cuenta obligatoria|nube|cupo|crédito|precio|suscripción/i

    for (const need of ONBOARDING_NEEDS) {
      expect(need.title).not.toMatch(forbidden)
      expect(need.body).not.toMatch(forbidden)
    }
  })
})
