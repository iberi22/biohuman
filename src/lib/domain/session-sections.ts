/**
 * Session grouping primitives.
 *
 * Adapted from openGym (https://github.com/DuarteSantos8/openGym, AGPL-3.0-or-later,
 * Copyright (C) 2026 Duarte Santos). See NOTICE.md.
 */

type SectionEntry = {
  id?: string
  rid?: string | null
  sg?: string | null
}

export function supersetUnits(items: readonly SectionEntry[]): number[][] {
  const units: number[][] = []
  items.forEach((e, i) => {
    const prev = items[i - 1]
    if (i > 0 && e.sg && prev && prev.sg && e.sg === prev.sg) {
      units[units.length - 1].push(i)
    } else {
      units.push([i])
    }
  })
  return units
}

export function sessionSections(entries: unknown): { rid: string | null; items: number[]; units: number[][] }[] {
  const list = Array.isArray(entries) ? entries : []
  const sections: { rid: string | null; items: number[] }[] = []
  list.forEach((e, i) => {
    const rid = e?.rid || null
    let section = sections.find((x) => x.rid === rid)
    if (!section) {
      section = { rid, items: [] }
      sections.push(section)
    }
    section.items.push(i)
  })
  return sections.map(({ rid, items }) => ({
    rid,
    items,
    units: supersetUnits(items.map((i) => list[i])).map((unit) => unit.map((k) => items[k])),
  }))
}
