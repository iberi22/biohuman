/**
 * Deterministic fallback rules engine for coach advice.
 *
 * This module is kept pure, evaluating standard heuristics in a fixed order when a local
 * model is unavailable or unreachable.
 */

export interface Advice {
  id: string
  kind: 'volume' | 'balance' | 'rest'
  text: string
}

export interface RuleInput {
  sessionsLast7d: number
  setsByMuscleGroup: Record<string, number>
  bodyweightKg?: number
}

export function ruleAdvice(input: RuleInput): Advice[] {
  if (!input || typeof input !== 'object') return []

  const advice: Advice[] = []
  const { sessionsLast7d, setsByMuscleGroup } = input

  // Check valid inputs and fallback early if needed.
  if (typeof sessionsLast7d !== 'number' || !setsByMuscleGroup || typeof setsByMuscleGroup !== 'object') {
    return []
  }

  // 1. Rest: When sessionsLast7d >= 6.
  if (sessionsLast7d >= 6) {
    advice.push({
      id: 'rest-rule',
      kind: 'rest',
      text: 'Has entrenado 6 o más días en la última semana. Considera tomar un día de descanso para la recuperación.',
    })
  }

  // Find extremes in muscle groups for balance/volume checks.
  let hasZeroSets = false
  let hasTenOrMoreSets = false
  let lowVolumeGroup: string | null = null

  for (const [group, sets] of Object.entries(setsByMuscleGroup)) {
    if (typeof sets !== 'number') continue
    if (sets === 0) hasZeroSets = true
    if (sets >= 10) hasTenOrMoreSets = true
    if (sets > 0 && sets < 10 && !lowVolumeGroup) {
      // Pick the first one we find that is trained but < 10 sets
      lowVolumeGroup = group
    }
  }

  // 2. Balance: When a muscle group with 0 sets is listed while another has at least 10.
  if (hasZeroSets && hasTenOrMoreSets) {
    advice.push({
      id: 'balance-rule',
      kind: 'balance',
      text: 'Hay un desequilibrio: un grupo muscular no tiene series registradas, mientras que otro tiene 10 o más. Intenta distribuir más el trabajo.',
    })
  }

  // 3. Volume: When a trained muscle group has fewer than 10 sets in 7 days.
  if (lowVolumeGroup) {
    advice.push({
      id: 'volume-rule',
      kind: 'volume',
      text: `El grupo muscular "${lowVolumeGroup}" tiene menos de 10 series semanales. Considera aumentar el volumen para optimizar la hipertrofia.`,
    })
  }

  // Engine deterministically caps its output. The prompt cap is 3, which is exactly how many rules we have,
  // but to be safe and demonstrate the cap explicitly:
  return advice.slice(0, 3)
}
