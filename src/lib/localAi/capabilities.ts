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

export function needsPromptApiConsent(tier: LocalAiTier): boolean {
  return tier === 'prompt-api-download'
}

export async function detectLocalAi(
  env: LocalAiEnv = globalThis as unknown as LocalAiEnv
): Promise<{ tier: LocalAiTier; detail: string }> {
  try {
    if (env.LanguageModel?.availability) {
      const state = await env.LanguageModel.availability()
      if (state === 'available' || state === 'readily') {
        return { tier: 'prompt-api', detail: `LanguageModel available (${state})` }
      }
      if (state === 'downloadable' || state === 'downloading' || state === 'after-download') {
        return { tier: 'prompt-api-download', detail: `LanguageModel needs download (${state})` }
      }
    }
  } catch (err) {
    // Fallthrough to next capability
  }

  try {
    if (env.navigator?.gpu?.requestAdapter) {
      const adapter = await env.navigator.gpu.requestAdapter()
      if (adapter) {
        return { tier: 'webgpu', detail: 'WebGPU adapter found' }
      }
    }
  } catch (err) {
    // Fallthrough to rules
  }

  return { tier: 'rules', detail: 'Fallback to deterministic rules' }
}
