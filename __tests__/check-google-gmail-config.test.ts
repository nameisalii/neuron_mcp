/** @jest-environment node */
import { execFileSync } from 'node:child_process'
import path from 'node:path'

const SCRIPT = path.join(process.cwd(), 'scripts/check-google-gmail-config.mjs')

const FAKE_SECRET = 'GOCSPX-fake-client-secret-value'
const APPROVED_CLIENT_ID = '130468741737-abcdefghijklmnop.apps.googleusercontent.com'
const OTHER_PROJECT_CLIENT_ID = '999999999999-zyxwvutsrqponmlk.apps.googleusercontent.com'

function runScript(env: Record<string, string>): string {
  // The script is run in a clean environment so each case controls exactly which vars exist.
  return execFileSync('node', [SCRIPT], {
    encoding: 'utf8',
    env: { PATH: process.env.PATH ?? '', ...env } as unknown as NodeJS.ProcessEnv,
  })
}

describe('check-google-gmail-config script', () => {
  it('reports configuration without printing any secret value', () => {
    // Arrange
    const env = {
      NEXT_PUBLIC_APP_URL: 'http://localhost:3000',
      GMAIL_CLIENT_ID: APPROVED_CLIENT_ID,
      GMAIL_CLIENT_SECRET: FAKE_SECRET,
      GMAIL_INTEGRATION_ENABLED: 'true',
      GMAIL_PUBLIC_ENABLED: 'true',
      CLERK_SECRET_KEY: 'sk_test_fake_clerk_secret',
    }

    // Act
    const output = runScript(env)

    // Assert
    expect(output).toContain('GMAIL_CLIENT_SECRET present true')
    expect(output).not.toContain(FAKE_SECRET)
    expect(output).not.toContain('sk_test_fake_clerk_secret')
    expect(output).not.toContain(APPROVED_CLIENT_ID)
  })

  it('computes the local redirect URI and confirms only gmail.readonly is requested', () => {
    const output = runScript({
      NEXT_PUBLIC_APP_URL: 'http://localhost:3000',
      GMAIL_CLIENT_ID: APPROVED_CLIENT_ID,
      GMAIL_CLIENT_SECRET: FAKE_SECRET,
      GMAIL_INTEGRATION_ENABLED: 'true',
      GMAIL_PUBLIC_ENABLED: 'true',
    })

    expect(output).toContain('computed redirect URI http://localhost:3000/api/integrations/gmail/callback')
    expect(output).toContain('requests gmail.readonly true')
    expect(output).toContain('requests write scopes false')
    expect(output).toContain('Warnings')
    expect(output).toContain('none')
  })

  it('warns when GOOGLE_CLIENT_ID and GMAIL_CLIENT_ID disagree', () => {
    const output = runScript({
      NEXT_PUBLIC_APP_URL: 'http://localhost:3000',
      GMAIL_CLIENT_ID: APPROVED_CLIENT_ID,
      GMAIL_CLIENT_SECRET: FAKE_SECRET,
      GOOGLE_CLIENT_ID: OTHER_PROJECT_CLIENT_ID,
      GOOGLE_CLIENT_SECRET: FAKE_SECRET,
    })

    expect(output).toContain('WARN')
    expect(output).toContain('both set and differ')
  })

  it('warns when the OAuth client belongs to a project Google did not approve', () => {
    const output = runScript({
      NEXT_PUBLIC_APP_URL: 'http://localhost:3000',
      GMAIL_CLIENT_ID: OTHER_PROJECT_CLIENT_ID,
      GMAIL_CLIENT_SECRET: FAKE_SECRET,
    })

    expect(output).toContain('WARN')
    expect(output).toContain('not the approved project 130468741737')
  })

  it('warns when no Gmail client is configured at all', () => {
    const output = runScript({ NEXT_PUBLIC_APP_URL: 'http://localhost:3000' })

    expect(output).toContain('No GMAIL_CLIENT_ID or GOOGLE_CLIENT_ID is set')
  })

  it('warns when production would send users to a localhost redirect', () => {
    const output = runScript({
      NODE_ENV: 'production',
      NEXT_PUBLIC_APP_URL: 'http://localhost:3000',
      GMAIL_CLIENT_ID: APPROVED_CLIENT_ID,
      GMAIL_CLIENT_SECRET: FAKE_SECRET,
    })

    expect(output).toContain('redirect URI points at localhost')
  })

  it('confirms approved public mode in production', () => {
    const output = runScript({
      NODE_ENV: 'production',
      NEXT_PUBLIC_APP_URL: 'https://app.tryneuron.net',
      GMAIL_CLIENT_ID: APPROVED_CLIENT_ID,
      GMAIL_CLIENT_SECRET: FAKE_SECRET,
      GMAIL_INTEGRATION_ENABLED: 'true',
      GMAIL_PUBLIC_ENABLED: 'true',
    })

    expect(output).toContain('public connect allowed true')
    expect(output).toContain('== Warnings ==\nnone')
  })

  it('reports test users as a count rather than listing addresses', () => {
    const output = runScript({
      NEXT_PUBLIC_APP_URL: 'http://localhost:3000',
      GMAIL_CLIENT_ID: APPROVED_CLIENT_ID,
      GMAIL_CLIENT_SECRET: FAKE_SECRET,
      GMAIL_TEST_USERS: 'tester@example.com,second@example.com',
    })

    expect(output).toContain('GMAIL_TEST_USERS count 2')
    expect(output).not.toContain('tester@example.com')
  })
})
