/**
 * @jest-environment node
 */
import { POST } from '../route'
import { prisma } from '@/lib/db'
import { processSlackMessage } from '@/lib/sync/background'
import { createHmac } from 'crypto'

jest.mock('@/lib/db', () => ({
  prisma: { integration: { findFirst: jest.fn() } },
}))
jest.mock('@/lib/sync/background', () => ({ processSlackMessage: jest.fn() }))

const mockIntegrationFind = jest.mocked(prisma.integration.findFirst)
const mockProcess = jest.mocked(processSlackMessage)

const SECRET = 'test-signing-secret'

function makeSignature(body: string, ts: string): string {
  return `v0=${createHmac('sha256', SECRET).update(`v0:${ts}:${body}`).digest('hex')}`
}

function req(body: unknown, timestamp?: string) {
  const raw = JSON.stringify(body)
  const ts = timestamp ?? String(Math.floor(Date.now() / 1000))
  return new Request('http://localhost/api/integrations/slack/events', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-slack-request-timestamp': ts,
      'x-slack-signature': makeSignature(raw, ts),
    },
    body: raw,
  })
}

beforeEach(() => {
  jest.clearAllMocks()
  process.env.SLACK_SIGNING_SECRET = SECRET
  mockIntegrationFind.mockResolvedValue({ workspaceId: 'ws-1' } as never)
  mockProcess.mockResolvedValue(undefined)
})

describe('POST /api/integrations/slack/events', () => {
  it('returns 401 with invalid signature', async () => {
    const raw = JSON.stringify({ type: 'url_verification', challenge: 'abc' })
    const ts = String(Math.floor(Date.now() / 1000))
    const badReq = new Request('http://localhost/api/integrations/slack/events', {
      method: 'POST',
      headers: {
        'x-slack-request-timestamp': ts,
        'x-slack-signature': 'v0=invalidsignature',
      },
      body: raw,
    })
    const res = await POST(badReq)
    expect(res.status).toBe(401)
  })

  it('returns 401 for stale timestamp', async () => {
    const staleTs = String(Math.floor(Date.now() / 1000) - 600)
    const body = JSON.stringify({ type: 'url_verification', challenge: 'abc' })
    const staleSig = makeSignature(body, staleTs)
    const staleReq = new Request('http://localhost/api/integrations/slack/events', {
      method: 'POST',
      headers: { 'x-slack-request-timestamp': staleTs, 'x-slack-signature': staleSig },
      body,
    })
    const res = await POST(staleReq)
    expect(res.status).toBe(401)
  })

  it('responds to url_verification challenge', async () => {
    const res = await POST(req({ type: 'url_verification', challenge: 'my-challenge' }))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.challenge).toBe('my-challenge')
  })

  it('calls processSlackMessage for message events', async () => {
    const event = { type: 'message', channel: 'C001', user: 'U1', text: 'Hello', ts: '1000.0' }
    await POST(req({ type: 'event_callback', team_id: 'T1', event }))
    expect(mockProcess).toHaveBeenCalledWith('ws-1', event)
  })

  it('ignores message events with subtype', async () => {
    const event = { type: 'message', subtype: 'bot_message', channel: 'C001', user: 'B1', text: 'Bot msg', ts: '1001.0' }
    await POST(req({ type: 'event_callback', team_id: 'T1', event }))
    expect(mockProcess).not.toHaveBeenCalled()
  })

  it('returns 200 ok for unknown event types', async () => {
    const res = await POST(req({ type: 'event_callback', team_id: 'T1', event: { type: 'reaction_added' } }))
    expect(res.status).toBe(200)
    expect(mockProcess).not.toHaveBeenCalled()
  })
})
