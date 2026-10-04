/**
 * The tab bar's central action, resolved as a pure function.
 *
 * Adapted from openGym (https://github.com/DuarteSantos8/openGym, AGPL-3.0-or-later,
 * Copyright (C) 2026 Duarte Santos). See NOTICE.md.
 *
 * The button in the middle of a workout app is the one control whose label depends on state: it
 * reads Start when nothing is running, Resume when there is a session in progress, and Workout when
 * you are already on the workout screen. Deciding that in one pure function keeps it testable
 * without a browser and keeps the component down to markup — the `lib/` rule again.
 */

/** The screens the tab bar switches between. */
export type TabKey = 'home' | 'plan' | 'stats' | 'library' | 'workout' | 'history' | 'settings' | 'muscles' | 'structural-balance'

/** Which tab is lit for a given route. */
export const TABS: { key: TabKey; icon: string; href: string }[] = [
  { key: 'home', icon: 'house', href: '/home' },
  { key: 'plan', icon: 'calendar', href: '/plan' },
  { key: 'stats', icon: 'chart', href: '/stats' },
  { key: 'library', icon: 'list', href: '/library' },
]

/**
 * Some routes belong to a tab even though their own name differs, so a detail screen still lights
 * the tab you reached it from: history and structural-balance belong to Stats, muscles to
 * Exercises, settings to Home.
 */
const ALIASES: Partial<Record<TabKey, TabKey>> = {
  history: 'stats',
  'structural-balance': 'stats',
  muscles: 'library',
  settings: 'home',
}

const tabFor = (route: string): TabKey => ALIASES[route as TabKey] ?? (route as TabKey)

/** Is this tab lit on this route? */
export function isTabActive(tab: TabKey, route: string): boolean {
  return tabFor(route) === tab
}

/** A session in progress, as far as the tab bar is concerned. */
export interface ActiveSession {
  /** Which exercise of the session is showing — the marker never moves on its own. */
  cur?: string
  /** Set when the session being resumed is an edit of a finished workout. */
  editingWorkoutId?: string | null
}

/** What the central button does and how it reads. */
export interface StartAction {
  /** Icon name for the button. */
  icon: 'dumbbell' | 'play'
  /** Label for the button. */
  label: 'Start' | 'Resume' | 'Edit workout' | 'Workout'
  /** True when the button is the "resume" marker rather than a plain tab. */
  resume: boolean
  /** True when it is also lit as the current screen. */
  on: boolean
}

/**
 * What the central button shows, given the route and whether a session is in progress.
 *
 * On the workout screen itself there is nothing to resume, so the button reads as the tab it is
 * and stays lit. Anywhere else it brings you back to the exercise you were on — the marker is kept
 * with the session and never moves on its own.
 */
export function startAction(route: string, active: ActiveSession | null | undefined): StartAction {
  const onWorkout = route === 'workout'
  if (!active) {
    return { icon: 'dumbbell', label: 'Start', resume: false, on: onWorkout }
  }
  if (onWorkout) {
    return { icon: 'dumbbell', label: 'Workout', resume: true, on: true }
  }
  return {
    icon: 'play',
    label: active.editingWorkoutId ? 'Edit workout' : 'Resume',
    resume: true,
    on: false,
  }
}

/**
 * What a tap on the central button should do.
 *
 * A weekday can hold several routines; when any of them has exercises the combined session starts
 * directly rather than sending you to the picker first.
 */
export interface StartOutcome {
  /** Routines to start, or null to fall through to the picker. */
  routines: string[] | null
}

/** Ids of the routines scheduled for a weekday that actually hold exercises. */
export function startableRoutines(
  scheduledIds: readonly string[],
  exerciseCountByRoutine: Readonly<Record<string, number>>,
): string[] {
  return scheduledIds.filter(id => (exerciseCountByRoutine[id] ?? 0) > 0)
}

/**
 * Resolve a tap on the central button.
 *
 * No route argument on purpose, matching upstream: tapping the button always means "go to the
 * workout", and the session in progress is the only thing that can override that. A route here
 * would invite a second rule nobody asked for.
 */
export function resolveStart(
  active: ActiveSession | null | undefined,
  scheduledIds: readonly string[],
  exerciseCountByRoutine: Readonly<Record<string, number>>,
): StartOutcome {
  // An in-progress session always wins: tapping the button goes back to it, not to a new one.
  if (active) return { routines: null }
  const routines = startableRoutines(scheduledIds, exerciseCountByRoutine)
  return { routines: routines.length ? routines : null }
}