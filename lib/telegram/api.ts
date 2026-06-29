const TELEGRAM_API_BASE = 'https://api.telegram.org'

export interface TelegramWebhookInfo {
  url: string
  pendingUpdateCount: number
  lastErrorDate: number | null
}

export async function setTelegramWebhook(
  botToken: string,
  webhookUrl: string,
  webhookSecret: string,
): Promise<void> {
  const response = await fetch(`${TELEGRAM_API_BASE}/bot${botToken}/setWebhook`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      url: webhookUrl,
      secret_token: webhookSecret,
      allowed_updates: ['message', 'channel_post'],
      drop_pending_updates: false,
    }),
  })
  const payload = await response.json() as { ok?: boolean }
  if (!response.ok || !payload.ok) throw new Error(`Telegram setWebhook failed (${response.status})`)
}

export async function getTelegramWebhookInfo(botToken: string): Promise<TelegramWebhookInfo> {
  const response = await fetch(`${TELEGRAM_API_BASE}/bot${botToken}/getWebhookInfo`, {
    method: 'GET',
    cache: 'no-store',
  })
  if (!response.ok) throw new Error(`Telegram getWebhookInfo failed (${response.status})`)

  const payload = await response.json() as {
    ok?: boolean
    result?: { url?: unknown; pending_update_count?: unknown; last_error_date?: unknown }
  }
  if (!payload.ok || !payload.result) throw new Error('Telegram getWebhookInfo returned an invalid response')

  return {
    url: typeof payload.result.url === 'string' ? payload.result.url : '',
    pendingUpdateCount: typeof payload.result.pending_update_count === 'number' ? payload.result.pending_update_count : 0,
    lastErrorDate: typeof payload.result.last_error_date === 'number' ? payload.result.last_error_date : null,
  }
}
