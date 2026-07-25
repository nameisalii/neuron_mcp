const token = process.env.TELEGRAM_BOT_TOKEN

if (!token) {
  console.error('TELEGRAM_BOT_TOKEN is not configured.')
  process.exitCode = 1
} else {
  const telegram = async (method) => {
    const response = await fetch(`https://api.telegram.org/bot${token}/${method}`)
    if (!response.ok) throw new Error(`Telegram ${method} failed with HTTP ${response.status}`)
    const payload = await response.json()
    if (!payload.ok) throw new Error(`Telegram ${method} returned an error`)
    return payload.result
  }

  try {
    const [bot, webhook] = await Promise.all([telegram('getMe'), telegram('getWebhookInfo')])
    let webhookLocation = '(not set)'
    if (webhook.url) {
      const parsed = new URL(webhook.url)
      webhookLocation = `${parsed.hostname}${parsed.pathname}`
    }
    console.log('Telegram bot username:', bot.username ?? '(unknown)')
    console.log('Webhook domain/path:', webhookLocation)
    console.log('Pending updates:', webhook.pending_update_count ?? 0)
    console.log('Last error date:', webhook.last_error_date ? new Date(webhook.last_error_date * 1000).toISOString() : null)
    console.log('Last error message:', typeof webhook.last_error_message === 'string' ? webhook.last_error_message.slice(0, 300) : null)
    console.log('Allowed updates:', Array.isArray(webhook.allowed_updates) ? webhook.allowed_updates : [])
    console.log('Has custom certificate:', webhook.has_custom_certificate === true)
  } catch (error) {
    console.error(error instanceof Error ? error.message : 'Telegram diagnostics failed')
    process.exitCode = 1
  }
}
