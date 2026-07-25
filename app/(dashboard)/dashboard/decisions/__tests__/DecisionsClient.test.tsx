import { fireEvent, render, screen } from '@testing-library/react'
import DecisionsClient from '../DecisionsClient'

jest.mock('next/navigation', () => ({ useRouter: () => ({ refresh: jest.fn() }) }))

it('renders the standalone decisions experience and manual creation form', () => {
  render(<DecisionsClient initialDecisions={[]} />)
  expect(screen.getByRole('heading', { name: 'Decisions' })).toBeInTheDocument()
  expect(screen.getByText(/No decisions yet/)).toBeInTheDocument()
  fireEvent.click(screen.getByRole('button', { name: /Add decision/ }))
  expect(screen.getByRole('heading', { name: 'Add decision' })).toBeInTheDocument()
  expect(screen.getByText('Suggested decisions')).toBeInTheDocument()
  expect(screen.getByText('Verified decisions')).toBeInTheDocument()
  expect(screen.getByText('Archived decisions')).toBeInTheDocument()
})
