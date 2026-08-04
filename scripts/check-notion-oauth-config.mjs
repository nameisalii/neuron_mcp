const callbackPath = '/api/integrations/notion/callback'
const appUrl = process.env.NEXT_PUBLIC_APP_URL?.trim().replace(/\/+$/, '')
const explicitRedirectUri = process.env.NOTION_REDIRECT_URI?.trim()
const fallbackAppUrl = process.env.NODE_ENV === 'production'
  ? 'https://app.tryneuron.net'
  : 'http://localhost:3000'
const computedRedirectUri = explicitRedirectUri || `${appUrl || fallbackAppUrl}${callbackPath}`

console.log('NEXT_PUBLIC_APP_URL present', Boolean(appUrl))
console.log('NEXT_PUBLIC_APP_URL', appUrl || '(not set)')
console.log('NOTION_CLIENT_ID present', Boolean(process.env.NOTION_CLIENT_ID?.trim()))
console.log('NOTION_CLIENT_SECRET present', Boolean(process.env.NOTION_CLIENT_SECRET?.trim()))
console.log('NOTION_REDIRECT_URI present', Boolean(explicitRedirectUri))
console.log('NOTION_REDIRECT_URI', explicitRedirectUri || '(not set)')
console.log('computed redirect URI', computedRedirectUri)
console.log('expected callback path', callbackPath)
