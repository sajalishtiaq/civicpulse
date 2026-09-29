import { describe, it, expect } from 'vitest'
import { labelize } from '../lib/format'

describe('labelize', () => {
  it('replaces underscores with spaces', () => {
    expect(labelize('in_progress')).toBe('In progress')
  })

  it('capitalizes the first letter', () => {
    expect(labelize('water')).toBe('Water')
  })
})