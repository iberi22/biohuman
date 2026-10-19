/**
 * Detects the local AI capabilities of the browser without triggering any download.
 *
 * This module is kept pure (side-effect free at import time) and uses dependency injection
 * for browser globals to remain testable in jsdom environments.
 */

export type LocalAiTier = 'prompt-api' | 'prompt-api-download' | 'webgpu' | 'rules'

export type LocalAiEnv = {
  LanguageModel?: {
    availability?: () => Promise<string>
  }
  navigator?: {
    gpu?: {
      requestAdapter?: () => Promise<unknown>
    }
  }
}

export const LOCAL_AI_TIER_LABEL: Record<LocalAiTier, string> = {
  'prompt-api': 'IA integrada del navegador',
  'prompt-api-download': 'IA del navegador (descarga pendiente)',
  webgpu: 'IA local WebGPU',
  rules: 'Reglas sin IA',
}

export const LOCAL_AI_PROBE_TIMEOUT_MS = 3000

export function needsPromptApiConsent(tier: LocalAiTier): boolean {
  return tier === 'prompt-api-download'
}

class TimeoutError extends Error {
  probeName: string
  constructor(probeName: string) {
    super(`timed out: ${probeName}`)
    this.probeName = probeName
    this.name = 'TimeoutError'
  }
}

function raceProbe<T>(probe: Promise<T>, timeoutMs: number, probeName: string): Promise<T> {
  let timerId: ReturnType<typeof setTimeout> | undefined
  const timeoutPromise = new Promise<T>((_, reject) => {
    timerId = setTimeout(() => reject(new TimeoutError(probeName)), timeoutMs)
  })

  // Prevent late rejections from crashing the process
  probe.catch(() => {})

  return Promise.race([probe, timeoutPromise]).finally(() => {
    if (timerId) clearTimeout(timerId)
  })
}

/**
 * Detects the local AI capabilities.
 * Worst-case total time is two probe timeouts (default LOCAL_AI_PROBE_TIMEOUT_MS each).
 */
export async function detectLocalAi(
  env: LocalAiEnv = globalThis as unknown as LocalAiEnv,
  opts: { timeoutMs?: number } = {}
): Promise<{ tier: LocalAiTier; detail: string }> {
  const timeoutMs = opts.timeoutMs ?? LOCAL_AI_PROBE_TIMEOUT_MS
  let timeoutDetail = ''

  try {
    if (env.LanguageModel?.availability) {
      const state = await raceProbe(env.LanguageModel.availability(), timeoutMs, 'LanguageModel.availability')
      if (state === 'available' || state === 'readily') {
        return { tier: 'prompt-api', detail: `LanguageModel available (${state})` }
      }
      if (state === 'downloadable' || state === 'downloading' || state === 'after-download') {
        return { tier: 'prompt-api-download', detail: `LanguageModel needs download (${state})` }
      }
    }
  } catch (err) {
    if (err instanceof TimeoutError) {
      timeoutDetail = err.message
    }
    // Fallthrough to next capability
  }

  try {
    if (env.navigator?.gpu?.requestAdapter) {
      const adapter = await raceProbe(env.navigator.gpu.requestAdapter(), timeoutMs, 'navigator.gpu.requestAdapter')
      if (adapter) {
        return { tier: 'webgpu', detail: 'WebGPU adapter found' }
      }
    }
  } catch (err) {
    if (err instanceof TimeoutError) {
      timeoutDetail = err.message
    }
    // Fallthrough to rules
  }

  const detail = timeoutDetail
    ? `Fallback to deterministic rules (${timeoutDetail})`
    : 'Fallback to deterministic rules'
  return { tier: 'rules', detail }
}
