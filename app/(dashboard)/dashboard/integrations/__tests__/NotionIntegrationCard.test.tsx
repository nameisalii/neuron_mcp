import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import NotionIntegrationCard from '../NotionIntegrationCard'

const refresh = jest.fn()
jest.mock('next/navigation', () => ({ useRouter: () => ({ refresh }) }))

beforeEach(() => {
  jest.clearAllMocks()
})

describe('NotionIntegrationCard', () => {
  it('opens the setup guide before starting the disconnected Notion flow', () => {
    global.fetch = jest.fn()
    render(
      <NotionIntegrationCard
        connected={false}
        workspaceId="workspace-1"
        pageCount={0}
        lastSyncedLabel="Never"
      />,
    )

    fireEvent.click(screen.getByRole('button', { name: 'Connect' }))

    expect(screen.getByRole('dialog', { name: 'Set up Notion' })).toBeInTheDocument()
    expect(screen.getByText('Choose the pages Neuron can read')).toBeInTheDocument()
    expect(global.fetch).not.toHaveBeenCalled()
  })

  it('starts the existing Notion connection process only after Continue to Notion', async () => {
    global.fetch = jest.fn().mockResolvedValue({ ok: true, json: async () => ({ success: true }) }) as never
    render(
      <NotionIntegrationCard
        connected={false}
        workspaceId="workspace-1"
        pageCount={0}
        lastSyncedLabel="Never"
      />,
    )

    fireEvent.click(screen.getByRole('button', { name: 'Connect' }))
    fireEvent.click(screen.getByRole('button', { name: 'Continue to Notion' }))

    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledWith('/api/integrations/notion/connect', {
        method: 'POST',
      })
      expect(refresh).toHaveBeenCalled()
    })
  })

  it('shows consistent controls and zero-page guidance when connected', () => {
    render(
      <NotionIntegrationCard
        connected
        workspaceId="workspace-1"
        pageCount={0}
        lastSyncedLabel="Never"
      />,
    )

    expect(screen.getByRole('link', { name: 'View' })).toHaveAttribute('href', '/dashboard/integrations/notion')
    expect(screen.getByRole('button', { name: 'Sync Now' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Nuclear Reset' })).toBeInTheDocument()
    expect(screen.getByText('Connected')).toBeInTheDocument()
    expect(screen.getByText('No Notion pages were found. Open Notion, share pages with the Neuron integration, then sync again.')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'View setup guide' }))
    expect(screen.getByRole('dialog', { name: 'Set up Notion' })).toBeInTheDocument()
  })
})
