import { describe, expect, it } from 'vitest'
import { supersetUnits, sessionSections } from './session-sections'

describe('supersetUnits', () => {

  it('pairs adjacent entries without mutating the source and keeps the display units contiguous', () => {
    const entries = [{ id: 'a' }, { id: 'b', sg: 'sg-new' }, { id: 'c', sg: 'sg-new' }]
    const entriesCopy = [...entries]

    expect(supersetUnits(entries)).toEqual([[0], [1, 2]])
    expect(entries).toEqual(entriesCopy)
  })

})

describe('sessionSections', () => {
  it('splits by routine in the order each first appears and pairs supersets only inside a section', () => {
    const entries = [
      { id: 'a', rid: 'A', sg: 'x' },
      { id: 'b', rid: 'B', sg: 'x' },
      { id: 'c', rid: 'B', sg: 'y' },
      { id: 'd', rid: 'B', sg: 'y' },
      { id: 'e', rid: 'A' },
    ]
    expect(sessionSections(entries)).toEqual([
      { rid: 'A', items: [0, 4], units: [[0], [4]] },
      { rid: 'B', items: [1, 2, 3], units: [[1], [2, 3]] },
    ])
  })

  it('keeps a workout without routines as one section, the flat list', () => {
    const entries = [{ id: 'a', sg: 'x' }, { id: 'b', sg: 'x' }, { id: 'c' }]
    expect(sessionSections(entries)).toEqual([
      { rid: null, items: [0, 1, 2], units: [[0, 1], [2]] }
    ])
  })

  it('returns an empty array for undefined', () => {
    expect(sessionSections(undefined)).toEqual([])
  })
})
