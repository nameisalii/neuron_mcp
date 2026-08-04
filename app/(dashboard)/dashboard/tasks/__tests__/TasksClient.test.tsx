import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import TasksClient from '../TasksClient'

const base = {
  description: null, priority: 'medium', category: 'work', dueAt: null, completedAt: null,
  sourceType: 'manual', sourceTitle: 'Manual task', sourceSnippet: null, sourceUrl: null,
  extractedFromKnowledgeItemId: null, confidence: null, createdAt: '2026-07-20T10:00:00.000Z', updatedAt: '2026-07-20T10:00:00.000Z',
}
const tasks: any[] = [
  { ...base, id: 'active-1', title: 'Write launch plan', status: 'active', sourceType: 'slack', sourceTitle: 'launch-team', sourceSnippet: 'Please finish the launch plan.' },
  { ...base, id: 'suggested-1', title: 'Send invoice', status: 'suggested', sourceType: 'telegram', sourceTitle: 'Dispatch', sourceSnippet: 'Ali, please send invoice today.', extractedFromKnowledgeItemId: 'ki-1', confidence: .82 },
  { ...base, id: 'completed-1', title: 'Review contract', status: 'completed', category: 'startup', completedAt: '2026-07-20T11:00:00.000Z' },
  { ...base, id: 'declined-1', title: 'Old request', status: 'declined', category: 'personal' },
  { ...base, id: 'archived-1', title: 'Archived request', status: 'archived', category: 'work' },
]

beforeEach(() => { global.fetch = jest.fn() })

test('modal removes color and includes source platform fields', () => {
  render(<TasksClient initialTasks={tasks}/>)
  fireEvent.click(screen.getByRole('button', { name: /add task/i }))
  expect(screen.getByLabelText('Source / Platform')).toBeInTheDocument()
  expect(screen.getByRole('option', { name: 'Gmail' })).toBeInTheDocument()
  expect(screen.queryByLabelText(/source title/i)).not.toBeInTheDocument()
  expect(screen.queryByLabelText(/source note/i)).not.toBeInTheDocument()
  expect(screen.queryByLabelText(/source link/i)).not.toBeInTheDocument()
  expect(screen.queryByLabelText(/color/i)).not.toBeInTheDocument()
})

test('renders source context, source badge, and counted filter tabs', () => {
  render(<TasksClient initialTasks={tasks}/>)
  expect(screen.getAllByText('Telegram').length).toBeGreaterThan(0)
  expect(screen.getByText('Ali, please send invoice today.')).toBeInTheDocument()
  expect(screen.getByRole('tab', { name: 'All 1' })).toBeInTheDocument()
  expect(screen.getByRole('tab', { name: 'Work 1' })).toBeInTheDocument()
  expect(screen.getByRole('tab', { name: 'Completed 1' })).toBeInTheDocument()
  expect(screen.getByRole('tab', { name: 'Declined 1' })).toBeInTheDocument()
})

test('default list contains only active tasks and excludes completed, declined, suggested, and archived tasks', () => {
  render(<TasksClient initialTasks={tasks}/>)
  const section = screen.getByRole('heading', { name: 'Active tasks' }).closest('section')!
  expect(within(section).getAllByText('Write launch plan').length).toBeGreaterThan(0)
  expect(within(section).queryByText('Review contract')).not.toBeInTheDocument()
  expect(within(section).queryByText('Old request')).not.toBeInTheDocument()
  expect(within(section).queryByText('Send invoice')).not.toBeInTheDocument()
  expect(screen.queryByText('Archived request')).not.toBeInTheDocument()
})

test('completed and declined tabs filter the task table', () => {
  render(<TasksClient initialTasks={tasks}/>)
  fireEvent.click(screen.getByRole('tab', { name: 'Completed 1' }))
  expect(screen.getByRole('heading', { name: 'Completed tasks' })).toBeInTheDocument()
  expect(screen.getAllByText('Review contract').length).toBeGreaterThan(0)
  expect(screen.queryByText('Write launch plan')).not.toBeInTheDocument()
  fireEvent.click(screen.getByRole('tab', { name: 'Declined 1' }))
  expect(screen.getByRole('heading', { name: 'Declined tasks' })).toBeInTheDocument()
  expect(screen.getAllByText('Old request').length).toBeGreaterThan(0)
  expect(screen.queryByText('Review contract')).not.toBeInTheDocument()
  expect(screen.getAllByText('Old request')[0].closest('[data-status="declined"]')).toHaveClass('bg-rose-50/70')
})

test('category tabs contain active tasks from that category only', () => {
  render(<TasksClient initialTasks={tasks}/>)
  fireEvent.click(screen.getByRole('tab', { name: 'Startup 0' }))
  expect(screen.getByRole('heading', { name: 'Startup tasks' })).toBeInTheDocument()
  expect(screen.queryByText('Review contract')).not.toBeInTheDocument()
  expect(screen.getByText('No startup tasks right now.')).toBeInTheDocument()
})

