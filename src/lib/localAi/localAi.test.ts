import { describe, expect, it } from 'vitest'
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
