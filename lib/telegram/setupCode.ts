import { randomBytes } from 'node:crypto'

/**
 * Telegram setup-code lifecycle.
 *
 * The setup code is a workspace-binding credential: whoever presents it in a
 * Telegram chat binds that chat to the workspace. It must therefore be unique
 * per request, short-lived, and consumed on use — a permanent reusable code
 * lets anyone who ever saw it bind arbitrary chats, forever.
 *
 * These helpers are pure so they can be tested directly; `bindChat` in
 * webhook.ts is not exported.
 */

/** How long a freshly minted setup code stays valid. */
export const SETUP_CODE_TTL_MS = 15 * 60 * 1000

/** Bytes of entropy per code. 18 bytes -> 24 base64url chars, 144 bits. */
const SETUP_CODE_BYTES = 18

export interface GeneratedSetupCode {
  code: string
  expiresAt: string
}

type Metadata = Record<string, unknown>

function asMetadata(metadata: unknown): Metadata {
  if (!metadata || typeof metadata !== 'object' || Array.isArray(metadata)) return {}
  return metadata as Metadata
}

/**
 * Mints a fresh code and its expiry. Always new — never reuses a stored code.
 *
 * The alphabet is base64url, which satisfies the `[A-Za-z0-9_-]{16,128}`
 * contract that `bindingCode()` in webhook.ts enforces on `/start <code>`.
 */
export function generateSetupCode(now: Date = new Date()): GeneratedSetupCode {
  return {
    code: randomBytes(SETUP_CODE_BYTES).toString('base64url'),
    expiresAt: new Date(now.getTime() + SETUP_CODE_TTL_MS).toISOString(),
  }
}

/**
 * True only when `presentedCode` matches the stored code AND that code has not
 * expired.
 *
 * Fails closed: absent, empty, or unparseable expiry is treated as expired, so
 * a malformed metadata row can never grant an unlimited-lifetime credential.
 */
export function isSetupCodeUsable(metadata: unknown, presentedCode: string, now: Date = new Date()): boolean {
  const stored = asMetadata(metadata)

  const storedCode = stored.setupCode
  if (typeof storedCode !== 'string' || storedCode.length === 0) return false
  if (storedCode !== presentedCode) return false

  const expiresAt = stored.setupCodeExpiresAt
  if (typeof expiresAt !== 'string' || expiresAt.length === 0) return false

  const expiryMs = new Date(expiresAt).getTime()
  if (Number.isNaN(expiryMs)) return false

  // Boundary is exclusive: a code is dead the instant it reaches its expiry.
  return now.getTime() < expiryMs
}

/**
 * Returns a copy of `metadata` with the code and expiry removed, making the
 * code single-use. Callers persist this in the same update that binds the chat.
 */
export function clearSetupCode(metadata: unknown): Metadata {
  const { setupCode: _code, setupCodeExpiresAt: _expiresAt, ...rest } = asMetadata(metadata)
  return rest
}
