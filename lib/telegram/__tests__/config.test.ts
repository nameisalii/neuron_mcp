describe('Telegram configuration', () => {
  const original = process.env

  beforeEach(() => {
    jest.resetModules()
    process.env = { ...original }
    delete process.env.TELEGRAM_BOT_TOKEN
    delete process.env.TELEGRAM_WEBHOOK_SECRET
    delete process.env.TELEGRAM_WEBHOOK_URL
  })

  afterAll(() => {
    process.env = original
  })

  it('loads safely when Telegram environment variables are missing', async () => {
    const { getTelegramConfig, getTelegramWebhookUrl, isTelegramConfigured } = await import('../config')

    expect(getTelegramConfig()).toEqual({
      botToken: null,
      webhookSecret: null,
      webhookUrl: null,
      botUsername: 'neuron_mcp_bot',
    })
    expect(isTelegramConfigured()).toBe(false)
    expect(getTelegramWebhookUrl()).toContain('/api/integrations/telegram/webhook')
  })
})
