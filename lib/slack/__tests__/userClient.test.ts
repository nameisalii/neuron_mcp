import { fetchConversationHistory, listUserAccessibleConversations, SlackUserAccessError } from '../userClient'

function client(pages: {
  list?: Array<Record<string, unknown>>
  history?: Array<Record<string, unknown>>
}) {
  return {
    conversations: {
      list: jest.fn()
        .mockResolvedValueOnce(pages.list?.[0] ?? { channels: [], response_metadata: { next_cursor: '' } })
        .mockResolvedValueOnce(pages.list?.[1] ?? { channels: [], response_metadata: { next_cursor: '' } }),
      history: jest.fn()
        .mockResolvedValueOnce(pages.history?.[0] ?? { messages: [], response_metadata: { next_cursor: '' } })
        .mockResolvedValueOnce(pages.history?.[1] ?? { messages: [], response_metadata: { next_cursor: '' } }),
    },
  }
}

it('lists and paginates conversations available to the Slack user', async () => {
  const api = client({ list: [
    { channels: [{ id: 'C1', name: 'public', is_channel: true }], response_metadata: { next_cursor: 'next' } },
    { channels: [{ id: 'D1', is_im: true, user: 'U2' }], response_metadata: { next_cursor: '' } },
  ] })
  const conversations = await listUserAccessibleConversations({ client: api as never, maxConversations: 10 })
  expect(conversations.map((item) => item.id)).toEqual(['C1', 'D1'])
  expect(api.conversations.list).toHaveBeenCalledWith(expect.objectContaining({
    types: 'public_channel,private_channel,mpim,im',
  }))
})

it('fetches bounded conversation history without logging message content', async () => {
  const api = client({ history: [{
    messages: [{ ts: '2.0', text: 'Private launch plan', user: 'U1' }],
    response_metadata: { next_cursor: '' },
  }] })
  const messages = await fetchConversationHistory({
    client: api as never, channelId: 'D1', oldest: '1.0', maxMessages: 20,
  })
  expect(messages).toEqual([{ ts: '2.0', text: 'Private launch plan', user: 'U1', channel: 'D1' }])
  expect(api.conversations.history).toHaveBeenCalledWith(expect.objectContaining({ limit: 20 }))
})

it('maps missing scopes to a friendly setup error', async () => {
  const api = client({})
  api.conversations.list.mockReset()
  api.conversations.list.mockRejectedValueOnce({ data: { error: 'missing_scope' } })
  await expect(listUserAccessibleConversations({ client: api as never }))
    .rejects.toMatchObject<Partial<SlackUserAccessError>>({ code: 'missing_scope', requiresAdmin: true })
})
