import {
  SETUP_CODE_TTL_MS,
  clearSetupCode,
  generateSetupCode,
  isSetupCodeUsable,
} from '../setupCode'

const NOW = new Date('2026-07-30T20:00:00.000Z')

function metadataFor(code: string, expiresAt: string | null | undefined, extra: Record<string, unknown> = {}) {
  return { status: 'pending', ...extra, setupCode: code, setupCodeExpiresAt: expiresAt }
}

describe('generateSetupCode', () => {
  // Spec 1 — unique per request
  it('mints a different code on every call', () => {
    // Arrange / Act
    const first = generateSetupCode(NOW)
    const second = generateSetupCode(NOW)

    // Assert
    expect(first.code).not.toEqual(second.code)
  })

  it('produces a code the /start binding regex accepts', () => {
    const { code } = generateSetupCode(NOW)
    // bindingCode() in webhook.ts requires [A-Za-z0-9_-]{16,128}
    expect(code).toMatch(/^[A-Za-z0-9_-]{16,128}$/)
  })

  it('sets an expiry one TTL window ahead of now', () => {
    const { expiresAt } = generateSetupCode(NOW)
    expect(new Date(expiresAt).getTime()).toBe(NOW.getTime() + SETUP_CODE_TTL_MS)
  })
})

describe('isSetupCodeUsable', () => {
  // Spec 3 — valid inside the window
  it('accepts a code inside the expiry window', () => {
    const { code, expiresAt } = generateSetupCode(NOW)
    const oneMinuteLater = new Date(NOW.getTime() + 60_000)

    expect(isSetupCodeUsable(metadataFor(code, expiresAt), code, oneMinuteLater)).toBe(true)
  })

  // Spec 2 — expired is rejected
  it('rejects a code older than the expiry window', () => {
    const { code, expiresAt } = generateSetupCode(NOW)
    const pastWindow = new Date(NOW.getTime() + SETUP_CODE_TTL_MS + 1_000)

    expect(isSetupCodeUsable(metadataFor(code, expiresAt), code, pastWindow)).toBe(false)
  })

  it('rejects exactly at the expiry boundary', () => {
    const { code, expiresAt } = generateSetupCode(NOW)
    const atBoundary = new Date(NOW.getTime() + SETUP_CODE_TTL_MS)

    expect(isSetupCodeUsable(metadataFor(code, expiresAt), code, atBoundary)).toBe(false)
  })

  // Spec 8 — fail closed, never open
  it.each([
    ['missing', undefined],
    ['null', null],
    ['unparseable', 'not-a-date'],
    ['empty', ''],
  ])('treats a %s expiry as expired rather than valid', (_label, expiresAt) => {
    const { code } = generateSetupCode(NOW)
    expect(isSetupCodeUsable(metadataFor(code, expiresAt as string | null | undefined), code, NOW)).toBe(false)
  })

  // Spec 6 — a code never binds a chat to a different workspace
  it('rejects a code that does not match the stored one', () => {
    const workspaceA = generateSetupCode(NOW)
    const workspaceB = generateSetupCode(NOW)

    expect(isSetupCodeUsable(metadataFor(workspaceB.code, workspaceB.expiresAt), workspaceA.code, NOW)).toBe(false)
  })

  // Spec 5 — a consumed code cannot be replayed
  it('rejects any code once the stored code has been cleared', () => {
    const { code, expiresAt } = generateSetupCode(NOW)
    const consumed = clearSetupCode(metadataFor(code, expiresAt))

    expect(isSetupCodeUsable(consumed, code, NOW)).toBe(false)
  })

  it('rejects when metadata is absent or not an object', () => {
    const { code } = generateSetupCode(NOW)
    expect(isSetupCodeUsable(null, code, NOW)).toBe(false)
    expect(isSetupCodeUsable(undefined, code, NOW)).toBe(false)
    expect(isSetupCodeUsable(['not', 'an', 'object'], code, NOW)).toBe(false)
  })
})

describe('clearSetupCode', () => {
  // Spec 4 — single use: cleared after a successful bind
  it('removes the code and its expiry after a successful bind', () => {
    const { code, expiresAt } = generateSetupCode(NOW)

    const cleared = clearSetupCode(metadataFor(code, expiresAt))

    expect(cleared.setupCode).toBeUndefined()
    expect(cleared.setupCodeExpiresAt).toBeUndefined()
  })

  it('preserves unrelated metadata fields', () => {
    const { code, expiresAt } = generateSetupCode(NOW)
    const cleared = clearSetupCode(metadataFor(code, expiresAt, { connectedAt: '2026-07-05T02:03:07.945Z' }))

    expect(cleared.status).toBe('pending')
    expect(cleared.connectedAt).toBe('2026-07-05T02:03:07.945Z')
  })

  it('does not mutate the metadata it was given', () => {
    const { code, expiresAt } = generateSetupCode(NOW)
    const original = metadataFor(code, expiresAt)

    clearSetupCode(original)

    expect(original.setupCode).toBe(code)
  })

  it('is safe on absent or non-object metadata', () => {
    expect(clearSetupCode(null)).toEqual({})
    expect(clearSetupCode(undefined)).toEqual({})
  })
})

// Spec 7 — reconnecting after a bind produces a fresh, usable code
describe('rebinding after a successful connect', () => {
  it('mints a usable code even though the previous one was consumed', () => {
    const first = generateSetupCode(NOW)
    const consumed = clearSetupCode(metadataFor(first.code, first.expiresAt))
    expect(isSetupCodeUsable(consumed, first.code, NOW)).toBe(false)

    const later = new Date(NOW.getTime() + 60 * 60_000)
    const second = generateSetupCode(later)

    expect(second.code).not.toEqual(first.code)
    expect(isSetupCodeUsable(
      { ...consumed, setupCode: second.code, setupCodeExpiresAt: second.expiresAt },
      second.code,
      later,
    )).toBe(true)
  })
})
