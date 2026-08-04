/** @jest-environment node */
import { decryptTelegramState, encryptTelegramState } from '../accountCrypto'

beforeEach(() => {
  process.env.TELEGRAM_SESSION_ENCRYPTION_KEY = '11'.repeat(32)
})

afterEach(() => {
  delete process.env.TELEGRAM_SESSION_ENCRYPTION_KEY
})

it('encrypts Telegram sessions without storing their raw value', () => {
  const value = { kind: 'connected', session: 'secret-session-value' }
  const encrypted = encryptTelegramState(value)
  expect(encrypted).not.toContain(value.session)
  expect(decryptTelegramState(encrypted)).toEqual(value)
})

it('rejects an invalid Telegram session encryption key without exposing it', () => {
  process.env.TELEGRAM_SESSION_ENCRYPTION_KEY = 'invalid-key'
  expect(() => encryptTelegramState({ session: 'secret' }))
    .toThrow('TELEGRAM_SESSION_ENCRYPTION_KEY must be 64 hexadecimal characters.')
})
