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
    expect(screen.getByText(/Connect your Telegram account to choose chats/)).toBeInTheDocument()
    expect(screen.getByText(/Old Telegram history cannot be imported through the official bot API/)).toBeInTheDocument()
    expect(screen.getByText('Telegram Bot Mode')).toBeInTheDocument()
    expect(screen.queryByText('Import a public Telegram channel')).not.toBeInTheDocument()
    expect(screen.getByText(/cannot read chats where the bot has not been added/i)).toBeInTheDocument()
    expect(screen.getByText('Telegram Account Sync')).toBeInTheDocument()
    expect(screen.getByText(/Primary mode/)).toBeInTheDocument()
    expect(screen.getByText(/accounts you own or are authorized/i)).toBeInTheDocument()
  })

  it('shows Change phone number during pending code and resets without a reload', async () => {
    global.fetch = jest.fn().mockResolvedValue({ ok: true, json: async () => ({ ok: true, status: 'not_connected' }) } as Response)
    render(<TelegramIntegrationCard connected={false} configured botUsername="neuron_mcp_bot" accountSyncEnabled accountStatus="pending_code" />)
    expect(screen.getByText(/Code sent/)).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Change phone number' }))
    await waitFor(() => expect(global.fetch).toHaveBeenCalledWith('/api/integrations/telegram/account/reset-pending', { method: 'POST' }))
    expect(await screen.findByPlaceholderText('+12065550123')).toBeInTheDocument()
  })

  it('shows Change phone number and Cancel login during pending password', () => {
    render(<TelegramIntegrationCard connected={false} configured botUsername="neuron_mcp_bot" accountSyncEnabled accountStatus="pending_password" />)
    expect(screen.getByRole('button', { name: 'Change phone number' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Cancel login' })).toBeInTheDocument()
    expect(screen.getByText(/never stores this password/i)).toBeInTheDocument()
  })

  it('explains that enabled public import is public-only', () => {
    render(<TelegramIntegrationCard connected={false} configured botUsername="neuron_mcp_bot" publicImportEnabled />)
    expect(screen.getByText('Import a public Telegram channel')).toBeInTheDocument()
    expect(screen.getByText(/works only for public Telegram channels/i)).toBeInTheDocument()
    expect(screen.getByPlaceholderText(/@channelname/)).toBeInTheDocument()
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
    expect(screen.getByText(/Telegram Bot Mode is connected/)).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Manage discovered chats' })).toHaveAttribute('href', '/dashboard/integrations/telegram')
    expect(screen.getByRole('link', { name: 'View' })).toHaveAttribute('href', '/dashboard/integrations/telegram')
    expect(screen.getByText('Sync selected')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Disconnect' })).toBeInTheDocument()
    expect(screen.getByText('Nuclear Reset')).toBeInTheDocument()
  })

  it('shows connected account controls and selected summary', () => {
    render(
      <TelegramIntegrationCard
        connected={false}
        configured
        botUsername="neuron_mcp_bot"
        accountSyncEnabled
        accountStatus="connected"
        accountDisplayName="Ali"
        accountSelectedCount={3}
        accountLastSyncAt="2026-07-30T00:00:00.000Z"
      />,
    )
    expect(screen.getByText('Connected as Ali')).toBeInTheDocument()
    expect(screen.getByText(/3 chats selected/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Manage chats' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'View' })).toHaveAttribute('href', '/dashboard/integrations/telegram')
    expect(screen.getAllByRole('button', { name: 'Sync selected' }).length).toBeGreaterThan(0)
  })

  it('does not render raw sync counters or duplicated bot copy after syncing selected chats', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        success: true,
        message: 'Telegram is connected through the Neuron bot. Neuron can ingest new useful messages after the bot is added and connected. Old Telegram history cannot be imported through the official bot API.',
        fetched: 0,
        processed: 0,
        knowledgeCreated: 0,
        synced: 0,
        extracted: 0,
        deliveryMode: 'webhook',
        webhookHealthy: true,
      }),
    } as Response)

    render(
      <TelegramIntegrationCard
        connected
        configured
        botUsername="neuron_mcp_bot"
      />,
    )

    fireEvent.click(screen.getByRole('button', { name: 'Sync selected' }))

    expect(await screen.findByText('Connection healthy. New messages import automatically.')).toBeInTheDocument()
    const visibleText = document.body.textContent ?? ''
    expect(visibleText).not.toContain('0 fetched')
    expect(visibleText).not.toContain('0 processed')
    expect(visibleText).not.toContain('0 created')
    expect(visibleText).not.toContain('0 messages · 0 extracted')
    expect(visibleText).not.toContain('Telegram is connected through the Neuron bot')
  })

  it('shows a concise sync error', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: false,
      json: async () => ({ success: false, error: 'Long provider token/scope/debug failure with internal details' }),
    } as Response)

    render(
      <TelegramIntegrationCard
        connected
        configured
        botUsername="neuron_mcp_bot"
      />,
    )

    fireEvent.click(screen.getByRole('button', { name: 'Sync selected' }))

    expect(await screen.findByText('Connection needs setup.')).toBeInTheDocument()
    expect(document.body.textContent).not.toContain('Long provider token/scope/debug failure')
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
    expect(screen.getByText(/Add the Neuron bot to the group/)).toBeInTheDocument()
    expect(screen.getByText('Bot to add:')).toHaveTextContent('@neuron_mcp_bot')
    expect(screen.getByRole('link', { name: '@neuron_mcp_bot' })).toHaveAttribute('href', 'https://t.me/neuron_mcp_bot')
    expect(await screen.findByText('/start setup-code')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Copy connection command' })).toBeInTheDocument()
    expect(screen.getByText(/BotFather.*setprivacy.*Disable/)).toBeInTheDocument()
    expect(screen.getByText(/cannot read old history.*Only new messages/i)).toBeInTheDocument()

    const visibleText = document.body.textContent ?? ''
    expect(visibleText).not.toContain('TELEGRAM_BOT_TOKEN')
    expect(visibleText).not.toContain('TELEGRAM_WEBHOOK_SECRET')
    expect(visibleText.toLowerCase()).not.toContain('webhook')

    fireEvent.click(screen.getByRole('button', { name: 'Copy connection command' }))
    await waitFor(() => expect(screen.getByText('Connection command copied')).toBeInTheDocument())
  })
})
