import { extractTasks, parseTaskDueAt } from '../extract'

const now = new Date(2026, 6, 20, 9, 0)

test('detects invoice request by Friday', () => {
  const [task] = extractTasks('Please send invoice by Friday.', { now, sourceType: 'slack' })
  expect(task.title).toBe('Send invoice')
  expect(task.dueAt?.getDay()).toBe(5)
})

test('removes an addressee from the suggested title', () => {
  expect(extractTasks('Ali, can you send the Datatruck invoice today by 5pm?', { now })[0].title).toBe('Send the Datatruck invoice')
})

test('detects finish today by 5pm', () => {
  const [task] = extractTasks('Finish this today by 5pm.', { now })
  expect(task.dueAt?.getHours()).toBe(17)
  expect(task.priority).toBe('high')
})

test.each(['thanks', 'sounds good', 'lol', 'yes', 'no problem'])('ignores %s', (text) => {
  expect(extractTasks(text, { now })).toEqual([])
})

test('parses today, tomorrow and EOD locally', () => {
  expect(parseTaskDueAt('do it today', now)?.getDate()).toBe(20)
  expect(parseTaskDueAt('do it tomorrow', now)?.getDate()).toBe(21)
  expect(parseTaskDueAt('before EOD', now)?.getHours()).toBe(17)
})

test('detects a conversational request with a calendar deadline and explicit high priority', () => {
  const [task] = extractTasks('hi ali can you finish the backend of the logo please due July 24th 3 pm (priority is high)', { now, sourceType: 'telegram' })
  expect(task.title).toBe('Finish the backend of the logo')
  expect(task.priority).toBe('high')
  expect(task.dueAt).toEqual(new Date(2026, 6, 24, 15, 0))
  expect(task.confidence).toBeGreaterThanOrEqual(0.65)
})

test('detects a conversational tomorrow request with explicit medium priority', () => {
  const [task] = extractTasks('hi ali can you finish the front of the logo please due tomorrow 5 pm (priority is medium)', { now, sourceType: 'telegram' })
  expect(task.title).toBe('Finish the front of the logo')
  expect(task.priority).toBe('medium')
  expect(task.dueAt).toEqual(new Date(2026, 6, 21, 17, 0))
})
