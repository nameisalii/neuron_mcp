import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import GmailSetupModal from '../GmailSetupModal'

describe('GmailSetupModal', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    global.fetch = jest.fn()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          labels: [
            { id: 'INBOX', name: 'Inbox', type: 'system', messageCount: 12, unreadCount: 2 },
            { id: 'SENT', name: 'Sent', type: 'system', messageCount: 8, unreadCount: 0 },
            { id: 'STARRED', name: 'Starred', type: 'system', messageCount: 3, unreadCount: 1 },
          ],
        }),
      })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ success: true, estimatedMessages: 12 }) })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ success: true, importedThreads: 1 }) }) as never
  })

  it('renders steps, loads labels, and starts sync', async () => {
    render(
      <GmailSetupModal
        isOpen
        onClose={jest.fn()}
        onConfigured={jest.fn()}
        connected
        initialStep={1}
        metadata={null}
      />,
    )

    expect(await screen.findByText('Inbox')).toBeInTheDocument()
    expect(screen.getByText('Selected: Inbox, Sent')).toBeInTheDocument()
    fireEvent.click(screen.getByText('Next'))
    fireEvent.click(screen.getByRole('button', { name: 'Review' }))
    fireEvent.click(screen.getByText('Start Gmail Sync'))

    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledWith('/api/integrations/gmail/configure', expect.any(Object))
      expect(global.fetch).toHaveBeenCalledWith('/api/integrations/gmail/sync', { method: 'POST' })
    })
    const configureCall = (global.fetch as jest.Mock).mock.calls.find(([url]) => url === '/api/integrations/gmail/configure')
    expect(JSON.parse(configureCall[1].body)).toMatchObject({ selectedLabels: ['INBOX', 'SENT'] })
  })
})
