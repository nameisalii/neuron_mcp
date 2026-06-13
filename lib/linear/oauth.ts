const LOCAL_APP_URL = 'http://localhost:3000'
const PRODUCTION_APP_URL = 'https://tryneuron.net'

export function getAppUrl(): string {
  if (process.env.NODE_ENV !== 'production') {
    return LOCAL_APP_URL
  }
  const configured = process.env.NEXT_PUBLIC_APP_URL?.trim().replace(/\/+$/, '')
  if (configured) return configured
  return PRODUCTION_APP_URL
}

export function getLinearRedirectUri(): string {
  return `${getAppUrl()}/api/integrations/linear/callback`
}
