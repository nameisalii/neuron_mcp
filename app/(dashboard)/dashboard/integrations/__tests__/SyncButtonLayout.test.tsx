import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import SyncButton from '../SyncButton'

const mockRefresh = jest.fn()
jest.mock('next/navigation', () => ({ useRouter: () => ({ refresh: mockRefresh }) }))

beforeEach(() => {
  jest.clearAllMocks()
  global.fetch = jest.fn().mockResolvedValue({ ok: true, json: async () => ({ success: true, fetched: 0 }) } as Response)
})

test('renders the sync message after Disconnect in the shared action row', async () => {
  render(<div data-testid="actions" className="flex flex-wrap items-center gap-3">
    <button>View</button>
    <SyncButton endpoint="/api/sync" hideReset />
    <button>Setup</button>
    <button>Disconnect</button>
  </div>)

  fireEvent.click(screen.getByRole('button', { name: 'Sync Now' }))
  expect(await screen.findByText('No new items found.')).toBeInTheDocument()

  const disconnect = screen.getByRole('button', { name: 'Disconnect' })
  const message = screen.getByText('No new items found.')
  expect(disconnect.compareDocumentPosition(message) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
  expect(screen.getByRole('button', { name: 'Sync Now' })).not.toContainElement(message)
})

test('preserves clickable buttons and exposes inline loading status', async () => {
  let resolveRequest!: (value: Response) => void
  jest.mocked(global.fetch).mockReturnValue(new Promise(resolve => { resolveRequest = resolve }))
  render(<div><button>View</button><SyncButton endpoint="/api/sync" hideReset/><button>Setup</button><button>Disconnect</button></div>)

  fireEvent.click(screen.getByRole('button', { name: 'Sync Now' }))
  expect(screen.getByText('Syncing integration…')).toBeInTheDocument()
  expect(screen.getByRole('button', { name: 'View' })).toBeEnabled()
  expect(screen.getByRole('button', { name: 'Setup' })).toBeEnabled()
  expect(screen.getByRole('button', { name: 'Disconnect' })).toBeEnabled()

  resolveRequest({ ok: true, json: async () => ({ success: true, fetched: 0 }) } as Response)
  await waitFor(() => expect(screen.getByText('No new items found.')).toBeInTheDocument())
})
