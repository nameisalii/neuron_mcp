const REQUIRED_VARS = [
  'DATABASE_URL',
  'OPENAI_API_KEY',
  'PINECONE_API_KEY',
  'PINECONE_INDEX',
  'CLERK_SECRET_KEY',
  'NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY',
  'CLERK_WEBHOOK_SECRET',
  'SLACK_CLIENT_ID',
  'SLACK_CLIENT_SECRET',
  'SLACK_SIGNING_SECRET',
  'LINEAR_CLIENT_ID',
  'LINEAR_CLIENT_SECRET',
  'LINEAR_WEBHOOK_SECRET',
  'ENCRYPTION_KEY',
  'RESEND_API_KEY',
  'NEXT_PUBLIC_APP_URL',
  'NEURON_API_KEY',
  'NEURON_WORKSPACE_ID',
  'NOTION_CLIENT_ID',
  'NOTION_CLIENT_SECRET',
  'CRON_SECRET',
] as const

export function validateEnv(): void {
  if (process.env.NODE_ENV === 'test') return

  const missing: string[] = REQUIRED_VARS.filter((key) => !process.env[key])
  if (!process.env.GMAIL_CLIENT_ID && !process.env.GOOGLE_CLIENT_ID) missing.push('GMAIL_CLIENT_ID or GOOGLE_CLIENT_ID')
  if (!process.env.GMAIL_CLIENT_SECRET && !process.env.GOOGLE_CLIENT_SECRET) missing.push('GMAIL_CLIENT_SECRET or GOOGLE_CLIENT_SECRET')
  if (missing.length > 0) {
    throw new Error(`Missing required environment variables: ${missing.join(', ')}`)
  }
}
