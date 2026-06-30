const TELEGRAM_WEBHOOK_PATH = '/api/integrations/telegram/webhook'

function trim(value: string | undefined): string | null {
  const result = value?.trim()
  return result ? result : null
}

export function getTelegramConfig() {
  return {
    botToken: trim(process.env.TELEGRAM_BOT_TOKEN),
    webhookSecret: trim(process.env.TELEGRAM_WEBHOOK_SECRET),
    webhookUrl: trim(process.env.TELEGRAM_WEBHOOK_URL),
    botUsername: trim(process.env.TELEGRAM_BOT_USERNAME) ?? 'neuron_mcp_bot',
  }
}

export function getTelegramBotUsername(): string {
  return getTelegramConfig().botUsername
}

export function getTelegramWebhookUrl(): string {
  const configured = trim(process.env.TELEGRAM_WEBHOOK_URL)
  if (configured) return configured
  const appUrl = trim(process.env.NEXT_PUBLIC_APP_URL) ?? trim(process.env.NEXT_PUBLIC_PRODUCT_URL)
  return appUrl ? `${appUrl.replace(/\/$/, '')}${TELEGRAM_WEBHOOK_PATH}` : TELEGRAM_WEBHOOK_PATH
}

export function isTelegramConfigured(): boolean {
  const config = getTelegramConfig()
  return Boolean(config.botToken && config.webhookSecret && config.webhookUrl)
}
