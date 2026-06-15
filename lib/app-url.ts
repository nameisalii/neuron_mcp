const LOCAL_APP_URL = 'http://localhost:3000'
const PRODUCTION_APP_URL = 'https://app.tryneuron.net'

export function getAppUrl(): string {
  const configured = process.env.NEXT_PUBLIC_APP_URL?.trim().replace(/\/+$/, '')
  if (configured) return configured
  return process.env.NODE_ENV === 'production' ? PRODUCTION_APP_URL : LOCAL_APP_URL
}
