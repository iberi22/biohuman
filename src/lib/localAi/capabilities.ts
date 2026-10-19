/**
 * Detects the local AI capabilities of the browser without triggering any download.
 *
 * This module is kept pure (side-effect free at import time) and uses dependency injection
 * for browser globals to remain testable in jsdom environments.
 */

export type LocalAiTier = 'prompt-api' | 'prompt-api-download' | 'webgpu' | 'rules'

/** User-facing, localisation-ready hint for the UI layer to render next to a tier. */
export interface LocalAiHint {
  es: string
  en: string
}

export interface LocalAiDetection {
  tier: LocalAiTier
  /** Technical, log-oriented explanation (English). */
  detail: string
  /** Short, localisation-ready message the UI can surface to the user. */
  hint: LocalAiHint
}

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

function hintFor(tier: LocalAiTier, timedOut: boolean): LocalAiHint {
  if (tier === 'prompt-api') {
    return { es: 'IA del navegador lista para usar.', en: 'Browser AI ready to use.' }
  }
  if (tier === 'prompt-api-download') {
    // Note: Consumer UI must check needsPromptApiConsent(tier) (~line 66) before initiating model downloads.
    return {
      es: 'La IA del navegador necesita descargar el modelo; se pedirá tu permiso antes de descargar.',
      en: 'Browser AI needs to download the model; you will be asked for permission first.',
    }
  }
  if (tier === 'webgpu') {
    return { es: 'Se detecto WebGPU en este dispositivo.', en: 'WebGPU detected on this device.' }
  }
  // rules
  return timedOut
    ? {
        es: 'La detección de IA local tardó demasiado y dejo de esperarse; se usan reglas deterministas.',
        en: 'Local AI detection timed out and stopped waiting; using deterministic rules.',
      }
    : { es: 'Sin IA local disponible; se usan reglas deterministas.', en: 'No local AI available; using deterministic rules.' }
}

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

async function raceProbe<T>(probe: Promise<T> | T, timeoutMs: number, probeName: string): Promise<T> {
  const p = Promise.resolve(probe)
  let timerId: ReturnType<typeof setTimeout> | undefined
  const timeoutPromise = new Promise<T>((_, reject) => {
    timerId = setTimeout(() => reject(new TimeoutError(probeName)), timeoutMs)
  })

  // Prevent late rejections from crashing the process
  p.catch(() => {})

  try {
    return await Promise.race([p, timeoutPromise])
  } finally {
    if (timerId) clearTimeout(timerId)
  }
}

/**
 * Detects the local AI capabilities.
 * Worst-case total time is two probe timeouts (default LOCAL_AI_PROBE_TIMEOUT_MS each).
 */
export async function detectLocalAi(
  env: LocalAiEnv = globalThis as unknown as LocalAiEnv,
  opts: { timeoutMs?: number } = {}
): Promise<LocalAiDetection> {
  let timeoutMs = opts.timeoutMs ?? LOCAL_AI_PROBE_TIMEOUT_MS
  if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) {
    timeoutMs = LOCAL_AI_PROBE_TIMEOUT_MS
  }
  const timeoutDetails: string[] = []

  try {
    if (env.LanguageModel?.availability) {
      const state = await raceProbe(env.LanguageModel.availability(), timeoutMs, 'LanguageModel.availability')
      if (state === 'available' || state === 'readily') {
        return { tier: 'prompt-api', detail: `LanguageModel available (${state})`, hint: hintFor('prompt-api', false) }
      }
      if (state === 'downloadable' || state === 'downloading' || state === 'after-download') {
        return {
          tier: 'prompt-api-download',
          detail: `LanguageModel needs download (${state})`,
          hint: hintFor('prompt-api-download', false),
        }
      }
    }
  } catch (err) {
    if (err instanceof TimeoutError) {
      timeoutDetails.push(err.message)
    }
    // Fallthrough to next capability
  }

  try {
    if (env.navigator?.gpu?.requestAdapter) {
      const adapter = await raceProbe(env.navigator.gpu.requestAdapter(), timeoutMs, 'navigator.gpu.requestAdapter')
      if (adapter) {
        return { tier: 'webgpu', detail: 'WebGPU adapter found', hint: hintFor('webgpu', false) }
      }
    }
  } catch (err) {
    if (err instanceof TimeoutError) {
      timeoutDetails.push(err.message)
    }
    // Fallthrough to rules
  }

  const detail = timeoutDetails.length > 0
    ? `Fallback to deterministic rules (${timeoutDetails.join(', ')})`
    : 'Fallback to deterministic rules'
  return { tier: 'rules', detail, hint: hintFor('rules', timeoutDetails.length > 0) }
}