test('archive asks for confirmation, explains where the task went, and shows it in Archived', async () => {
  jest.mocked(global.fetch).mockResolvedValue({
    ok: true,
    json: async () => ({ task: { ...tasks[0], status: 'archived' } }),
  } as Response)
  render(<TasksClient initialTasks={tasks}/>)

  fireEvent.click(screen.getAllByRole('button', { name: 'Archive Write launch plan' })[0])
  const dialog = screen.getByRole('dialog', { name: 'Archive task?' })
  expect(within(dialog).getByText(/find it later in Archived tasks/)).toBeInTheDocument()
  fireEvent.click(within(dialog).getByRole('button', { name: 'Archive' }))

  expect(await screen.findByRole('status')).toHaveTextContent('Task archived.')
  expect(screen.queryByText('Write launch plan')).not.toBeInTheDocument()
  fireEvent.click(screen.getByRole('button', { name: 'View archived tasks' }))
  expect(screen.getByRole('heading', { name: 'Archived tasks' })).toBeInTheDocument()
  expect(screen.getAllByText('Write launch plan').length).toBeGreaterThan(0)
})

test('Archived tab restores a soft-archived task to Active', async () => {
  jest.mocked(global.fetch).mockResolvedValue({
    ok: true,
    json: async () => ({ task: { ...tasks[4], status: 'active' } }),
  } as Response)
  render(<TasksClient initialTasks={tasks}/>)

  fireEvent.click(screen.getByRole('tab', { name: 'Archived 1' }))
  expect(screen.getAllByText('Archived request').length).toBeGreaterThan(0)
  fireEvent.click(screen.getAllByRole('button', { name: 'Restore' })[0])

  await waitFor(() => expect(screen.getByRole('tab', { name: 'Archived 0' })).toBeInTheDocument())
  expect(global.fetch).toHaveBeenCalledWith('/api/tasks/archived-1', expect.objectContaining({
    method: 'PATCH',
    body: JSON.stringify({ status: 'active' }),
  }))
  fireEvent.click(screen.getByRole('tab', { name: 'All 2' }))
  expect(screen.getAllByText('Archived request').length).toBeGreaterThan(0)
})

test('done circle completes a task and updates progress and tab counts', async () => {
  jest.mocked(global.fetch).mockResolvedValue({ ok: true, json: async () => ({ task: { ...tasks[0], status: 'completed', completedAt: new Date().toISOString() } }) } as Response)
  render(<TasksClient initialTasks={tasks}/>)
  expect(screen.getByRole('tab', { name: 'Completed 1' })).toBeInTheDocument()
  fireEvent.click(screen.getAllByRole('button', { name: 'Complete Write launch plan' })[0])
  await waitFor(() => expect(screen.getByRole('tab', { name: 'Completed 2' })).toBeInTheDocument())
  expect(screen.queryByText('Write launch plan')).not.toBeInTheDocument()
  expect(global.fetch).toHaveBeenCalledWith('/api/tasks/active-1/complete', { method: 'POST' })
  expect(within(screen.getByLabelText(/All tasks .* complete/).parentElement!.parentElement!).getByText('2 / 2 done')).toBeInTheDocument()
  fireEvent.click(screen.getByRole('tab', { name: 'Completed 2' }))
  expect(screen.getAllByText('Write launch plan').length).toBeGreaterThan(0)
})

test('declining a suggestion removes it and shows it only in Declined', async () => {
  jest.mocked(global.fetch).mockResolvedValue({ ok: true, json: async () => ({ task: { ...tasks[1], status: 'declined' } }) } as Response)
  render(<TasksClient initialTasks={tasks}/>)
  fireEvent.click(screen.getByRole('button', { name: 'Decline' }))
  await waitFor(() => expect(screen.queryByText('Ali, please send invoice today.')).not.toBeInTheDocument())
  expect(screen.getByRole('tab', { name: 'Declined 2' })).toBeInTheDocument()
  expect(global.fetch).toHaveBeenCalledWith('/api/tasks/suggested-1/decline', { method: 'POST' })
  fireEvent.click(screen.getByRole('tab', { name: 'Declined 2' }))
  expect(screen.getAllByText('Send invoice').length).toBeGreaterThan(0)
})

test('approving a suggestion removes it from Suggested and adds it to Active', async () => {
  jest.mocked(global.fetch).mockResolvedValue({ ok: true, json: async () => ({ task: { ...tasks[1], status: 'active' } }) } as Response)
  render(<TasksClient initialTasks={tasks}/>)
  fireEvent.click(screen.getByRole('button', { name: 'Approve' }))
  const suggestedSection = screen.getByRole('heading', { name: 'Suggested tasks' }).closest('section')!
  await waitFor(() => expect(within(suggestedSection).queryByText('Send invoice')).not.toBeInTheDocument())
  expect(screen.getByRole('tab', { name: 'All 2' })).toBeInTheDocument()
  const section = screen.getByRole('heading', { name: 'Active tasks' }).closest('section')!
  expect(within(section).getAllByText('Send invoice').length).toBeGreaterThan(0)
  expect(global.fetch).toHaveBeenCalledWith('/api/tasks/suggested-1/approve', { method: 'POST' })
})

