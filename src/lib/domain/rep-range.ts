/**
 * Normalize the two bounds used by double progression.
 *
 * Adapted from openGym (https://github.com/DuarteSantos8/openGym, AGPL-3.0-or-later,
 * Copyright (C) 2026 Duarte Santos). See NOTICE.md.
 *
 * `reps` is the upper bound and `repsMin` is the lower bound in persisted configs. A range where
 * the lower bound reaches or passes the upper bound is not a range — it would ask the lifter to
 * hit a number they have already passed — so the upper bound is raised instead.
 */

/** A rep range, aligned to the exercise's stride. */
export interface RepRange {
  /** Upper bound. */
  reps: number
  /** Lower bound. */
  repsMin: number
}

function align(value: number, stride: number): number {
  return Math.max(stride, Math.ceil(value / stride) * stride)
}

function positiveInt(value: unknown, fallback: number): number {
  const n = Number(value)
  return Number.isFinite(n) && n > 0 ? Math.max(1, Math.round(n)) : fallback
}

export function normalizeRepRange(reps: unknown, repsMin: unknown, stride: unknown = 1): RepRange {
  const step = Number.isInteger(stride) && (stride as number) > 0 ? (stride as number) : 1
  const upper = align(positiveInt(reps, 10), step)
  const lower = align(positiveInt(repsMin, Math.max(1, upper - 2)), step)
  return lower >= upper
    ? { reps: lower + step, repsMin: lower }
    : { reps: upper, repsMin: lower }
}