import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { DisconnectIntegrationButton } from '../IntegrationCardUi'

const mockRefresh = jest.fn()

jest.mock('next/navigation', () => ({ useRouter: () => ({ refresh: mockRefresh }) }))

beforeEach(() => {
  jest.clearAllMocks()
})

it('opens and cancels the disconnect confirmation without calling the API', () => {
  global.fetch = jest.fn()
  render(<DisconnectIntegrationButton type="telegram" />)

  fireEvent.click(screen.getByRole('button', { name: 'Disconnect' }))

  expect(screen.getByRole('dialog', { name: 'Disconnect Telegram?' })).toBeInTheDocument()
  expect(screen.getByText(/Existing imported knowledge stays in Neuron/)).toBeInTheDocument()
  expect(screen.getByText(/Connected channels or webhook bindings will also be removed/)).toBeInTheDocument()
  expect(screen.getByText(/Also delete imported knowledge items and attachments from Telegram/)).toBeInTheDocument()

  fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))

  expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  expect(global.fetch).not.toHaveBeenCalled()
})

it('confirms disconnect and refreshes the page state', async () => {
  global.fetch = jest.fn().mockResolvedValue({
    ok: true,
    json: async () => ({ success: true }),
  } as Response)

  render(<DisconnectIntegrationButton type="gmail" />)
  fireEvent.click(screen.getByRole('button', { name: 'Disconnect' }))
  fireEvent.click(screen.getAllByRole('button', { name: 'Disconnect' })[1])

  await waitFor(() => {
    expect(global.fetch).toHaveBeenCalledWith('/api/integrations/gmail/disconnect', expect.objectContaining({
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ deleteKnowledgeItems: false }),
    }))
  })
  expect(mockRefresh).toHaveBeenCalled()
})

it('includes the delete knowledge option when selected', async () => {
  global.fetch = jest.fn().mockResolvedValue({
    ok: true,
    json: async () => ({ success: true }),
  } as Response)

  render(<DisconnectIntegrationButton type="slack" />)
  fireEvent.click(screen.getByRole('button', { name: 'Disconnect' }))
  fireEvent.click(screen.getByRole('checkbox', { name: /Also delete imported knowledge items/i }))
  fireEvent.click(screen.getAllByRole('button', { name: 'Disconnect and delete' })[0])

  await waitFor(() => {
    expect(global.fetch).toHaveBeenCalledWith('/api/integrations/slack/disconnect', expect.objectContaining({
      method: 'POST',
      body: JSON.stringify({ deleteKnowledgeItems: true }),
    }))
  })
})

it('shows a concise disconnect failure', async () => {
  global.fetch = jest.fn().mockResolvedValue({
    ok: false,
    json: async () => ({ error: 'provider token debug output' }),
  } as Response)

  render(<DisconnectIntegrationButton type="slack" />)
  fireEvent.click(screen.getByRole('button', { name: 'Disconnect' }))
  fireEvent.click(screen.getAllByRole('button', { name: 'Disconnect' })[1])

  expect(await screen.findByText('Could not disconnect Slack. Please try again.')).toBeInTheDocument()
  expect(document.body.textContent).not.toContain('provider token debug output')
})
