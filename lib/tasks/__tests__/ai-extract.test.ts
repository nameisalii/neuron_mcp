/** @jest-environment node */
import { extractTaskWithAi } from '../ai-extract'

function clientWith(result: unknown) {
  return {
    chat: { completions: { create: jest.fn().mockResolvedValue({ choices: [{ message: { content: JSON.stringify(result) } }] }) } },
  } as never
}

const base = {
  text: 'hi ali can you finish the front of the logo please due tomorrow 5 pm (priority is medium)',
  sourceType: 'telegram',
  sourceTitle: 'Product chat',
  now: new Date('2026-07-20T16:00:00.000Z'),
  timezone: 'America/Los_Angeles',
}

test('validates an actionable Telegram message with an explicit due date and priority', async () => {
  const result = await extractTaskWithAi(base, clientWith({
    isTask: true,
    title: 'Finish the front of the logo',
    description: 'Ali was asked in Telegram to finish the front of the logo.',
    priority: 'medium',
    category: 'startup',
    dueAt: '2026-07-21T17:00:00-07:00',
    assigneeName: 'Ali',
    confidence: 0.92,
    reason: 'Clear request with an explicit deadline.',
  }))

  expect(result).toEqual(expect.objectContaining({ isTask: true, priority: 'medium', confidence: 0.92 }))
  expect(result.title).toContain('Finish the front of the logo')
  expect(result.dueAt).toBe('2026-07-21T17:00:00-07:00')
})

test.each(['thanks ali', 'sounds good', 'FYI the logo was updated'])('accepts a non-task classification for %s', async (text) => {
  const result = await extractTaskWithAi({ ...base, text }, clientWith({
    isTask: false, title: null, description: null, priority: null, category: null,
    dueAt: null, assigneeName: null, confidence: 0.98, reason: 'No requested action.',
  }))
  expect(result.isTask).toBe(false)
})
