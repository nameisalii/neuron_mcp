import { render, screen, waitFor } from '@testing-library/react'
import WorkspaceSwitcher from '../WorkspaceSwitcher'

beforeEach(() => {
  global.fetch = jest.fn().mockResolvedValue({
    json: async () => ({
      workspaces: [{ id: 'ws-1', name: 'neoron', type: 'solo', iconUrl: null, role: 'owner', isOwner: true, memberCount: 1 }],
    }),
  })
})

it('does not show a member count for solo workspaces', async () => {
  render(<WorkspaceSwitcher currentWorkspaceId="ws-1" onUpgradeClick={jest.fn()} />)
  await waitFor(() => expect(screen.getByText('neoron')).toBeInTheDocument())
  expect(screen.queryByText(/1 members/i)).not.toBeInTheDocument()
  expect(screen.getByText('owner')).toBeInTheDocument()
})
