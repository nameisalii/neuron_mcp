/**
 * @jest-environment node
 */
import { validateEnv } from '@/lib/env'

describe('validateEnv', () => {
  const originalEnv = process.env
  const originalNodeEnv = process.env.NODE_ENV

  beforeEach(() => {
    process.env = { ...originalEnv, NODE_ENV: 'production' }
  })

  afterEach(() => {
    process.env = originalEnv
  })

  it('passes when all required vars are set', () => {
    process.env = {
      ...process.env,
      DATABASE_URL: 'postgresql://x',
      OPENAI_API_KEY: 'sk-x',
      PINECONE_API_KEY: 'pc-x',
      PINECONE_INDEX: 'idx',
      CLERK_SECRET_KEY: 'sk_x',
      NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY: 'pk_x',
      CLERK_WEBHOOK_SECRET: 'whsec_x',
      SLACK_CLIENT_ID: 'cid',
      SLACK_CLIENT_SECRET: 'csec',
      SLACK_SIGNING_SECRET: 'ssec',
      LINEAR_CLIENT_ID: 'linear-cid',
      LINEAR_CLIENT_SECRET: 'linear-csec',
      LINEAR_WEBHOOK_SECRET: 'linear-webhook',
      GOOGLE_CLIENT_ID: 'google-cid',
      GOOGLE_CLIENT_SECRET: 'google-csec',
      ENCRYPTION_KEY: 'enckey',
      RESEND_API_KEY: 're_x',
      NEXT_PUBLIC_APP_URL: 'https://x.vercel.app',
      NEURON_API_KEY: 'napikey',
      NEURON_WORKSPACE_ID: 'ws-x',
      NOTION_TOKEN: 'secret_x',
      CRON_SECRET: 'cron_x',
    }
    expect(() => validateEnv()).not.toThrow()
  })

  it('throws listing all missing vars', () => {
    process.env = { NODE_ENV: 'production' }
    expect(() => validateEnv()).toThrow(/Missing required environment variables/)
  })

  it('includes specific missing var names in the error', () => {
    process.env = { NODE_ENV: 'production', DATABASE_URL: 'postgresql://x' }
    expect(() => validateEnv()).toThrow(/OPENAI_API_KEY/)
  })

  it('skips validation in test environment', () => {
    process.env = { NODE_ENV: 'test' }
    expect(() => validateEnv()).not.toThrow()
  })
})
