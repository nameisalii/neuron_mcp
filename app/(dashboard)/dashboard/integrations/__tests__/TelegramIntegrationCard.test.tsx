import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import TelegramIntegrationCard from '../TelegramIntegrationCard'

jest.mock('next/navigation', () => ({ useRouter: () => ({ refresh: jest.fn() }) }))

describe('TelegramIntegrationCard', () => {
  beforeEach(() => {
    jest.restoreAllMocks()
  })

  it('renders the not configured state and configure action', () => {
    render(
      <TelegramIntegrationCard
        connected={false}
        configured={false}
        botUsername="neuron_mcp_bot"
      />,
    )

    expect(screen.getByText('Telegram')).toBeInTheDocument()
    expect(screen.getByText('Not configured')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Configure' })).toBeInTheDocument()
    expect(screen.getAllByText(/Telegram is not connected yet/).length).toBeGreaterThan(0)
    expect(screen.getByText(/Old Telegram history cannot be imported through the official bot API/)).toBeInTheDocument()
  })

  it('renders connected controls', () => {
    render(
      <TelegramIntegrationCard
        connected
        configured
        botUsername="neuron_mcp_bot"
      />,
    )

    expect(screen.getByText('Connected', { selector: 'span' })).toBeInTheDocument()
    expect(screen.getByText(/Telegram is connected. Neuron will capture new useful messages/)).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'View' })).toHaveAttribute('href', '/dashboard/integrations/telegram')
    expect(screen.getByText('Sync Now')).toBeInTheDocument()
    expect(screen.getByText('Nuclear Reset')).toBeInTheDocument()
  })

  it('shows public user setup copy without developer-only instructions', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        configured: true,
        connected: false,
        botUsername: 'neuron_mcp_bot',
        setupCommand: '/start setup-code',
        message: 'Copy this command and send it in the Telegram group/channel where you added the Neuron bot.',
      }),
    } as Response)
    Object.assign(navigator, {
      clipboard: { writeText: jest.fn().mockResolvedValue(undefined) },
    })

    render(
      <TelegramIntegrationCard
        connected={false}
        configured
        botUsername="neuron_mcp_bot"
      />,
    )

    fireEvent.click(screen.getByRole('button', { name: 'Configure' }))

    expect(await screen.findByText('Connect Telegram to Neuron')).toBeInTheDocument()
    expect(screen.getByText(/Add the Neuron bot to the group or channel/)).toBeInTheDocument()
    expect(screen.getByText('Bot to add:')).toHaveTextContent('@neuron_mcp_bot')
    expect(await screen.findByText('/start setup-code')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Copy connection command' })).toBeInTheDocument()

    const visibleText = document.body.textContent ?? ''
    expect(visibleText).not.toContain('BotFather')
    expect(visibleText).not.toContain('TELEGRAM_BOT_TOKEN')
    expect(visibleText).not.toContain('TELEGRAM_WEBHOOK_SECRET')
    expect(visibleText.toLowerCase()).not.toContain('webhook')

    fireEvent.click(screen.getByRole('button', { name: 'Copy connection command' }))
    await waitFor(() => expect(screen.getByText('Connection command copied')).toBeInTheDocument())
  })
})
