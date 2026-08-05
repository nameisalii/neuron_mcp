/** @jest-environment node */
import { getGmailTestUsers, isGmailConnectAllowed, isGmailPublicEnabled, isGmailTestUser } from '../access'

const originalEnv = process.env

beforeEach(() => {
  process.env = { ...originalEnv }
  delete process.env.ENABLE_UPCOMING_INTEGRATION_TESTING
  delete process.env.GMAIL_TEST_USERS
  delete process.env.GMAIL_INTEGRATION_ENABLED
  delete process.env.GMAIL_PUBLIC_ENABLED
})

afterAll(() => {
  process.env = originalEnv
})

describe('Gmail access gating', () => {
  it('blocks connection when testing is off and no test users are configured', () => {
    process.env.GMAIL_INTEGRATION_ENABLED = 'true'
    // Act
    const allowed = isGmailConnectAllowed('someone@example.com')

    // Assert
    expect(allowed).toBe(false)
    expect(getGmailTestUsers()).toEqual([])
  })

  it('does not let the general integration-testing flag bypass the Gmail allowlist', () => {
    process.env.GMAIL_INTEGRATION_ENABLED = 'true'
    process.env.ENABLE_UPCOMING_INTEGRATION_TESTING = 'true'

    expect(isGmailConnectAllowed('someone@example.com')).toBe(false)
    expect(isGmailConnectAllowed(null)).toBe(false)
  })

  it('allows an allowlisted account while testing stays off', () => {
    process.env.GMAIL_INTEGRATION_ENABLED = 'true'
    process.env.GMAIL_TEST_USERS = 'tester@example.com, second@example.com'

    expect(isGmailConnectAllowed('tester@example.com')).toBe(true)
    expect(isGmailConnectAllowed('second@example.com')).toBe(true)
    expect(isGmailConnectAllowed('stranger@example.com')).toBe(false)
  })

  it('matches allowlisted emails case-insensitively and ignores surrounding whitespace', () => {
    process.env.GMAIL_INTEGRATION_ENABLED = 'true'
    process.env.GMAIL_TEST_USERS = '  Tester@Example.com  '

    expect(isGmailTestUser('tester@example.com')).toBe(true)
    expect(isGmailTestUser('TESTER@EXAMPLE.COM')).toBe(true)
    expect(getGmailTestUsers()).toEqual(['tester@example.com'])
  })

  it('treats a missing email as not allowlisted', () => {
    process.env.GMAIL_INTEGRATION_ENABLED = 'true'
    process.env.GMAIL_TEST_USERS = 'tester@example.com'

    expect(isGmailTestUser(null)).toBe(false)
    expect(isGmailTestUser(undefined)).toBe(false)
    expect(isGmailTestUser('')).toBe(false)
    expect(isGmailConnectAllowed(null)).toBe(false)
  })

  it('ignores empty entries in the allowlist', () => {
    process.env.GMAIL_TEST_USERS = 'tester@example.com,,  ,'

    expect(getGmailTestUsers()).toEqual(['tester@example.com'])
  })

  it('allows every signed-in account when public mode is enabled', () => {
    process.env.GMAIL_INTEGRATION_ENABLED = 'true'
    process.env.GMAIL_PUBLIC_ENABLED = 'true'

    expect(isGmailPublicEnabled()).toBe(true)
    expect(isGmailConnectAllowed('anyone@example.com')).toBe(true)
    expect(isGmailConnectAllowed(null)).toBe(true)
  })

  it('keeps test-user gating when public mode is disabled', () => {
    process.env.GMAIL_INTEGRATION_ENABLED = 'true'
    process.env.GMAIL_PUBLIC_ENABLED = 'false'
    process.env.GMAIL_TEST_USERS = 'tester@example.com'

    expect(isGmailConnectAllowed('tester@example.com')).toBe(true)
    expect(isGmailConnectAllowed('public@example.com')).toBe(false)
  })
})
