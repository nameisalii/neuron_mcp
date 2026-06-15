import { getAppUrl } from '@/lib/app-url'

describe('getAppUrl', () => {
  const originalNodeEnv = process.env.NODE_ENV
  const originalAppUrl = process.env.NEXT_PUBLIC_APP_URL

  afterEach(() => {
    ;(process.env as NodeJS.ProcessEnv & { NODE_ENV?: string }).NODE_ENV = originalNodeEnv
    process.env.NEXT_PUBLIC_APP_URL = originalAppUrl
  })

  it('uses the configured URL and strips trailing slashes', () => {
    process.env.NEXT_PUBLIC_APP_URL = 'https://preview.example.com///'
    expect(getAppUrl()).toBe('https://preview.example.com')
  })

  it('defaults production to the product subdomain', () => {
    ;(process.env as NodeJS.ProcessEnv & { NODE_ENV?: string }).NODE_ENV = 'production'
    delete process.env.NEXT_PUBLIC_APP_URL
    expect(getAppUrl()).toBe('https://app.tryneuron.net')
  })

  it('defaults local development to port 3000', () => {
    ;(process.env as NodeJS.ProcessEnv & { NODE_ENV?: string }).NODE_ENV = 'development'
    delete process.env.NEXT_PUBLIC_APP_URL
    expect(getAppUrl()).toBe('http://localhost:3000')
  })
})
