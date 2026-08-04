/** @jest-environment node */
import { POST as start } from '../start/route'
import { POST as verifyPassword } from '../verify-password/route'
import { prisma } from '@/lib/db'
import { sendLoginCode, signInWithPassword } from '@/lib/telegram/accountClient'
import { decryptTelegramState, encryptTelegramState } from '@/lib/telegram/accountCrypto'

jest.mock('@/lib/db', () => ({
  prisma: {
    telegramAccountConnection: { upsert: jest.fn(), update: jest.fn() },
    activityEvent: { create: jest.fn() },
  },
}))
jest.mock('@/lib/telegram/accountClient', () => ({
  sendLoginCode: jest.fn(),
  signInWithPassword: jest.fn(),
}))
jest.mock('@/lib/telegram/accountCrypto', () => ({
  encryptTelegramState: jest.fn(() => 'encrypted-session'),
  decryptTelegramState: jest.fn(),
}))
jest.mock('@/lib/telegram/accountContext', () => ({
  telegramAccountSyncEnabled: () => process.env.TELEGRAM_ACCOUNT_SYNC_ENABLED === 'true',
  telegramAccountContext: jest.fn(async () => ({
    userId: 'user-1',
    workspaceId: 'ws-1',
    displayName: 'Ali',
    connection: {
      id: 'connection-1',
      status: 'pending_password',
      encryptedSession: 'encrypted-pending-session',
    },
  })),
  auditTelegramAccount: jest.fn(),
}))

beforeEach(() => {
  jest.clearAllMocks()
  process.env.TELEGRAM_ACCOUNT_SYNC_ENABLED = 'true'
})

it('requires the account-sync feature flag before sending a login code', async () => {
  process.env.TELEGRAM_ACCOUNT_SYNC_ENABLED = 'false'
  const response = await start(new Request('http://localhost', {
    method: 'POST',
    body: JSON.stringify({ phoneNumber: '+14155550123' }),
  }))
  expect(response.status).toBe(404)
  expect(sendLoginCode).not.toHaveBeenCalled()
})

it('stores pending login state encrypted and never returns it', async () => {
  jest.mocked(sendLoginCode).mockResolvedValue({ session: 'raw-session', phoneNumber: '+14155550123', phoneCodeHash: 'raw-code-hash' })
  const response = await start(new Request('http://localhost', {
    method: 'POST',
    body: JSON.stringify({ phoneNumber: '+14155550123' }),
  }))
  expect(response.status).toBe(200)
  expect(encryptTelegramState).toHaveBeenCalledWith(expect.objectContaining({ session: 'raw-session', phoneCodeHash: 'raw-code-hash' }))
  const body = JSON.stringify(await response.json())
  expect(body).not.toContain('raw-session')
  expect(body).not.toContain('raw-code-hash')
})

it('uses a 2FA password once and stores only an encrypted session', async () => {
  jest.mocked(decryptTelegramState).mockReturnValue({ kind: 'pending_password', session: 'pending-session' })
  jest.mocked(signInWithPassword).mockResolvedValue({
    session: 'connected-session',
    user: { id: 'tg-1', username: 'ali', displayName: 'Ali' },
  })
  const response = await verifyPassword(new Request('http://localhost', {
    method: 'POST',
    body: JSON.stringify({ password: 'one-time-password' }),
  }))
  expect(response.status).toBe(200)
  expect(signInWithPassword).toHaveBeenCalledWith('pending-session', 'one-time-password')
  const update = jest.mocked(prisma.telegramAccountConnection.update).mock.calls[0][0]
  expect(JSON.stringify(update)).not.toContain('one-time-password')
  expect(update.data).toEqual(expect.objectContaining({ encryptedSession: 'encrypted-session', status: 'connected' }))
})
