/**
 * @jest-environment node
 */
import { syncSlackMessages } from '../sync'
import { prisma } from '@/lib/db'
import { WebClient } from '@slack/web-api'

// ─── mocks ────────────────────────────────────────────────────────────────────

jest.mock('@slack/web-api', () => ({
  WebClient: jest.fn().mockImplementation(() => ({
    conversations: {
      list: jest.fn(),
      join: jest.fn().mockResolvedValue({}),
      history: jest.fn(),
    },
  })),
  ErrorCode: { RateLimitedError: 'slack_webapi_rate_limited' },
}))

jest.mock('@/lib/db', () => ({
  prisma: {
    integration: {
      findUnique: jest.fn(),
      update: jest.fn(),
    },
  },
}))

jest.mock('@/lib/crypto', () => ({ decrypt: (s: string) => s }))

// ─── typed references ─────────────────────────────────────────────────────────

const MockWebClient = WebClient as jest.MockedClass<typeof WebClient>
const mockFindUnique = jest.mocked(prisma.integration.findUnique)
const mockUpdate = jest.mocked(prisma.integration.update)

// ─── fixtures ─────────────────────────────────────────────────────────────────

const baseIntegration = {
  workspaceId: 'ws-1',
  type: 'slack',
  accessToken: 'xoxb-token',
  channels: ['C001'],
  lastSyncAt: null,
}

const humanMsg = { text: 'Deploy on Tuesdays only', user: 'U1', ts: '1000.0' }
const botIdMsg = { text: 'Build passed', user: 'U2', ts: '1001.0', bot_id: 'B1' }
const subtypeMsg = { text: 'joined', user: 'U3', ts: '1002.0', subtype: 'bot_message' }
const emptyMsg = { text: '   ', user: 'U4', ts: '1003.0' }

// ─── helpers ──────────────────────────────────────────────────────────────────

function mockHistory(impl: jest.Mock): void {
  MockWebClient.mockImplementation(() => ({
    conversations: { list: jest.fn(), join: jest.fn().mockResolvedValue({}), history: impl },
  }) as unknown as WebClient)
}

function mockClient(impl: { list?: jest.Mock; join?: jest.Mock; history?: jest.Mock }): void {
  MockWebClient.mockImplementation(() => ({
    conversations: {
      list: impl.list ?? jest.fn(),
      join: impl.join ?? jest.fn().mockResolvedValue({}),
      history: impl.history ?? jest.fn().mockResolvedValue(historyResponse([])),
    },
  }) as unknown as WebClient)
}

function historyResponse(messages: object[], nextCursor = '') {
  return { messages, response_metadata: { next_cursor: nextCursor } }
}

// ─── tests ────────────────────────────────────────────────────────────────────

beforeEach(() => {
  jest.clearAllMocks()
  mockFindUnique.mockResolvedValue(baseIntegration as never)
  mockUpdate.mockResolvedValue({} as never)
})

describe('syncSlackMessages', () => {
  it('returns human messages from the channel', async () => {
    mockHistory(jest.fn().mockResolvedValue(historyResponse([humanMsg])))

    const messages = await syncSlackMessages('ws-1')

    expect(messages).toHaveLength(1)
    expect(messages[0]).toMatchObject({ text: 'Deploy on Tuesdays only', user: 'U1', channel: 'C001' })
  })

  it('skips messages that have bot_id', async () => {
    mockHistory(jest.fn().mockResolvedValue(historyResponse([humanMsg, botIdMsg])))

    const messages = await syncSlackMessages('ws-1')

    expect(messages).toHaveLength(1)
    expect(messages[0].user).toBe('U1')
  })

  it('skips messages with subtype bot_message', async () => {
    mockHistory(jest.fn().mockResolvedValue(historyResponse([humanMsg, subtypeMsg])))

    const messages = await syncSlackMessages('ws-1')

    expect(messages).toHaveLength(1)
  })

  it('skips empty/whitespace-only messages', async () => {
    mockHistory(jest.fn().mockResolvedValue(historyResponse([humanMsg, emptyMsg])))

    const messages = await syncSlackMessages('ws-1')

    expect(messages).toHaveLength(1)
  })

  it('does not update lastSyncAt (that is the route handler responsibility)', async () => {
    mockHistory(jest.fn().mockResolvedValue(historyResponse([humanMsg])))

    await syncSlackMessages('ws-1')

    expect(mockUpdate).not.toHaveBeenCalled()
  })

  it('retries once on 429 rate-limit error', async () => {
    const rateLimitError = { code: 'slack_webapi_rate_limited', retryAfter: 0 }
    const historyFn = jest.fn()
      .mockRejectedValueOnce(rateLimitError)
      .mockResolvedValueOnce(historyResponse([humanMsg]))
    mockHistory(historyFn)

    const messages = await syncSlackMessages('ws-1')

    expect(historyFn).toHaveBeenCalledTimes(2)
    expect(messages).toHaveLength(1)
  })

  it('paginates until next_cursor is empty', async () => {
    const msg1 = { text: 'msg-1', user: 'U1', ts: '1.0' }
    const msg2 = { text: 'msg-2', user: 'U1', ts: '2.0' }
    const historyFn = jest.fn()
      .mockResolvedValueOnce(historyResponse([msg1], 'cursor-abc'))
      .mockResolvedValueOnce(historyResponse([msg2]))
    mockHistory(historyFn)

    const messages = await syncSlackMessages('ws-1')

    expect(historyFn).toHaveBeenCalledTimes(2)
    expect(messages).toHaveLength(2)
  })

  it('throws when no Slack integration exists', async () => {
    mockFindUnique.mockResolvedValue(null)

    await expect(syncSlackMessages('ws-1')).rejects.toThrow('No Slack integration found')
  })

  it('returns empty array when channel has no messages', async () => {
    mockHistory(jest.fn().mockResolvedValue(historyResponse([])))

    const messages = await syncSlackMessages('ws-1')

    expect(messages).toHaveLength(0)
  })

  it('discovers only joined public/private channels when no channels are configured', async () => {
    mockFindUnique.mockResolvedValue({ ...baseIntegration, channels: [] } as never)
    const list = jest.fn().mockResolvedValue({
      channels: [
        { id: 'C_JOINED', is_member: true },
        { id: 'C_NOT_JOINED', is_member: false },
        { id: 'G_JOINED', is_member: true },
      ],
      response_metadata: { next_cursor: '' },
    })
    const history = jest.fn().mockResolvedValue(historyResponse([humanMsg]))
    mockClient({ list, history })

    const messages = await syncSlackMessages('ws-1')

    expect(list).toHaveBeenCalledWith(expect.objectContaining({
      types: 'public_channel,private_channel',
    }))
    expect(history).toHaveBeenCalledTimes(2)
    expect(messages).toHaveLength(2)
  })
})
