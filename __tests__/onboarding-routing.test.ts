/**
 * @jest-environment node
 */
import fs from 'node:fs'
import path from 'node:path'

const root = process.cwd()
const read = (file: string) => fs.readFileSync(path.join(root, file), 'utf8')

describe('onboarding routing', () => {
  it('keeps the legacy onboarding URL as a redirect to setup', () => {
    expect(fs.existsSync(path.join(root, 'app/onboarding/page.tsx'))).toBe(true)
    expect(read('app/onboarding/page.tsx')).toContain("redirect('/setup')")
  })

  it('uses supported Clerk fallback redirects', () => {
    const signIn = read('app/(auth)/sign-in/[[...sign-in]]/page.tsx')
    const signUp = read('app/(auth)/sign-up/[[...sign-up]]/page.tsx')

    expect(signIn).toContain('fallbackRedirectUrl="/dashboard"')
    expect(signIn).toContain('forceRedirectUrl="/dashboard"')
    expect(signUp).toContain('fallbackRedirectUrl="/setup"')
    expect(signUp).toContain('forceRedirectUrl="/setup"')
    expect(`${signIn}${signUp}`).not.toMatch(/afterSignInUrl|afterSignUpUrl/)
  })

  it('keeps the existing Capture route and sidebar link aligned', () => {
    expect(fs.existsSync(path.join(root, 'app/(dashboard)/dashboard/settings/capture/page.tsx'))).toBe(true)
    expect(read('app/(dashboard)/DashboardShell.tsx')).toContain(
      "href: '/dashboard/settings/capture'",
    )
  })

  it('protects onboarding and dashboard while allowing OAuth callbacks', () => {
    const middleware = read('middleware.ts')

    expect(middleware).toContain("'/dashboard(.*)'")
    expect(middleware).toContain("'/onboarding(.*)'")
    expect(middleware).toContain("'/api/webhooks/clerk'")
    expect(middleware).toContain("'/api/integrations/slack/callback'")
    expect(middleware).toContain("'/api/integrations/linear/callback'")
    expect(middleware).toContain("'/api/integrations/notion/callback'")
    expect(middleware).toContain("'/api/integrations/gmail/callback'")
    expect(middleware).toContain("'/api/integrations/telegram/webhook'")
    expect(middleware).toContain("'/api/integrations/teams/callback'")
    expect(middleware).toContain("'/api/integrations/teams/webhook'")
    expect(middleware).toContain("'/api/integrations/jira/callback'")
  })
})
