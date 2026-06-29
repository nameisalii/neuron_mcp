import { render, screen } from '@testing-library/react'
import WhatsAppIntegrationCard from '../WhatsAppIntegrationCard'

jest.mock('next/navigation', () => ({ useRouter: () => ({ refresh: jest.fn() }) }))

describe('WhatsAppIntegrationCard', () => {
  it('shows the connect button when WhatsApp Business is not connected', () => {
    render(<WhatsAppIntegrationCard connected={false} />)
    expect(screen.getByRole('button', { name: 'Connect' })).toBeInTheDocument()
    expect(screen.getByText('Not connected')).toBeInTheDocument()
    expect(screen.queryByText('Sync Now')).not.toBeInTheDocument()
  })

  it('shows webhook sync controls when WhatsApp Business is connected', () => {
    render(
      <WhatsAppIntegrationCard
        connected
        teamName="+1 555 123 4567"
        createdAt="2026-06-01T00:00:00.000Z"
        lastSyncAt="2026-06-12T00:00:00.000Z"
      />,
    )

    expect(screen.getByRole('link', { name: 'View' })).toHaveAttribute('href', '/dashboard/integrations/whatsapp')
    expect(screen.getByRole('button', { name: 'Configure' })).toBeInTheDocument()
    expect(screen.getByText('Sync Now')).toBeInTheDocument()
    expect(screen.getByText('Nuclear Reset')).toBeInTheDocument()
    expect(screen.getByText('Connected', { selector: 'span' })).toBeInTheDocument()
    expect(screen.getByText('Connected to +1 555 123 4567')).toBeInTheDocument()
  })
})
