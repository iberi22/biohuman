/**
 * Date and formatting primitives the training domain reads.
 *
 * Adapted from openGym (https://github.com/DuarteSantos8/openGym, AGPL-3.0-or-later,
 * Copyright (C) 2026 Duarte Santos). See NOTICE.md.
 *
 * The noon-local trick in `startOfWeek` is load-bearing: a midnight-local Date can land on the
 * previous calendar day in some timezones, which would shift every week grouping by one.
 */

export const SUNDAY = 0
export const MONDAY = 1

/** ISO date (YYYY-MM-DD) for a Date, in local time. */
export const isoOf = (d: Date): string =>
  d.getFullYear() +
  '-' +
  String(d.getMonth() + 1).padStart(2, '0') +
  '-' +
  String(d.getDate()).padStart(2, '0')

/** How many days a weekday sits past the start of its week. 0..6, so it doubles as a column. */
export const weekDayOffset = (day: number, ws: number = MONDAY): number => (day - ws + 7) % 7

/**
 * The Date (noon local, so DST cannot shift the day) that starts the week `iso` falls in.
 */
export function startOfWeek(iso: string, ws: number = MONDAY): Date {
  const d = new Date(iso + 'T12:00:00')
  d.setDate(d.getDate() - weekDayOffset(d.getDay(), ws))
  return d
}

/**
 * A key that is equal for two dates in the same week: the ISO date of the week's first day.
 *
 * Only ever compared or used as a map key — never shown, never stored — so it does not need to
 * be an ISO week number, and being one would be a liability here: "2026-35" is defined
 * Monday-first, and there is no Sunday-first equivalent to fall back to.
 */
export const weekKey = (iso: string, ws: number = MONDAY): string => isoOf(startOfWeek(iso, ws))