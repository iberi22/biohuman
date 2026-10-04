/**
 * Weigh-ins read back week by week.
 *
 * Adapted from openGym (https://github.com/DuarteSantos8/openGym, AGPL-3.0-or-later,
 * Copyright (C) 2026 Duarte Santos). See NOTICE.md.
 *
 * From one morning to the next, body weight moves with water, salt and the last meal by more than
 * it moves in a month, so the number worth following is the week's mean — the one a single weigh-in
 * on the card cannot give you.
 */
import { weekKey } from './dates'

/** One weigh-in. */
export interface WeighIn {
  /** ISO date. */
  d: string
  /** Weight in the profile unit. */
  w: number
}

/** One week of weigh-ins, with the mean and the change from the previous week. */
export interface WeightWeek {
  /** ISO date of the first day of the week. */
  key: string
  /** How many weigh-ins it holds. */
  n: number
  /** The week's mean. */
  avg: number
  /** Change of the mean from the previous week that has any; null for the first. */
  delta: number | null
  /** The week's weigh-ins, newest first. */
  entries: WeighIn[]
}

/**
 * The weigh-ins grouped into weeks, newest week first. Each week carries its mean, how many
 * weigh-ins it holds, the change of its mean from the week before it that has any (null for the
 * first), and its entries newest first. `ws` is the first day of the week, so the weeks are the
 * ones the calendar and the week strip show. The stored order is not relied on, and an entry with
 * no day or no weight is skipped rather than averaged in as 0.
 */
export function weeklyWeights(bodyweight: WeighIn[] | null | undefined, ws: number): WeightWeek[] {
  const byWeek = new Map<string, WeighIn[]>()
  for (const b of Array.isArray(bodyweight) ? bodyweight : []) {
    if (!b?.d || !(Number(b.w) > 0)) continue
    const key = weekKey(b.d, ws)
    if (!byWeek.has(key)) byWeek.set(key, [])
    byWeek.get(key)!.push(b)
  }
  const weeks: WeightWeek[] = [...byWeek.keys()].sort().map(key => {
    const entries = byWeek.get(key)!.slice().sort((a, b) => (a.d < b.d ? 1 : a.d > b.d ? -1 : 0))
    return {
      key,
      n: entries.length,
      avg: entries.reduce((sum, b) => sum + Number(b.w), 0) / entries.length,
      delta: null,
      entries,
    }
  })
  weeks.forEach((week, i) => {
    week.delta = i ? week.avg - weeks[i - 1].avg : null
  })
  return weeks.reverse()
}