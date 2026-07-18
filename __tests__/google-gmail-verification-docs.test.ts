/** @jest-environment node */
import fs from 'node:fs'
import path from 'node:path'

it('documents the real Gmail callbacks and Clerk-owned sign-in callback', () => {
  const docs = fs.readFileSync(path.join(process.cwd(), 'docs/google-gmail-verification.md'), 'utf8')
  expect(docs).toContain('http://localhost:3000/api/integrations/gmail/callback')
  expect(docs).toContain('https://app.tryneuron.net/api/integrations/gmail/callback')
  expect(docs).toContain('https://clerk.app.tryneuron.net/v1/oauth_callback')
  expect(docs).toContain('there is no `/api/auth/callback/google` route')
  expect(docs).toContain('Google Auth Platform → Data Access')
  expect(docs).toContain('Google Auth Platform → Audience → Test users')
  expect(docs).toContain('https://www.googleapis.com/auth/gmail.readonly')
  expect(docs).toContain('differ from the scopes declared')
})
