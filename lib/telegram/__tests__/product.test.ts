import { telegramModeCapabilityAnswer } from '../product'

it('explains which Telegram modes work without adding the bot', () => {
  const answer = telegramModeCapabilityAnswer('Can Telegram sync channels without adding the bot?')
  expect(answer).toContain('public channels')
  expect(answer).toContain('Public Channel Import')
  expect(answer).toContain('private channels')
  expect(answer).toContain('Account Sync')
  expect(answer).toContain('Bot Mode cannot')
})

it('does not intercept ordinary knowledge questions', () => {
  expect(telegramModeCapabilityAnswer('What did Telegram say recently?')).toBeNull()
})
