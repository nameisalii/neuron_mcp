import { adfToPlainText, shouldSkipJiraText } from '../text'

describe('Jira text helpers', () => {
  it('converts Atlassian Document Format to plain text', () => {
    const adf = {
      type: 'doc',
      content: [
        { type: 'paragraph', content: [{ type: 'text', text: 'Fix ' }, { type: 'text', text: 'billing' }] },
        { type: 'paragraph', content: [{ type: 'text', text: 'Launch Friday' }] },
      ],
    }

    expect(adfToPlainText(adf)).toBe('Fix billing Launch Friday')
  })

  it.each([
    ['ok', 'small_talk'],
    ['thanks', 'small_talk'],
    ['hello', 'small_talk'],
    ['Roadmap', 'too_short'],
    ['👍', 'emoji_only'],
    ['?!...', 'punctuation_only'],
    ['https://example.com/jira', 'url_only'],
  ])('skips %p as %s', (text, reason) => {
    expect(shouldSkipJiraText(text)).toEqual({ skip: true, reason })
  })

  it.each([
    'Launch Friday',
    'Fix billing',
    'Ship auth',
    'Blocker: Stripe',
    'Release today',
    'Customer churn risk',
  ])('keeps useful short Jira text: %s', (text) => {
    expect(shouldSkipJiraText(text)).toEqual({ skip: false })
  })
})
