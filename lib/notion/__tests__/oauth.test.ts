/** @jest-environment node */
import { getNotionOAuthMismatchMessage, getNotionRedirectUri } from '../oauth'

const ORIGINAL_ENV = process.env

beforeEach(() => {
  process.env = { ...ORIGINAL_ENV }
  delete process.env.NOTION_REDIRECT_URI
  delete process.env.NEXT_PUBLIC_APP_URL
  ;(process.env as Record<string, string | undefined>).NODE_ENV = 'test'
})

afterAll(() => {
  process.env = ORIGINAL_ENV
})

it('prefers an explicit NOTION_REDIRECT_URI', () => {
  process.env.NOTION_REDIRECT_URI = 'http://localhost:3000/custom-notion-callback'
  process.env.NEXT_PUBLIC_APP_URL = 'https://ignored.example'

  expect(getNotionRedirectUri()).toBe('http://localhost:3000/custom-notion-callback')
})

it('falls back to the NEXT_PUBLIC_APP_URL callback', () => {
  process.env.NEXT_PUBLIC_APP_URL = 'https://app.tryneuron.net/'

  expect(getNotionRedirectUri()).toBe('https://app.tryneuron.net/api/integrations/notion/callback')
})

it('uses localhost when no redirect configuration exists outside production', () => {
  expect(getNotionRedirectUri()).toBe('http://localhost:3000/api/integrations/notion/callback')
})

it('includes only safe redirect guidance in the mismatch message', () => {
  const message = getNotionOAuthMismatchMessage('http://localhost:3000/api/integrations/notion/callback')

  expect(message).toContain('http://localhost:3000/api/integrations/notion/callback')
  expect(message).toContain('same Notion app credentials')
  expect(message).not.toContain('NOTION_CLIENT_SECRET')
})
