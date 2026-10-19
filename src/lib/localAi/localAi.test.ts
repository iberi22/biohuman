import { describe, expect, it, vi } from 'vitest'
import { detectLocalAi, needsPromptApiConsent, type LocalAiEnv } from './capabilities'
import { ruleAdvice } from './rules'

describe('detectLocalAi capabilities', () => {
  it('detects prompt-api when available', async () => {
    const env: LocalAiEnv = {
      LanguageModel: {
        availability: async () => 'available',
      },
    }
    const res = await detectLocalAi(env)
    expect(res.tier).toBe('prompt-api')
  })

  it('detects prompt-api when readily', async () => {
    const env: LocalAiEnv = {
      LanguageModel: {
        availability: async () => 'readily',
      },
    }
    const res = await detectLocalAi(env)
    expect(res.tier).toBe('prompt-api')
  })

  it('detects prompt-api-download when downloadable', async () => {
    const env: LocalAiEnv = {
      LanguageModel: {
        availability: async () => 'downloadable',
      },
    }
    const res = await detectLocalAi(env)
    expect(res.tier).toBe('prompt-api-download')
  })

  it('detects prompt-api-download when downloading', async () => {
    const env: LocalAiEnv = {
      LanguageModel: {
        availability: async () => 'downloading',
      },
    }
    const res = await detectLocalAi(env)
    expect(res.tier).toBe('prompt-api-download')
  })

  it('detects prompt-api-download when after-download', async () => {
    const env: LocalAiEnv = {
      LanguageModel: {
        availability: async () => 'after-download',
      },
    }
    const res = await detectLocalAi(env)
    expect(res.tier).toBe('prompt-api-download')
  })

  it('needsPromptApiConsent is true only for prompt-api-download', () => {
    expect(needsPromptApiConsent('prompt-api-download')).toBe(true)
    expect(needsPromptApiConsent('prompt-api')).toBe(false)
    expect(needsPromptApiConsent('webgpu')).toBe(false)
    expect(needsPromptApiConsent('rules')).toBe(false)
  })

  it('falls back to rules if LanguageModel.availability rejects', async () => {
    const env: LocalAiEnv = {
      LanguageModel: {
        availability: async () => Promise.reject(new Error('not allowed')),
      },
    }
    const res = await detectLocalAi(env)
    expect(res.tier).toBe('rules')
  })

  it('falls back to rules if LanguageModel.availability throws synchronously', async () => {
    const env: LocalAiEnv = {
      LanguageModel: {
        availability: () => {
          throw new Error('sync throw')
        },
      },
    }
    const res = await detectLocalAi(env)
    expect(res.tier).toBe('rules')
  })

  it('detects webgpu if adapter is returned', async () => {
    const env: LocalAiEnv = {
      navigator: {
        gpu: {
          requestAdapter: async () => ({ isAdapter: true }),
        },
      },
    }
    const res = await detectLocalAi(env)
    expect(res.tier).toBe('webgpu')
  })

  it('falls back to rules if webgpu returns null adapter', async () => {
    const env: LocalAiEnv = {
      navigator: {
        gpu: {
          requestAdapter: async () => null,
        },
      },
    }
    const res = await detectLocalAi(env)
    expect(res.tier).toBe('rules')
  })

  it('falls back to rules if webgpu requestAdapter rejects', async () => {
    const env: LocalAiEnv = {
      navigator: {
        gpu: {
          requestAdapter: async () => Promise.reject(new Error('timeout')),
        },
      },
    }
    const res = await detectLocalAi(env)
    expect(res.tier).toBe('rules')
  })

  it('falls back to rules if neither api is present in env', async () => {
    const env: LocalAiEnv = {}
    const res = await detectLocalAi(env)
    expect(res.tier).toBe('rules')
  })

  it('availability never settles and no GPU falls back to rules with timeout message', async () => {
    const env: LocalAiEnv = {
      LanguageModel: {
        availability: () => new Promise(() => {}),
      },
    }
    const res = await detectLocalAi(env, { timeoutMs: 20 })
    expect(res.tier).toBe('rules')
    expect(res.detail).toContain('timed out')
    expect(res.detail).toContain('LanguageModel.availability')
  })

  it('availability never settles but requestAdapter returns adapter falls back to webgpu', async () => {
    const env: LocalAiEnv = {
      LanguageModel: {
        availability: () => new Promise(() => {}),
      },
      navigator: {
        gpu: {
          requestAdapter: async () => ({ isAdapter: true }),
        },
      },
    }
    const res = await detectLocalAi(env, { timeoutMs: 20 })
    expect(res.tier).toBe('webgpu')
  })

  it('requestAdapter never settles falls back to rules with timeout message', async () => {
    const env: LocalAiEnv = {
      navigator: {
        gpu: {
          requestAdapter: () => new Promise(() => {}),
        },
      },
    }
    const res = await detectLocalAi(env, { timeoutMs: 20 })
    expect(res.tier).toBe('rules')
    expect(res.detail).toContain('timed out')
    expect(res.detail).toContain('navigator.gpu.requestAdapter')
  })

  it('both probes time out includes both names in detail', async () => {
    const env: LocalAiEnv = {
      LanguageModel: {
        availability: () => new Promise(() => {}),
      },
      navigator: {
        gpu: {
          requestAdapter: () => new Promise(() => {}),
        },
      },
    }
    const res = await detectLocalAi(env, { timeoutMs: 20 })
    expect(res.tier).toBe('rules')
    expect(res.detail).toContain('LanguageModel.availability')
    expect(res.detail).toContain('navigator.gpu.requestAdapter')
  })

  it('handles sync return values from probes without unhandled rejections', async () => {
    const env: LocalAiEnv = {
      LanguageModel: {
        // @ts-ignore testing invalid sync return
        availability: () => 'available',
      },
    }
    const res = await detectLocalAi(env, { timeoutMs: 20 })
    expect(res.tier).toBe('prompt-api')
  })

  it('timer is cleaned up after a fast probe', async () => {
    vi.useFakeTimers()
    const env: LocalAiEnv = {
      LanguageModel: {
        availability: () => Promise.resolve('available'),
      },
    }
    await detectLocalAi(env, { timeoutMs: 1000 })
    expect(vi.getTimerCount()).toBe(0)
    vi.useRealTimers()
  })

  it('never-resolving probe times out correctly with fake timers', async () => {
    vi.useFakeTimers()
    const env: LocalAiEnv = {
      LanguageModel: {
        availability: () => new Promise(() => {}),
      },
    }
    const promise = detectLocalAi(env, { timeoutMs: 1000 })

    await vi.advanceTimersByTimeAsync(999)
    // The promise shouldn't be resolved yet

    await vi.advanceTimersByTimeAsync(1)
    const res = await promise
    expect(res.tier).toBe('rules')
    vi.useRealTimers()
  })

  it('invalid timeoutMs values fallback to default', async () => {
    vi.useFakeTimers()
    const env: LocalAiEnv = {
      LanguageModel: {
        availability: () => new Promise(() => {}),
      },
    }

    // 0
    let promise = detectLocalAi(env, { timeoutMs: 0 })
    await vi.advanceTimersByTimeAsync(2999)
    await vi.advanceTimersByTimeAsync(1)
    let res = await promise
    expect(res.tier).toBe('rules')

    // negative
    promise = detectLocalAi(env, { timeoutMs: -50 })
    await vi.advanceTimersByTimeAsync(2999)
    await vi.advanceTimersByTimeAsync(1)
    res = await promise
    expect(res.tier).toBe('rules')

    // NaN
    promise = detectLocalAi(env, { timeoutMs: NaN })
    await vi.advanceTimersByTimeAsync(2999)
    await vi.advanceTimersByTimeAsync(1)
    res = await promise
    expect(res.tier).toBe('rules')

    vi.useRealTimers()
  })

  it('a slow but in-time probe resolves correctly', async () => {
    const env: LocalAiEnv = {
      LanguageModel: {
        availability: () =>
          new Promise((resolve) => setTimeout(() => resolve('available'), 5)),
      },
    }
    const res = await detectLocalAi(env, { timeoutMs: 20 })
    expect(res.tier).toBe('prompt-api')
  })

  it('a probe that rejects after the timeout fired causes no unhandled rejection', async () => {
    let rejectLate: (err: Error) => void
    const latePromise = new Promise<string>((_, reject) => {
      rejectLate = reject
    })

    const env: LocalAiEnv = {
      LanguageModel: {
        availability: () => latePromise,
      },
    }

    let unhandledCount = 0
    const onUnhandled = () => {
      unhandledCount++
    }

    // @ts-ignore
    if (typeof process !== 'undefined' && process.on) {
      // @ts-ignore
      process.on('unhandledRejection', onUnhandled)
    } else {
      window.addEventListener('unhandledrejection', onUnhandled)
    }

    const res = await detectLocalAi(env, { timeoutMs: 20 })
    expect(res.tier).toBe('rules')

    // Reject late after timeout has resolved
    rejectLate!(new Error('late rejection'))

    // Wait a little bit for microtasks
    await new Promise((resolve) => setTimeout(resolve, 50))

    // @ts-ignore
    if (typeof process !== 'undefined' && process.removeListener) {
      // @ts-ignore
      process.removeListener('unhandledRejection', onUnhandled)
    } else {
      window.removeEventListener('unhandledrejection', onUnhandled)
    }
    expect(unhandledCount).toBe(0)
  })

  it('exports a sane default LOCAL_AI_PROBE_TIMEOUT_MS', async () => {
    const { LOCAL_AI_PROBE_TIMEOUT_MS } = await import('./capabilities')
    expect(LOCAL_AI_PROBE_TIMEOUT_MS).toBeGreaterThanOrEqual(1000)
    expect(LOCAL_AI_PROBE_TIMEOUT_MS).toBeLessThanOrEqual(10000)
  })
})

