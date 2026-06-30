import { render, screen } from '@testing-library/react'
import JiraIntegrationCard from '../JiraIntegrationCard'

jest.mock('next/navigation', () => ({ useRouter: () => ({ refresh: jest.fn() }) }))

describe('JiraIntegrationCard', () => {
  it('renders the not configured state and connect action', () => {
    render(<JiraIntegrationCard connected={false} />)

    expect(screen.getByText('Jira')).toBeInTheDocument()
    expect(screen.getByText('Not configured')).toBeInTheDocument()
    expect(screen.getByText(/Connect Jira to sync recent issues/)).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Connect' })).toHaveAttribute('href', '/api/integrations/jira/connect')
  })

  it('renders connected controls', () => {
    render(<JiraIntegrationCard connected siteName="Example Jira" />)

    expect(screen.getByText('Connected', { selector: 'span' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'View' })).toHaveAttribute('href', '/dashboard/integrations/jira')
    expect(screen.getByText('Sync Now')).toBeInTheDocument()
    expect(screen.getByText('Nuclear Reset')).toBeInTheDocument()
  })

  it('renders permission issue state', () => {
    render(<JiraIntegrationCard connected permissionIssue />)

    expect(screen.getByText('Permission issue')).toBeInTheDocument()
  })
})