test('clicking a task title opens the detail drawer with evidence and management actions', () => {
  render(<TasksClient initialTasks={tasks}/>)
  fireEvent.click(screen.getAllByRole('button', { name: 'Write launch plan' })[0])
  const drawer = screen.getByRole('dialog', { name: 'Task details: Write launch plan' })
  expect(drawer).toBeInTheDocument()
  expect(within(drawer).getByText('Please finish the launch plan.')).toBeInTheDocument()
  expect(screen.getByRole('button', { name: 'Ask Neuron' })).toBeInTheDocument()
  expect(screen.getByRole('button', { name: 'Remind me' })).toBeInTheDocument()
  expect(screen.getByRole('button', { name: 'Snooze' })).toBeInTheDocument()
  expect(screen.getByRole('button', { name: 'Schedule' })).toBeInTheDocument()
  expect(screen.getByRole('button', { name: 'Assign to' })).toBeInTheDocument()
  expect(screen.getByRole('button', { name: 'Feedback' })).toBeInTheDocument()
})

test('reminder action stores a selected reminder without changing the schema', async () => {
  jest.mocked(global.fetch).mockResolvedValue({
    ok: true,
    json: async () => ({ task: { ...tasks[0], metadata: { reminderAt: '2026-07-25T00:00:00.000Z' } } }),
  } as Response)
  render(<TasksClient initialTasks={tasks}/>)
  fireEvent.click(screen.getAllByRole('button', { name: 'Write launch plan' })[0])
  fireEvent.click(screen.getByRole('button', { name: 'Remind me' }))
  fireEvent.click(screen.getByRole('button', { name: 'Later today' }))
  await waitFor(() => expect(global.fetch).toHaveBeenCalledWith('/api/tasks/active-1/reminder', expect.objectContaining({
    method: 'POST',
    headers: { 'content-type': 'application/json' },
  })))
})

// --- Suggested-tasks layout: order, preview limit, See more / Hide ---

const manySuggested: any[] = [
  { ...base, id: 'active-x', title: 'Write launch plan', status: 'active' },
  ...Array.from({ length: 7 }, (_, index) => ({
    ...base,
    id: `sug-${index}`,
    title: `Suggested task ${index}`,
    status: 'suggested',
    sourceType: 'telegram',
    sourceTitle: 'Dispatch',
  })),
]

test('active tasks render before suggested tasks', () => {
  const { container } = render(<TasksClient initialTasks={manySuggested}/>)
  const html = container.innerHTML
  expect(html.indexOf('Write launch plan')).toBeLessThan(html.indexOf('Suggested tasks'))
})

test('suggested tasks show only 4 by default', () => {
  render(<TasksClient initialTasks={manySuggested}/>)
  const section = screen.getByTestId('suggested-tasks-section')
  expect(within(section).getByText('Suggested task 0')).toBeInTheDocument()
  expect(within(section).getByText('Suggested task 3')).toBeInTheDocument()
  expect(within(section).queryByText('Suggested task 4')).not.toBeInTheDocument()
})

test('See more appears when suggested count exceeds 4 and reveals the rest', () => {
  render(<TasksClient initialTasks={manySuggested}/>)
  const section = screen.getByTestId('suggested-tasks-section')
  fireEvent.click(within(section).getByRole('button', { name: /see more/i }))
  expect(within(section).getByText('Suggested task 6')).toBeInTheDocument()
})

test('Hide appears when expanded and collapses back to 4', () => {
  render(<TasksClient initialTasks={manySuggested}/>)
  const section = screen.getByTestId('suggested-tasks-section')
  fireEvent.click(within(section).getByRole('button', { name: /see more/i }))
  fireEvent.click(within(section).getByRole('button', { name: /^hide$/i }))
  expect(within(section).queryByText('Suggested task 4')).not.toBeInTheDocument()
  expect(within(section).getByText('Suggested task 3')).toBeInTheDocument()
})

test('no See more button when 4 or fewer suggested tasks', () => {
  const few = [manySuggested[0], ...manySuggested.slice(1, 4)]
  render(<TasksClient initialTasks={few}/>)
  const section = screen.getByTestId('suggested-tasks-section')
  expect(within(section).queryByRole('button', { name: /see more/i })).not.toBeInTheDocument()
})

test('empty suggested section shows the waiting copy', () => {
  render(<TasksClient initialTasks={[manySuggested[0]]}/>)
  expect(screen.getByText('No suggested tasks waiting.')).toBeInTheDocument()
})

test('suggested count and subtext render', () => {
  render(<TasksClient initialTasks={manySuggested}/>)
  const section = screen.getByTestId('suggested-tasks-section')
  expect(within(section).getByText('7 waiting for review')).toBeInTheDocument()
  expect(within(section).getByText(/Review tasks Neuron found from your connected tools/i)).toBeInTheDocument()
})
