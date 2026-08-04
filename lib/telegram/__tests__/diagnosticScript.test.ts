/** @jest-environment node */
import { execFileSync } from 'node:child_process'
import path from 'node:path'

it('prints Telegram account configuration checks without printing secret values', () => {
  const apiHash = 'do-not-print-api-hash'
  const encryptionKey = 'ab'.repeat(32)
  const output = execFileSync(
    process.execPath,
    [path.join(process.cwd(), 'scripts/check-telegram-account-config.mjs')],
    {
      encoding: 'utf8',
      env: {
        ...process.env,
        TELEGRAM_ACCOUNT_SYNC_ENABLED: 'true',
        TELEGRAM_API_ID: '123456',
        TELEGRAM_API_HASH: apiHash,
        TELEGRAM_SESSION_ENCRYPTION_KEY: encryptionKey,
      },
    },
  )
  expect(output).toContain('TELEGRAM_ACCOUNT_SYNC_ENABLED true')
  expect(output).toContain('TELEGRAM_API_HASH present true')
  expect(output).toContain('TELEGRAM_SESSION_ENCRYPTION_KEY valid true')
  expect(output).not.toContain(apiHash)
  expect(output).not.toContain(encryptionKey)
  expect(output).not.toContain('123456')
})
