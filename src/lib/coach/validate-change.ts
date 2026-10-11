/**
 * Adapted from openGym (https://github.com/DuarteSantos8/openGym, AGPL-3.0-or-later,
 * Copyright (C) 2026 Duarte Santos). See NOTICE.md.
 */
export const CHANGE_TYPES = [
  'add-exercise', 'remove-exercise', 'swap-exercise', 'sets', 'reps', 'repsMin',
  'repsMax', 'sec', 'cardio', 'reorder', 'superset', 'routine-prog', 'exercise-prog',
  'inc', 'add-routine', 'remove-routine', 'rename-routine', 'week'
] as const

export const MAX_CHANGES = 25
export const RESERVED_IDS = ['__proto__', 'constructor', 'prototype']

export function validateChangeList(data: any, plan: any) {
  if (!data || typeof data !== 'object' || Array.isArray(data))
    return { ok: false, errors: ['the answer was not an object'] }
  if (data.nochange)
    return { ok: true, nochange: true }
  if (!Array.isArray(data.changes))
    return { ok: false, errors: ['changes must be an array (or set "nochange": true with a "reading")'] }

  const errors: string[] = []
  const validChanges = []
  for (let i = 0; i < Math.min(data.changes.length, MAX_CHANGES); i++) {
    const c = data.changes[i]
    const where = `changes[${i}]`

    if (!c || typeof c !== 'object' || Array.isArray(c)) { errors.push(`${where} is not an object`); continue }
    if (!CHANGE_TYPES.includes(c.type)) { errors.push(`${where}.type "${c.type}" is not allowed — use one of: ${CHANGE_TYPES.join(', ')}`); continue }
    if (typeof c.why !== 'string' || c.why.trim() === '') { errors.push(`${where}.why is required — every change must cite the evidence behind it`); continue }

    const t = c.target || {}
    if (t.routineId && RESERVED_IDS.includes(t.routineId)) { errors.push(`${where}.target.routineId "${t.routineId}" is reserved`); continue }
    if (t.exId && RESERVED_IDS.includes(t.exId)) { errors.push(`${where}.target.exId "${t.exId}" is reserved`); continue }

    let r = null
    if (c.type !== 'add-routine' && c.type !== 'week') {
      r = (plan?.routines || []).find((r: any) => r.id === t.routineId)
      if (!r) { errors.push(`${where}.target.routineId "${t.routineId}" is not one of the routines`); continue }
    }

    const needsExId = ['remove-exercise', 'swap-exercise', 'sets', 'reps', 'repsMin', 'repsMax', 'sec', 'cardio', 'exercise-prog', 'inc', 'superset']
    if (needsExId.includes(c.type) && r && !(r.ex || []).find((e: any) => e.id === t.exId)) {
      errors.push(`${where}.target.exId "${t.exId}" not in routine`); continue
    }

    // after is dropped on purpose so a hostile payload cannot ride along on a legal type in this slice
    const safeId = typeof c.id === 'string' ? c.id.trim().slice(0, 40) : ''
    validChanges.push({
      id: safeId !== '' ? safeId : `c${i}`,
      type: c.type,
      why: c.why.trim().slice(0, 600),
      target: {
        ...(typeof t.routineId === 'string' && { routineId: t.routineId }),
        ...(typeof t.exId === 'string' && { exId: t.exId }),
        ...(Number.isInteger(t.weekday) && t.weekday >= 0 && t.weekday <= 6 && { weekday: t.weekday })
      }
    })
  }

  return errors.length > 0 ? { ok: false, errors } : { ok: true, changes: validChanges }
}
