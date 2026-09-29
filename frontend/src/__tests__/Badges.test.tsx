import { render, screen } from '@testing-library/react'
import { describe, it, expect } from 'vitest'
import { CategoryChip, PrioritySignal, StatusBadge } from '../components/Badges'

describe('Badges', () => {
  it('renders the category label', () => {
    render(<CategoryChip category="water" />)
    expect(screen.getByText('Water')).toBeInTheDocument()
  })

  it('renders high priority with the word "priority"', () => {
    render(<PrioritySignal priority="high" />)
    expect(screen.getByText(/High priority/)).toBeInTheDocument()
  })

  it('renders the status label', () => {
    render(<StatusBadge status="in_progress" />)
    expect(screen.getByText('In progress')).toBeInTheDocument()
  })
})