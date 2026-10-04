/**
 * Ported from openGym's `TabBar` behaviour, with the JSX replaced by pure calls.
 *
 * The central button is the only control whose label depends on state, and getting it wrong is
 * user-visible: it must never offer "Start" while a session is in progress, or "Resume" from the
 * workout screen where there is nothing to resume.
 */
import { describe, expect, it } from 'vitest'
import { isTabActive, resolveStart, startableRoutines, startAction, TABS } from './tabbar'

describe('tab highlighting', () => {
  it('lights the tab a route belongs to, including the aliased ones', () => {
    expect(isTabActive('home', 'home')).toBe(true)
    expect(isTabActive('plan', 'plan')).toBe(true)
    expect(isTabActive('stats', 'stats')).toBe(true)
    expect(isTabActive('library', 'library')).toBe(true)

    // detail screens light the tab you reached them from
    expect(isTabActive('stats', 'history')).toBe(true)
    expect(isTabActive('stats', 'structural-balance')).toBe(true)
    expect(isTabActive('library', 'muscles')).toBe(true)
    expect(isTabActive('home', 'settings')).toBe(true)
  })

  it('does not light two tabs at once', () => {
    for (const route of ['home', 'plan', 'stats', 'library', 'history', 'settings', 'muscles']) {
      expect(TABS.filter(t => isTabActive(t.key, route)).length).toBe(1)
    }
  })

  it('leaves every tab dark on a route that belongs to none of them', () => {
    expect(TABS.some(t => isTabActive(t.key, 'workout'))).toBe(false)
    expect(TABS.some(t => isTabActive(t.key, 'nonsense'))).toBe(false)
  })
})

describe('startAction', () => {
  it('reads Start when there is no session', () => {
    expect(startAction('home', null)).toEqual({ icon: 'dumbbell', label: 'Start', resume: false, on: false })
    expect(startAction('plan', undefined)).toMatchObject({ label: 'Start', resume: false })
  })

  it('reads Resume elsewhere while a session is in progress', () => {
    expect(startAction('home', { cur: 'bench' })).toEqual({ icon: 'play', label: 'Resume', resume: true, on: false })
    expect(startAction('library', { cur: 'squat' })).toMatchObject({ icon: 'play', label: 'Resume' })
  })

  it('reads Workout on the workout screen, because there is nothing to resume', () => {
    expect(startAction('workout', { cur: 'bench' })).toEqual({
      icon: 'dumbbell',
      label: 'Workout',
      resume: true,
      on: true,
    })
  })

  it('distinguishes resuming from editing a finished workout', () => {
    expect(startAction('home', { editingWorkoutId: 'w12' })).toMatchObject({ label: 'Edit workout' })
    expect(startAction('home', { editingWorkoutId: null })).toMatchObject({ label: 'Resume' })
  })

  it('never offers Start while a session is running', () => {
    for (const route of ['home', 'plan', 'stats', 'library', 'workout']) {
      expect(startAction(route, { cur: 'x' }).label).not.toBe('Start')
    }
  })

  it('stays lit on the workout screen only when there is a session to be lit for', () => {
    expect(startAction('workout', { cur: 'x' }).on).toBe(true)
    expect(startAction('home', { cur: 'x' }).on).toBe(false)
  })
})

describe('startableRoutines', () => {
  it('keeps only the routines that actually hold exercises', () => {
    expect(startableRoutines(['a', 'b', 'c'], { a: 3, b: 0, c: 1 })).toEqual(['a', 'c'])
  })

  it('treats a routine with no entry as empty rather than as an error', () => {
    expect(startableRoutines(['a'], {})).toEqual([])
    expect(startableRoutines([], { a: 3 })).toEqual([])
  })

  it('preserves the order they were scheduled in', () => {
    expect(startableRoutines(['c', 'a'], { a: 1, c: 1 })).toEqual(['c', 'a'])
  })
})

describe('resolveStart', () => {
  const counts = { push: 3, pull: 2, rest: 0 }

  it('starts the day\'s routines directly when any of them has exercises', () => {
    expect(resolveStart(null, ['push', 'pull'], counts)).toEqual({ routines: ['push', 'pull'] })
    expect(resolveStart(null, ['rest'], counts)).toEqual({ routines: null })
  })

  it('falls through to the picker when the day is empty', () => {
    expect(resolveStart(null, [], counts)).toEqual({ routines: null })
    expect(resolveStart(null, ['rest'], counts)).toEqual({ routines: null })
  })

  it('goes back to the running session rather than starting a new one', () => {
    // tapping the button mid-session must never silently discard the session in progress
    expect(resolveStart({ cur: 'bench' }, ['push'], counts)).toEqual({ routines: null })
  })
})