describe('detectLocalAi UI hint', () => {
  const hintOf = async (env: LocalAiEnv, opts?: { timeoutMs?: number }) => (await detectLocalAi(env, opts)).hint

  it('prompt-api surfaces a ready hint in both locales', async () => {
    const hint = await hintOf({ LanguageModel: { availability: async () => 'available' } })
    expect(hint.es.length).toBeGreaterThan(0)
    expect(hint.en.length).toBeGreaterThan(0)
    expect(hint.es).not.toBe(hint.en)
  })

  it('prompt-api-download hint warns about the pending model download and consent', async () => {
    const hint = await hintOf({ LanguageModel: { availability: async () => 'downloadable' } })
    expect(hint.es.toLowerCase()).toContain('descarg')
    expect(hint.es.toLowerCase()).toContain('permiso')
    expect(hint.en.toLowerCase()).toContain('download')
    expect(hint.en.toLowerCase()).toContain('permission')
  })

  it('webgpu hint mentions WebGPU', async () => {
    const hint = await hintOf({ navigator: { gpu: { requestAdapter: async () => ({}) } } })
    expect(hint.es).toContain('WebGPU')
    expect(hint.en).toContain('WebGPU')
  })

  it('rules fallback without a timeout mentions deterministic rules', async () => {
    const hint = await hintOf({})
    expect(hint.es.toLowerCase()).toContain('reglas deterministas')
    expect(hint.en.toLowerCase()).toContain('deterministic rules')
  })

  it('rules fallback after a timeout explicitly mentions the timeout/cancellation', async () => {
    const hint = await hintOf({ LanguageModel: { availability: () => new Promise(() => {}) } }, { timeoutMs: 20 })
    expect(hint.es.toLowerCase()).toContain('tardó demasiado')
    expect(hint.en.toLowerCase()).toContain('timed out')
  })
})

