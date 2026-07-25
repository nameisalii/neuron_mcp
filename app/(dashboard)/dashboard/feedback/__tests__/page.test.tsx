import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import FeedbackPage from '../page'

beforeEach(() => {
  global.fetch = jest.fn().mockResolvedValue({ ok: true, json: async () => ({ ok: true }) })
})

it('renders and submits the in-product feedback form', async () => {
  render(<FeedbackPage />)

  fireEvent.change(screen.getByRole('combobox', { name: 'Type' }), { target: { value: 'Bug report' } })
  fireEvent.change(screen.getByRole('textbox', { name: 'Message' }), { target: { value: 'The task drawer is confusing.' } })
  fireEvent.click(screen.getByRole('button', { name: 'Submit feedback' }))

  await waitFor(() => expect(global.fetch).toHaveBeenCalledWith('/api/feedback', expect.objectContaining({ method: 'POST' })))
  expect(await screen.findByRole('status')).toHaveTextContent('Thank you — your feedback was sent.')
})
