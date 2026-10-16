/**
 * A needs-driven onboarding model.
 *
 * It presents five required topics in a fixed order.
 * The flow is pure and driven by capabilities. If a capability is unavailable,
 * the corresponding need is never offered. Callers must pass feature settings
 * to switch off topics for features the app does not currently ship.
 */

export type OnboardingNeedId = 'no-account' | 'device-lock' | 'local-ai' | 'vault-family' | 'inventory'

export interface OnboardingNeed {
  id: OnboardingNeedId
  title: string
  body: string
  href?: string
  capability?: 'local-ai' | 'vault' | 'inventory'
}

export const ONBOARDING_NEEDS: readonly OnboardingNeed[] = [
  {
    id: 'no-account',
    title: 'Tu dispositivo, tus datos',
    body: 'Usa la app sin registro. Tus rutinas y entrenamientos viven en tu dispositivo, privados desde el inicio.',
  },
  {
    id: 'device-lock',
    title: 'Protección biométrica',
    body: 'Añade una capa extra de seguridad. Usa tu huella o patrón para proteger tu perfil de salud.',
  },
  {
    id: 'local-ai',
    title: 'Asistente en tu móvil',
    body: 'Analiza tu entrenamiento con IA ejecutada íntegramente de manera local, sin conexiones externas.',
    capability: 'local-ai',
  },
  {
    id: 'vault-family',
    title: 'Familia y respaldo',
    body: 'Guarda un archivo de recuperación local para respaldar tu progreso.',
    capability: 'vault',
  },
  {
    id: 'inventory',
    title: 'Inventario',
    body: 'Administra tu propio equipamiento y visualiza rutinas adaptadas a tu espacio.',
    capability: 'inventory',
  }
]

export interface OnboardingState {
  v: 1
  seen: OnboardingNeedId[]
  skipped: OnboardingNeedId[]
  completedAt?: string
}

export interface OnboardingStorage {
  get(key: string): string | null
  set(key: string, value: string): void
}

export const ONBOARDING_STORAGE_KEY = 'biohuman_onboarding_v1'

export function initialState(): OnboardingState {
  return { v: 1, seen: [], skipped: [] }
}

const ALL_IDS = new Set<string>(ONBOARDING_NEEDS.map(n => n.id))

export function loadState(storage: OnboardingStorage): OnboardingState {
  try {
    const data = storage.get(ONBOARDING_STORAGE_KEY)
    if (!data) return initialState()

    const parsed = JSON.parse(data)
    if (!parsed || typeof parsed !== 'object' || parsed.v !== 1) {
      return initialState()
    }

    // Filter out unknown ids
    const seen = Array.isArray(parsed.seen) ? parsed.seen.filter((id: any) => ALL_IDS.has(id)) : []
    const skipped = Array.isArray(parsed.skipped) ? parsed.skipped.filter((id: any) => ALL_IDS.has(id)) : []

    const state: OnboardingState = { v: 1, seen, skipped }
    if (typeof parsed.completedAt === 'string') {
      state.completedAt = parsed.completedAt
    }

    return state
  } catch (e) {
    return initialState()
  }
}

export function saveState(storage: OnboardingStorage, state: OnboardingState): void {
  storage.set(ONBOARDING_STORAGE_KEY, JSON.stringify(state))
}

export function markSeen(state: OnboardingState, id: OnboardingNeedId): OnboardingState {
  if (state.seen.includes(id)) return state
  return {
    ...state,
    seen: [...state.seen, id]
  }
}

export function skipNeed(state: OnboardingState, id: OnboardingNeedId): OnboardingState {
  if (state.skipped.includes(id)) return state
  return {
    ...state,
    skipped: [...state.skipped, id]
  }
}

function getAvailableNeeds(available?: Partial<Record<OnboardingNeed['capability'] & string, boolean>>): OnboardingNeed[] {
  return ONBOARDING_NEEDS.filter(need => {
    if (!need.capability) return true
    return available?.[need.capability] !== false
  })
}

export function nextNeed(
  state: OnboardingState,
  available?: Partial<Record<OnboardingNeed['capability'] & string, boolean>>
): OnboardingNeed | null {
  const needs = getAvailableNeeds(available)
  for (const need of needs) {
    if (!state.seen.includes(need.id) && !state.skipped.includes(need.id)) {
      return need
    }
  }
  return null
}

export function progress(
  state: OnboardingState,
  available?: Partial<Record<OnboardingNeed['capability'] & string, boolean>>
): { done: number; total: number; pct: number } {
  const needs = getAvailableNeeds(available)
  let done = 0
  const total = needs.length

  for (const need of needs) {
    if (state.seen.includes(need.id) || state.skipped.includes(need.id)) {
      done++
    }
  }

  const pct = total > 0 ? Math.round((done / total) * 100) : 100

  return { done, total, pct }
}

export function isComplete(
  state: OnboardingState,
  available?: Partial<Record<OnboardingNeed['capability'] & string, boolean>>
): boolean {
  return nextNeed(state, available) === null
}
