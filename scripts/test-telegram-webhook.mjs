const endpoint = process.env.TELEGRAM_TEST_WEBHOOK_URL ?? 'http://localhost:3000/api/integrations/telegram/webhook'
const secret = process.env.TELEGRAM_WEBHOOK_SECRET
const setupCode = process.env.TELEGRAM_TEST_SETUP_CODE ?? 'invalid-local-fixture-code'

if (!secret) {
  console.error('TELEGRAM_WEBHOOK_SECRET is required. No request was sent.')
  process.exitCode = 1
} else {
  const chatId = -9_001_337
  const fixtures = [
    ['direct /start', { update_id: 9001, message: { message_id: 1, text: `/start ${setupCode}`, chat: { id: chatId, type: 'private' } } }],
    ['direct message', { update_id: 9002, message: { message_id: 2, text: 'Please review the local Telegram fixture tomorrow', chat: { id: chatId, type: 'private' } } }],
    ['group message', { update_id: 9003, message: { message_id: 3, text: 'Upload the local test invoice today', chat: { id: chatId - 1, type: 'supergroup', title: 'Local fixture' } } }],
    ['unbound chat', { update_id: 9004, message: { message_id: 4, text: 'Finish the unbound fixture tomorrow', chat: { id: chatId - 2, type: 'private' } } }],
  ]

  for (const [label, payload] of fixtures) {
    try {
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-telegram-bot-api-secret-token': secret },
        body: JSON.stringify(payload),
      })
      const body = await response.json()
      console.log(label, { status: response.status, skippedReasons: body.skippedReasons ?? {} })
    } catch (error) {
      console.error(label, error instanceof Error ? error.message : 'request failed')
      process.exitCode = 1
    }
  }
}
