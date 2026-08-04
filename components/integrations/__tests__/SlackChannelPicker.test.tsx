import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import SlackChannelPicker from '../SlackChannelPicker'

const conversations = [
  { id: 'C1', name: 'general', type: 'public_channel' as const, isPrivate: false, isDm: false, isGroupDm: false, selected: false, syncEnabled: false, visibility: 'personal' as const, lastSyncedAt: null, lastMessageAt: null },
  { id: 'G1', name: 'leadership', type: 'private_channel' as const, isPrivate: true, isDm: false, isGroupDm: false, selected: false, syncEnabled: false, visibility: 'personal' as const, lastSyncedAt: null, lastMessageAt: null },
  { id: 'D1', name: 'Ali', type: 'im' as const, isPrivate: true, isDm: true, isGroupDm: false, selected: false, syncEnabled: false, visibility: 'personal' as const, lastSyncedAt: null, lastMessageAt: null },
  { id: 'M1', name: 'Project group', type: 'mpim' as const, isPrivate: true, isDm: false, isGroupDm: true, selected: false, syncEnabled: false, visibility: 'personal' as const, lastSyncedAt: null, lastMessageAt: null },
]

beforeEach(() => {
  jest.clearAllMocks()
  global.fetch = jest.fn(async (_url, init) => {
    if (init?.method === 'POST') return { ok: true, json: async () => ({ success: true }) } as Response
    return { ok: true, json: async () => ({ conversations }) } as Response
  })
})

it('renders, searches, and filters Slack conversation types', async () => {
  render(<SlackChannelPicker connected />)
  expect(await screen.findByText('#general')).toBeInTheDocument()
  expect(screen.getByText('Private')).toBeInTheDocument()
  expect(screen.getByText('DM')).toBeInTheDocument()
  expect(screen.getByText('Group DM')).toBeInTheDocument()

  fireEvent.change(screen.getByRole('searchbox'), { target: { value: 'lead' } })
  expect(screen.getByText('#leadership')).toBeInTheDocument()
  expect(screen.queryByText('#general')).not.toBeInTheDocument()
})

it('saves selected conversations and warns before sharing a private conversation', async () => {
  render(<SlackChannelPicker connected />)
  await screen.findByText('#leadership')
  fireEvent.click(screen.getByRole('checkbox', { name: /select leadership/i }))
  fireEvent.change(screen.getByLabelText(/visibility for leadership/i), { target: { value: 'team' } })
  expect(screen.getByText(/may share private conversation context/i)).toBeInTheDocument()
  fireEvent.click(screen.getByRole('button', { name: 'Save selection' }))

  await waitFor(() => expect(global.fetch).toHaveBeenCalledWith(
    '/api/integrations/slack/conversations',
    expect.objectContaining({ method: 'POST' }),
  ))
})

it('shows the connect-first empty state', () => {
  render(<SlackChannelPicker connected={false} />)
  expect(screen.getByText('Connect your Slack account first.')).toBeInTheDocument()
})

it('has a bounded scrolling conversation list and visible close actions', async () => {
  const onClose = jest.fn()
  render(<SlackChannelPicker connected onClose={onClose} />)
  await screen.findByText('#general')
  expect(screen.getByTestId('slack-conversation-list')).toHaveClass('max-h-[420px]', 'overflow-y-auto')
  fireEvent.click(screen.getByRole('button', { name: 'Hide' }))
  fireEvent.click(screen.getByRole('button', { name: 'Done' }))
  expect(onClose).toHaveBeenCalledTimes(2)
})

it('disables sync and explains the requirement when nothing is selected', async () => {
  render(<SlackChannelPicker connected />)
  await screen.findByText('#general')
  const sync = screen.getByRole('button', { name: 'Sync selected now' })
  expect(sync).toBeDisabled()
  expect(screen.getByText('Choose at least one conversation before syncing.')).toBeInTheDocument()
})

it('syncs selected conversations through the selected-only endpoint', async () => {
  render(<SlackChannelPicker connected />)
  await screen.findByText('#general')
  fireEvent.click(screen.getByRole('checkbox', { name: /select general/i }))
  fireEvent.click(screen.getByRole('button', { name: 'Sync selected now' }))
  await waitFor(() => expect(global.fetch).toHaveBeenCalledWith(
    '/api/integrations/slack/sync-selected',
    { method: 'POST' },
  ))
})
