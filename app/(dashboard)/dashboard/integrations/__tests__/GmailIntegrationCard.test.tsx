import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import GmailIntegrationCard from '../GmailIntegrationCard'

jest.mock('next/navigation', () => ({ useRouter: () => ({ refresh: jest.fn() }) }))

describe('GmailIntegrationCard', () => {
  it('shows the connect state when Gmail is not configured', () => {
    render(<GmailIntegrationCard metadata={null} available />)
    expect(screen.getByRole('button', { name: 'Connect Gmail' })).toBeInTheDocument()
    expect(screen.getByText('Available')).toBeInTheDocument()
    expect(screen.queryByText('Sync Now')).not.toBeInTheDocument()
    expect(screen.queryByText('Nuclear Reset')).not.toBeInTheDocument()
    expect(screen.queryByText(/Upcoming|Verification pending|Ready for test users/i)).not.toBeInTheDocument()
  })

  it('shows Gmail verification help only on the Gmail integration', () => {
    render(<GmailIntegrationCard metadata={null} oauthBlocked />)
    expect(screen.getByText(/Gmail connection failed/)).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Connect Gmail' }))
    expect(screen.getByText('Gmail read-only access')).toBeInTheDocument()
    expect(screen.getByText('https://www.googleapis.com/auth/gmail.readonly')).toBeInTheDocument()
  })

  it('shows only missing environment variable names when setup is incomplete', () => {
    render(<GmailIntegrationCard metadata={null} available={false} missingEnv={['GMAIL_CLIENT_ID', 'GMAIL_CLIENT_SECRET']} />)
    expect(screen.getByText(/GMAIL_CLIENT_ID, GMAIL_CLIENT_SECRET/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Connect Gmail' })).toBeDisabled()
  })

  it('explains beta gating and keeps an allowlisted beta user enabled', () => {
    render(<GmailIntegrationCard metadata={null} available betaGated betaUser />)
    expect(screen.getByText(/available to approved beta users while Google restricted-scope verification is finishing/i)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Connect Gmail' })).toBeEnabled()
    expect(screen.getByText('Beta access')).toBeInTheDocument()
  })

  it('blocks a non-beta user and explains why', () => {
    render(<GmailIntegrationCard metadata={null} available={false} betaGated />)
    expect(screen.getByText(/not currently on the approved beta list/i)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Connect Gmail' })).toBeDisabled()
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
    expect(screen.getByText('Sync recent emails')).toBeInTheDocument()
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

    fireEvent.click(screen.getByText('Sync recent emails'))
    fireEvent.click(await screen.findByText('Change Gmail filters'))

    await waitFor(() => {
      expect(screen.getByText('Gmail setup')).toBeInTheDocument()
    })
  })
})
