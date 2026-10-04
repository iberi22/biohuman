/**
 * The week arithmetic every "this week" number in the app depends on.
 *
 * These are the cases that break silently. A week boundary computed at midnight lands on the
 * previous day in some timezones, which shifts every grouping by one without failing anything
 * visible — so the tests here are about boundaries, not about the happy path.
 */
import { describe, expect, it } from 'vitest'
import { isoOf, MONDAY, startOfWeek, SUNDAY, weekDayOffset, weekKey } from './dates'

describe('weekDayOffset', () => {
  it('counts how far a weekday sits past the start of its week', () => {
    // Monday-start: Mon 0 … Sun 6
    expect(weekDayOffset(1, MONDAY)).toBe(0)
    expect(weekDayOffset(7, MONDAY)).toBe(6)
    // Sunday-start: Sun 0 … Sat 6
    expect(weekDayOffset(0, SUNDAY)).toBe(0)
    expect(weekDayOffset(6, SUNDAY)).toBe(6)
  })

  it('wraps Sunday to the end of a Monday week', () => {
    expect(weekDayOffset(0, MONDAY)).toBe(6)
  })

  it('defaults to a Monday week', () => {
    expect(weekDayOffset(0)).toBe(6)
  })
})

describe('startOfWeek', () => {
  // 2026-09-07 is a Monday; 2026-09-13 the Sunday after it.
  it('returns the Monday of that week', () => {
    expect(isoOf(startOfWeek('2026-09-07', MONDAY))).toBe('2026-09-07')
    expect(isoOf(startOfWeek('2026-09-13', MONDAY))).toBe('2026-09-07')
    expect(isoOf(startOfWeek('2026-09-12', MONDAY))).toBe('2026-09-07')
  })

  it('returns the Sunday of that week when the week starts on Sunday', () => {
    expect(isoOf(startOfWeek('2026-09-13', SUNDAY))).toBe('2026-09-13')
    expect(isoOf(startOfWeek('2026-09-07', SUNDAY))).toBe('2026-09-06')
  })

  it('defaults to a Monday week', () => {
    expect(isoOf(startOfWeek('2026-09-13'))).toBe('2026-09-07')
  })

  it('puts every day of a week on the same key', () => {
    for (let d = 7; d <= 13; d++) {
      expect(isoOf(startOfWeek(`2026-09-${String(d).padStart(2, '0')}`, MONDAY))).toBe('2026-09-07')
    }
  })

  it('survives a month and a year boundary', () => {
    expect(isoOf(startOfWeek('2026-01-01', MONDAY))).toBe('2025-12-29')
    expect(isoOf(startOfWeek('2026-03-01', MONDAY))).toBe('2026-02-23')
    // 2026-12-31 is a Thursday
    expect(isoOf(startOfWeek('2026-12-31', MONDAY))).toBe('2026-12-28')
  })

  it('handles a leap day', () => {
    // 2024-02-29 is a Thursday
    expect(isoOf(startOfWeek('2024-02-29', MONDAY))).toBe('2024-02-26')
  })

  it('does not shift the day near midnight, which a local-midnight Date would', () => {
    // The Date is built at noon local on purpose: a midnight-local one can land on the previous
    // calendar day in some timezones, moving the whole week by one with no error anywhere.
    const mid = new Date('2026-09-13T12:00:00')
    expect(mid.getDate()).toBe(13)
    expect(isoOf(startOfWeek('2026-09-13', MONDAY))).toBe('2026-09-07')
  })
})

describe('weekKey', () => {
  it('is equal for two dates in the same week', () => {
    expect(weekKey('2026-09-07', MONDAY)).toBe(weekKey('2026-09-13', MONDAY))
    expect(weekKey('2026-09-08', MONDAY)).toBe('2026-09-07')
  })

  it('differs across a week boundary', () => {
    expect(weekKey('2026-09-13', MONDAY)).not.toBe(weekKey('2026-09-14', MONDAY))
  })

  it('moves with the profile week start', () => {
    expect(weekKey('2026-09-07', MONDAY)).toBe('2026-09-07')
    expect(weekKey('2026-09-07', SUNDAY)).toBe('2026-09-06')
  })

  it('defaults to a Monday week', () => {
    expect(weekKey('2026-09-13')).toBe('2026-09-07')
  })

  it('is a plain ISO date, not an ISO week number', () => {
    // "2026-35" is defined Monday-first with no Sunday-first equivalent, so the key is the
    // week's first day instead — it is only ever compared, never shown or stored.
    expect(weekKey('2026-09-07', MONDAY)).toMatch(/^\d{4}-\d{2}-\d{2}$/)
  })
})

describe('isoOf', () => {
  it('formats a local date as YYYY-MM-DD, zero padded', () => {
    expect(isoOf(new Date(2026, 8, 7))).toBe('2026-09-07')
    expect(isoOf(new Date(2026, 0, 1))).toBe('2026-01-01')
    expect(isoOf(new Date(2026, 11, 31))).toBe('2026-12-31')
  })
})