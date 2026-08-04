import { fetchPublicTelegramChannel, normalizePublicTelegramChannelUrl } from '../publicChannel'

it.each([
  'https://t.me/+private-token',
  'https://t.me/joinchat/private-token',
  'https://t.me/c/12345/10',
  'https://example.com/channel',
])('rejects private or non-Telegram URL %s', (value) => {
  expect(() => normalizePublicTelegramChannelUrl(value)).toThrow()
})

it('normalizes public Telegram usernames', () => {
  expect(normalizePublicTelegramChannelUrl('t.me/public_news')).toEqual({
    username: 'public_news',
    url: 'https://t.me/public_news',
    previewUrl: 'https://t.me/s/public_news',
  })
})

it('imports only the bounded most recent public posts', async () => {
  const html = Array.from({ length: 8 }, (_, index) => `
    <div class="tgme_widget_message" data-post="public_news/${index + 1}">
      <div class="tgme_widget_message_text js-message_text">Post ${index + 1} content</div>
      <time datetime="2026-07-${String(index + 1).padStart(2, '0')}T12:00:00+00:00"></time>
    </div>`).join('')
  global.fetch = jest.fn(async () => ({ ok: true, text: async () => html })) as jest.Mock

  const result = await fetchPublicTelegramChannel('https://t.me/public_news', 3)

  expect(result.posts).toHaveLength(3)
  expect(result.posts.map((post) => post.messageId)).toEqual(['8', '7', '6'])
})
