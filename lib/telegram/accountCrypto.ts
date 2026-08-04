import crypto from 'node:crypto'

const ALGORITHM = 'aes-256-gcm'
const IV_LENGTH = 12
const TAG_LENGTH = 16

function key() {
  const raw = process.env.TELEGRAM_SESSION_ENCRYPTION_KEY
  if (!raw) throw new Error('Telegram session encryption is not configured.')
  const value = Buffer.from(raw, 'hex')
  if (value.length !== 32) throw new Error('TELEGRAM_SESSION_ENCRYPTION_KEY must be 64 hexadecimal characters.')
  return value
}

export function encryptTelegramState(value: unknown): string {
  const iv = crypto.randomBytes(IV_LENGTH)
  const cipher = crypto.createCipheriv(ALGORITHM, key(), iv)
  const encrypted = Buffer.concat([cipher.update(JSON.stringify(value), 'utf8'), cipher.final()])
  return Buffer.concat([iv, cipher.getAuthTag(), encrypted]).toString('base64url')
}

export function decryptTelegramState<T>(value: string): T {
  const buffer = Buffer.from(value, 'base64url')
  const decipher = crypto.createDecipheriv(ALGORITHM, key(), buffer.subarray(0, IV_LENGTH))
  decipher.setAuthTag(buffer.subarray(IV_LENGTH, IV_LENGTH + TAG_LENGTH))
  return JSON.parse(decipher.update(buffer.subarray(IV_LENGTH + TAG_LENGTH), undefined, 'utf8') + decipher.final('utf8')) as T
}
