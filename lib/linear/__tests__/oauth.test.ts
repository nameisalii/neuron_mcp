import { getAppUrl, getLinearRedirectUri } from '../oauth'

describe('Linear OAuth URLs', () => {
  afterEach(() => {
    delete process.env.NEXT_PUBLIC_APP_URL
  })

  it('uses port 3000 locally', () => {
    expect(getLinearRedirectUri()).toBe('http://localhost:3000/api/integrations/linear/callback')
  })

  it('uses the configured production URL and strips trailing slashes', () => {
    const previousNodeEnv = process.env.NODE_ENV
    const previousAppUrl = process.env.NEXT_PUBLIC_APP_URL
    try {
      ;(process.env as NodeJS.ProcessEnv & { NODE_ENV?: string }).NODE_ENV = 'production'
      process.env.NEXT_PUBLIC_APP_URL = 'https://tryneuron.net/'
      expect(getAppUrl()).toBe('https://tryneuron.net')
      expect(getLinearRedirectUri()).toBe('https://tryneuron.net/api/integrations/linear/callback')
    } finally {
      ;(process.env as NodeJS.ProcessEnv & { NODE_ENV?: string }).NODE_ENV = previousNodeEnv
      process.env.NEXT_PUBLIC_APP_URL = previousAppUrl
    }
  })
})
