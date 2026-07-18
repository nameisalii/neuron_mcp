import { render, screen } from '@testing-library/react'
import TeamsIntegrationCard from '../TeamsIntegrationCard'

jest.mock('next/navigation', () => ({ useRouter: () => ({ refresh: jest.fn() }) }))

describe('TeamsIntegrationCard', () => {
  it('renders the not configured state and connect action', () => {
    render(<TeamsIntegrationCard connected={false} />)

    expect(screen.getByText('Microsoft Teams')).toBeInTheDocument()
    expect(screen.getByText('Not configured')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Connect' })).toHaveAttribute('href', '/api/integrations/teams/connect?level=basic')
  })

  it('renders connected controls', () => {
    render(<TeamsIntegrationCard connected teamsSyncEnabled teamName="Ali" />)

    expect(screen.getByText('Connected', { selector: 'span' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'View' })).toHaveAttribute('href', '/dashboard/integrations/teams')
    expect(screen.getByText('Sync Now')).toBeInTheDocument()
    expect(screen.getByText('Nuclear Reset')).toBeInTheDocument()
  })

  it('renders admin consent required state', () => {
    render(<TeamsIntegrationCard connected adminConsentRequired />)

    expect(screen.getByText('Admin consent required')).toBeInTheDocument()
    expect(screen.getByText('Your Microsoft organization requires administrator approval')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Try another Microsoft account' })).toHaveAttribute('href', '/api/integrations/teams/connect?level=teams')
    expect(screen.getByRole('button', { name: 'Copy admin approval instructions' })).toBeInTheDocument()
    expect(screen.getByText(/ChannelMessage.Read.All, Team.ReadBasic.All, and Channel.ReadBasic.All/)).toBeInTheDocument()
  })

  it('keeps basic account connection separate from Teams sync consent', () => {
    render(<TeamsIntegrationCard connected teamName="Ali" />)

    expect(screen.getByText('Microsoft account connected.')).toBeInTheDocument()
    expect(screen.getByText('Teams message sync requires administrator approval from your Microsoft 365 organization.')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Enable Teams message sync' })).toHaveAttribute('href', '/api/integrations/teams/connect?level=teams')
    expect(screen.queryByText('Sync Now')).not.toBeInTheDocument()
  })
})
