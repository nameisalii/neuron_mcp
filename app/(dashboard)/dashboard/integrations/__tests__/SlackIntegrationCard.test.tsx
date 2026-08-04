import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import SlackIntegrationCard from '../SlackIntegrationCard'

jest.mock('next/navigation', () => ({ useRouter: () => ({ refresh: jest.fn() }) }))

beforeEach(() => {
  global.fetch = jest.fn(async (url) => ({
    ok: true,
    json: async () => String(url).includes('conversations')
      ? { conversations: [{
        id: 'C1', name: 'general', type: 'public_channel',
        isPrivate: false, isDm: false, isGroupDm: false,
        selected: true, syncEnabled: true, visibility: 'personal',
        lastSyncedAt: null, lastMessageAt: null,
      }] }
      : { success: true, fetched: 3 },
  })) as jest.Mock
})

const connectedUser = {
  teamName: 'Acme',
  externalUserName: 'Ali',
  lastSyncAt: '2026-07-30T12:00:00.000Z',
  selectedCount: 5,
  scopes: ['channels:read'],
  settings: { publicChannels: true, privateChannels: false, groupDms: false, dms: false },
}

it('offers Workspace Bot Mode and Personal Slack Access', () => {
  render(<SlackIntegrationCard botConnection={null} userConnection={null} />)
  expect(screen.getByText('Workspace Bot Mode')).toBeInTheDocument()
  expect(screen.getByText('Personal Slack Access')).toBeInTheDocument()
  expect(screen.getByRole('link', { name: 'Connect bot' })).toHaveAttribute('href', '/api/integrations/slack/connect?mode=bot')
  expect(screen.getByRole('link', { name: 'Connect Slack account' })).toHaveAttribute('href', '/api/integrations/slack/connect?mode=user')
  expect(screen.getByText(/only access Slack conversations your Slack account already has permission/i)).toBeInTheDocument()
  expect(screen.getByText(/require admin approval/i)).toBeInTheDocument()
})

it('keeps the picker collapsed and shows the compact personal Slack summary', () => {
  render(<SlackIntegrationCard botConnection={null} userConnection={connectedUser} />)
  expect(screen.queryByText('Choose Slack channels to sync')).not.toBeInTheDocument()
  expect(screen.getByText('5 conversations selected')).toBeInTheDocument()
  expect(screen.getByText(/Last synced: 7\/30\/2026/)).toBeInTheDocument()
  expect(screen.getByRole('button', { name: 'Manage channels' })).toBeInTheDocument()
  expect(screen.getByRole('button', { name: 'Sync selected' })).toBeInTheDocument()
  expect(screen.getByRole('link', { name: 'View' })).toHaveAttribute('href', '/dashboard/integrations/slack')
  expect(screen.getByTestId('slack-card-actions')).toHaveClass('border-t')
})

it('opens with Manage channels and closes with Hide or Done', async () => {
  render(<SlackIntegrationCard botConnection={null} userConnection={connectedUser} />)
  fireEvent.click(screen.getByRole('button', { name: 'Manage channels' }))
  expect(await screen.findByText('Choose Slack channels to sync')).toBeInTheDocument()
  fireEvent.click(screen.getByRole('button', { name: 'Hide' }))
  expect(screen.queryByText('Choose Slack channels to sync')).not.toBeInTheDocument()

  fireEvent.click(screen.getByRole('button', { name: 'Manage channels' }))
  expect(await screen.findByText('Choose Slack channels to sync')).toBeInTheDocument()
  fireEvent.click(screen.getByRole('button', { name: 'Done' }))
  expect(screen.queryByText('Choose Slack channels to sync')).not.toBeInTheDocument()
})

it('syncs the selected conversations from the compact card', async () => {
  render(<SlackIntegrationCard botConnection={null} userConnection={connectedUser} />)
  fireEvent.click(screen.getByRole('button', { name: 'Sync selected' }))
  await waitFor(() => expect(global.fetch).toHaveBeenCalledWith(
    '/api/integrations/slack/sync-selected',
    { method: 'POST' },
  ))
  expect(await screen.findByText('Synced selected Slack conversations.')).toBeInTheDocument()
})

it('never renders token fields for a personal connection', () => {
  render(<SlackIntegrationCard
    botConnection={null}
    userConnection={{
      teamName: 'Acme', externalUserName: 'Ali', lastSyncAt: null,
      scopes: ['channels:read'], settings: { publicChannels: true, privateChannels: false, groupDms: false, dms: false },
    }}
  />)
  expect(screen.getByText(/Personal Slack Access connected/)).toBeInTheDocument()
  expect(document.body.textContent).not.toMatch(/xox[bpors]-/)
})