describe('ruleAdvice deterministic rules', () => {
  it('returns empty array on malformed or empty inputs without throwing', () => {
    expect(ruleAdvice(null as any)).toEqual([])
    expect(ruleAdvice({} as any)).toEqual([])
    expect(ruleAdvice({ sessionsLast7d: 'many', setsByMuscleGroup: [] } as any)).toEqual([])
  })

  it('returns volume advice when a trained muscle group has fewer than 10 sets', () => {
    const advice = ruleAdvice({
      sessionsLast7d: 3,
      setsByMuscleGroup: { chest: 5, back: 12 },
    })
    expect(advice.length).toBe(1)
    expect(advice[0].kind).toBe('volume')
  })

  it('returns balance advice when 0 sets vs 10+ sets exist', () => {
    const advice = ruleAdvice({
      sessionsLast7d: 3,
      setsByMuscleGroup: { chest: 0, back: 12 },
    })
    expect(advice.length).toBe(1)
    expect(advice[0].kind).toBe('balance')
  })

  it('returns rest advice when 6 or more sessions in 7d', () => {
    const advice = ruleAdvice({
      sessionsLast7d: 6,
      setsByMuscleGroup: { chest: 10, back: 10 },
    })
    expect(advice.length).toBe(1)
    expect(advice[0].kind).toBe('rest')
  })

  it('caps at 3 items and keeps deterministic order', () => {
    const input = {
      sessionsLast7d: 7,
      setsByMuscleGroup: { legs: 0, back: 15, chest: 5 },
    }
    const advice = ruleAdvice(input)
    expect(advice.length).toBeLessThanOrEqual(3)
    // Order should be Rest, Balance, Volume
    expect(advice.map(a => a.kind)).toEqual(['rest', 'balance', 'volume'])
  })

  it('is completely deterministic (toEqual)', () => {
    const input = {
      sessionsLast7d: 7,
      setsByMuscleGroup: { legs: 0, back: 15, chest: 5 },
    }
    expect(ruleAdvice(input)).toEqual(ruleAdvice(input))
  })
})
