/**
 * Number and speed formatting.
 *
 * Adapted from openGym's `format.js` and `speed.js` (https://github.com/DuarteSantos8/openGym,
 * AGPL-3.0-or-later, Copyright (C) 2026 Duarte Santos). See NOTICE.md.
 *
 * Two departures from upstream, both deliberate:
 *
 * - **No module-level mutable `decimals`.** openGym keeps `let decimals = 1` and every formatter
 *   reads it, so the precision of a number depends on whatever ran last. Here the precision is an
 *   argument: a formatter cannot change another one's output by being called.
 * - **Locale is passed in.** `toLocaleString()` with no locale is the device's, which means the
 *   same log renders differently on two phones. Callers pass the profile's locale explicitly so
 *   two devices reading the same history agree.
 */

/** How many decimals a displayed number carries. */
export type Decimals = 1 | 2

export const DEFAULT_DECIMALS: Decimals = 1

/**
 * Round to the display precision and group the thousands.
 *
 * Rounding happens BEFORE grouping so the grouped string is built from the number the user will
 * actually see, not from a longer one that formats to the same width.
 */
export function fmtNum(n: unknown, decimals: Decimals = DEFAULT_DECIMALS, locale?: string): string {
  const v = Number(n)
  if (!Number.isFinite(v)) return '—'
  const p = decimals === 2 ? 100 : 10
  const rounded = Math.round(v * p) / p
  return rounded.toLocaleString(locale, { maximumFractionDigits: decimals })
}

/**
 * Plate sizes keep their quarter: 1.25 and 21.25 are real numbers on a plate and on a bar, so
 * rounding them to one decimal would print a plate that does not exist.
 */
export function fmtPlate(n: unknown, locale?: string): string {
  const v = Number(n)
  if (!Number.isFinite(v)) return '—'
  return (Math.round(v * 100) / 100).toLocaleString(locale)
}

/**
 * Volume stays in the profile's unit throughout.
 *
 * The old shorthand turned anything over 10,000 into "t", which is wrong for a pound profile and
 * made one list mix "18.8t" with "7'535 kg" — two numbers you cannot compare at a glance.
 */
export const fmtVol = (v: unknown, unit: string, decimals?: Decimals, locale?: string): string =>
  `${fmtNum(v, decimals, locale)} ${unit}`

// --- cardio speed -------------------------------------------------------------------------------

// Exact: the international mile is 1609.344 m.
export const KMH_PER_MPH = 1.609344

/** The unit speeds are shown in. */
export type SpeedUnit = 'kmh' | 'mph'

/** The slice of state that decides which speed unit is on screen. */
export interface SpeedProfile {
  /** An explicit choice wins. */
  speedUnit?: string | null
  /** Otherwise a pounds profile reads miles. */
  unit?: string | null
}

/**
 * The unit speeds are shown in: 'kmh' or 'mph'. Until the profile chooses one it follows the
 * weight unit — a profile in pounds reads mph — so imperial users get miles without looking for a
 * setting, and a kg lifter on an mph treadmill can still pick it.
 */
export function speedUnitOf(S: SpeedProfile | null | undefined): SpeedUnit {
  const s = S?.speedUnit
  if (s === 'mph' || s === 'kmh') return s
  return S?.unit === 'lb' ? 'mph' : 'kmh'
}

/** The unit's short label, as the numbers carry it. */
export const speedLabel = (unit: SpeedUnit): string => (unit === 'mph' ? 'mph' : 'km/h')

/**
 * km/h to the unit on screen.
 *
 * In km/h this is the identity, so a profile that never chose mph sees and stores exactly what it
 * always did. In mph the stored km/h is kept to hundredths: fine enough that any speed typed in
 * mph with up to two decimals reads back as typed, and it keeps a typed "6" from being stored as
 * 9.656064.
 */
export function toSpeed<T extends unknown>(kmh: T, unit: SpeedUnit): T | number {
  if (unit !== 'mph' || kmh == null || kmh === '' || !Number.isFinite(Number(kmh))) return kmh
  return Math.round((Number(kmh) / KMH_PER_MPH) * 100) / 100
}

/** The unit on screen back to km/h — the inverse of `toSpeed`, and the value that is stored. */
export function fromSpeed<T extends unknown>(value: T, unit: SpeedUnit): T | number {
  if (unit !== 'mph' || value == null || value === '' || !Number.isFinite(Number(value)))
    return value
  return Math.round(Number(value) * KMH_PER_MPH * 100) / 100
}

/**
 * "8 km/h" or "5 mph" — a stored km/h speed, shown in `unit`.
 *
 * Speed is stored in km/h everywhere: in a routine, in a logged set, in a shared plan file, and in
 * what the coach and the MCP bridge read. Only what is shown and what is typed follow the unit, so
 * switching it rewrites nothing and two devices never disagree about a number. The weight unit works
 * the other way round, because a load has to land on plates in the unit you load; a speed does not.
 */
export const fmtSpeed = (
  kmh: unknown,
  unit: SpeedUnit,
  decimals?: Decimals,
  locale?: string,
): string => `${fmtNum(toSpeed(Number(kmh) || 0, unit), decimals, locale)} ${speedLabel(unit)}`