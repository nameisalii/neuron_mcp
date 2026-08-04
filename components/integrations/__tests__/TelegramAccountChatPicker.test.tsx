import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import TelegramAccountChatPicker from '../TelegramAccountChatPicker'

const chats = [
  { id: '1', chatId: '1', title: 'Engineering', username: 'eng', chatType: 'channel', selected: false, syncEnabled: false, visibility: 'personal', lastSyncedAt: null, lastMessageAt: null, status: 'discovered' },
  { id: '2', chatId: '2', title: 'Ali private', username: null, chatType: 'private', selected: false, syncEnabled: false, visibility: 'personal', lastSyncedAt: null, lastMessageAt: null, status: 'discovered' },
]

beforeEach(() => {
  global.fetch = jest.fn().mockResolvedValue({ ok: true, json: async () => ({ chats }) } as Response)
})

it('loads, filters, selects, warns, saves, and collapses Telegram chats', async () => {
  const close = jest.fn()
  render(<TelegramAccountChatPicker onClose={close} />)
  expect(await screen.findByText('Engineering')).toBeInTheDocument()
  expect(screen.getByTestId('telegram-chat-list')).toHaveClass('max-h-[420px]', 'overflow-y-auto')
  fireEvent.click(screen.getByRole('button', { name: 'Private' }))
  expect(screen.queryByText('Engineering')).not.toBeInTheDocument()
  fireEvent.click(screen.getByLabelText('Select Ali private'))
  fireEvent.change(screen.getByLabelText('Visibility for Ali private'), { target: { value: 'team' } })
  expect(screen.getByText(/Use Team only/)).toBeInTheDocument()
  fireEvent.click(screen.getByRole('button', { name: 'Save selection' }))
  await waitFor(() => expect(global.fetch).toHaveBeenCalledWith('/api/integrations/telegram/account/chats', expect.objectContaining({ method: 'POST' })))
  fireEvent.click(screen.getByRole('button', { name: 'Done' }))
  expect(close).toHaveBeenCalled()
})
