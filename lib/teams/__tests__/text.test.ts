import { shouldSkipTeamsText, teamsMessageText } from '../text'

describe('Teams text helpers', () => {
  it.each([
    ['hi', 'small_talk'],
    ['hello', 'small_talk'],
    ['thanks', 'small_talk'],
    ['ok', 'small_talk'],
    ['how are you', 'small_talk'],
    ['Roadmap', 'too_short'],
    ['👍 👋', 'emoji_only'],
    ['...?!', 'punctuation_only'],
    ['https://example.com/roadmap', 'url_only'],
  ])('skips %p as %s', (text, reason) => {
    expect(shouldSkipTeamsText(text)).toEqual({ skip: true, reason })
  })

  it.each([
    'Launch Friday',
    'Fix billing',
    'Ship auth',
    'The customer approved the revised annual contract today',
  ])('keeps useful Teams text: %p', (text) => {
    expect(shouldSkipTeamsText(text)).toEqual({ skip: false })
  })

  it('strips Teams HTML safely before ingestion', () => {
    expect(teamsMessageText('<div>Launch <b>Friday</b>&nbsp;&amp; ship auth</div>', 'html'))
      .toBe('Launch Friday & ship auth')
  })
})
