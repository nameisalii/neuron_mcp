import { render, screen } from '@testing-library/react'
import TelegramIntegrationCard from '../TelegramIntegrationCard'

jest.mock('next/navigation', () => ({ useRouter: () => ({ refresh: jest.fn() }) }))

describe('TelegramIntegrationCard', () => {
  it('renders the not configured state, webhook URL, and configure action', () => {
    render(
      <TelegramIntegrationCard
        connected={false}
        configured={false}
        webhookUrl="https://example.com/api/integrations/telegram/webhook"
      />,
    )

    expect(screen.getByText('Telegram')).toBeInTheDocument()
    expect(screen.getByText('Not configured')).toBeInTheDocument()
    expect(screen.getByText('https://example.com/api/integrations/telegram/webhook')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Configure' })).toBeInTheDocument()
    expect(screen.getByText(/Old chat history is not available through the official bot API/)).toBeInTheDocument()
  })

  it('renders connected controls', () => {
    render(
      <TelegramIntegrationCard
        connected
        configured
        webhookUrl="https://example.com/api/integrations/telegram/webhook"
      />,
    )

    expect(screen.getByText('Connected', { selector: 'span' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'View' })).toHaveAttribute('href', '/dashboard/integrations/telegram')
    expect(screen.getByText('Sync Now')).toBeInTheDocument()
    expect(screen.getByText('Nuclear Reset')).toBeInTheDocument()
  })
})
