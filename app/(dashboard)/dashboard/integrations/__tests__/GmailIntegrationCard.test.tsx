import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import GmailIntegrationCard from '../GmailIntegrationCard'

jest.mock('next/navigation', () => ({ useRouter: () => ({ refresh: jest.fn() }) }))

describe('GmailIntegrationCard', () => {
  it('shows the connect state when Gmail is not configured', () => {
    render(<GmailIntegrationCard metadata={null} />)
    expect(screen.getByRole('button', { name: 'Connect' })).toBeInTheDocument()
    expect(screen.getByText('Not connected')).toBeInTheDocument()
    expect(screen.queryByText('Sync Now')).not.toBeInTheDocument()
    expect(screen.queryByText('Nuclear Reset')).not.toBeInTheDocument()
  })

  it('shows sync controls when Gmail is configured', () => {
    render(
      <GmailIntegrationCard
        createdAt="2026-06-01T00:00:00.000Z"
        lastSyncAt="2026-06-12T00:00:00.000Z"
        metadata={{
          configured: true,
          selectedLabels: ['INBOX', 'STARRED'],
          selectedLabelNames: ['Inbox', 'Starred'],
          privacy: 'personal',
          timeWindow: 30,
          senderFilter: [],
          excludeFilter: [],
          maxMessages: 200,
        }}
      />,
    )

    expect(screen.getByRole('link', { name: 'View' })).toHaveAttribute('href', '/dashboard/integrations/gmail')
    expect(screen.getByRole('button', { name: 'Configure' })).toBeInTheDocument()
    expect(screen.getByText('Sync Now')).toBeInTheDocument()
    expect(screen.getByText('Nuclear Reset')).toBeInTheDocument()
    expect(screen.getByText('Connected')).toBeInTheDocument()
  })

  it('opens Gmail filters after a readable zero-result sync', async () => {
    global.fetch = jest.fn()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          success: true,
          importedThreads: 0,
          importedChunks: 0,
          canReadMailbox: true,
          inboxMessagesAvailable: 5,
          sentMessagesAvailable: 5,
          message: 'Gmail is connected, but your selected labels have no matching emails.',
        }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ labels: [] }),
      }) as never

    render(
      <GmailIntegrationCard
        metadata={{
          configured: true,
          selectedLabels: ['IMPORTANT', 'STARRED'],
          selectedLabelNames: ['Important', 'Starred'],
        }}
      />,
    )

    fireEvent.click(screen.getByText('Sync Now'))
    fireEvent.click(await screen.findByText('Change Gmail filters'))

    await waitFor(() => {
      expect(screen.getByText('Gmail setup')).toBeInTheDocument()
    })
  })
})
