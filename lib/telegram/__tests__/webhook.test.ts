import { normalizeTelegramText, shouldSkipTelegramText } from '../webhook'

jest.mock('@/lib/db', () => ({ prisma: {} }))
jest.mock('@/lib/extraction/extractor', () => ({}))
jest.mock('@/lib/openai', () => ({}))
jest.mock('@/lib/pinecone', () => ({}))

describe('shouldSkipTelegramText', () => {
  it.each([
    ['hi', 'small_talk'],
    ['how are you doing', 'small_talk'],
    ['Roadmap', 'too_short'],
    ['👍 👋', 'emoji_only'],
    ['...?!', 'punctuation_only'],
    ['https://example.com/roadmap', 'url_only'],
    ['/help', 'command'],
    ['/settings notifications', 'command'],
  ])('skips %p as %s', (text, reason) => {
    expect(shouldSkipTelegramText(text)).toEqual({ skip: true, reason })
  })

  it.each([
    'Launch Friday',
    'Fix billing',
    'Ship auth',
    'The customer approved the revised annual contract today',
  ])('keeps useful knowledge: %p', (text) => {
    expect(shouldSkipTelegramText(text)).toEqual({ skip: false })
  })

  it('allows only /start commands that contain a connection code', () => {
    expect(shouldSkipTelegramText('/start')).toEqual({ skip: true, reason: 'command' })
    expect(shouldSkipTelegramText('/start abcdefghijklmnop')).toEqual({ skip: false })
  })

  it('normalizes repeated whitespace', () => {
    expect(normalizeTelegramText('  Launch \n\t Friday  ')).toBe('Launch Friday')
  })
})
