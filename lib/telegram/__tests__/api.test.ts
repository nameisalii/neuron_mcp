import { getTelegramWebhookInfo, setTelegramWebhook } from '../api'

describe('Telegram Bot API helpers', () => {
  beforeEach(() => {
    global.fetch = jest.fn()
  })

  it('subscribes to new and edited direct/group/channel messages', async () => {
    ;(global.fetch as jest.Mock).mockResolvedValue({ ok: true, json: async () => ({ ok: true }) })

    await setTelegramWebhook('test-token', 'https://example.com/api/integrations/telegram/webhook', 'test-secret')

    const request = (global.fetch as jest.Mock).mock.calls[0][1]
    expect(JSON.parse(request.body)).toEqual(expect.objectContaining({
      allowed_updates: ['message', 'edited_message', 'channel_post', 'edited_channel_post'],
    }))
  })

  it('returns safe webhook diagnostic fields', async () => {
    ;(global.fetch as jest.Mock).mockResolvedValue({
      ok: true,
      json: async () => ({
        ok: true,
        result: {
          url: 'https://example.com/api/integrations/telegram/webhook',
          pending_update_count: 2,
          allowed_updates: ['message'],
          has_custom_certificate: false,
        },
      }),
    })

    await expect(getTelegramWebhookInfo('test-token')).resolves.toEqual({
      url: 'https://example.com/api/integrations/telegram/webhook',
      pendingUpdateCount: 2,
      lastErrorDate: null,
      lastErrorMessage: null,
      allowedUpdates: ['message'],
      hasCustomCertificate: false,
    })
  })
})
