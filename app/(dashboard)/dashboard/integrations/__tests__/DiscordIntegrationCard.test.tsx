import { render, screen } from '@testing-library/react'
import DiscordIntegrationCard from '../DiscordIntegrationCard'

jest.mock('next/navigation', () => ({ useRouter: () => ({ refresh: jest.fn() }) }))

describe('DiscordIntegrationCard', () => {
  it('shows the connect link when Discord is not connected', () => {
    render(<DiscordIntegrationCard connected={false} />)
    expect(screen.getByRole('link', { name: 'Connect' })).toHaveAttribute('href', '/api/integrations/discord/connect')
    expect(screen.getByText('Not connected')).toBeInTheDocument()
    expect(screen.queryByText('Sync Now')).not.toBeInTheDocument()
  })

  it('shows sync controls when Discord is connected', () => {
    render(
      <DiscordIntegrationCard
        connected
        teamName="Neuron HQ"
        createdAt="2026-06-01T00:00:00.000Z"
        lastSyncAt="2026-06-12T00:00:00.000Z"
      />,
    )

    expect(screen.getByRole('link', { name: 'View' })).toHaveAttribute('href', '/dashboard/integrations/discord')
    expect(screen.getByText('Sync Now')).toBeInTheDocument()
    expect(screen.getByText('Nuclear Reset')).toBeInTheDocument()
    expect(screen.getByText('Connected', { selector: 'span' })).toBeInTheDocument()
    expect(screen.getByText('Connected to Neuron HQ')).toBeInTheDocument()
  })
})
