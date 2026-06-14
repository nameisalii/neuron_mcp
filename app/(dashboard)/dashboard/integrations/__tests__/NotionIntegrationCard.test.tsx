import { fireEvent, render, screen } from '@testing-library/react'
import NotionIntegrationCard from '../NotionIntegrationCard'

jest.mock('next/navigation', () => ({ useRouter: () => ({ refresh: jest.fn() }) }))

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
    expect(screen.getByText('Choose pages')).toBeInTheDocument()
    expect(screen.queryByText('Sync Now')).not.toBeInTheDocument()
    expect(screen.queryByText('Nuclear Reset')).not.toBeInTheDocument()
    expect(screen.queryByText('Connected')).not.toBeInTheDocument()
    expect(global.fetch).not.toHaveBeenCalled()
  })

  it('navigates to the connect route only after Continue to Notion', () => {
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
    expect(screen.getByRole('link', { name: 'Continue to Notion' })).toHaveAttribute(
      'href',
      '/api/integrations/notion/connect',
    )
    expect(global.fetch).not.toHaveBeenCalled()
  })

  it('shows consistent controls and zero-page guidance when connected', () => {
    render(
      <NotionIntegrationCard
        connected
        workspaceId="workspace-1"
        pageCount={0}
        hasSynced
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

  it('does not claim a zero-page sync result before the first sync', () => {
    render(
      <NotionIntegrationCard
        connected
        workspaceId="workspace-1"
        pageCount={0}
        lastSyncedLabel="Never"
      />,
    )

    expect(screen.getByText('Notion is connected. Click Sync Now to import your selected pages.')).toBeInTheDocument()
    expect(screen.queryByText('No Notion pages were found. Open Notion, share pages with the Neuron integration, then sync again.')).not.toBeInTheDocument()
  })
})
