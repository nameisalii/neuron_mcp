import { decrypt } from '@/lib/crypto'
import { getConnectedIntegrationToken } from '../connection-server'

jest.mock('@/lib/crypto', () => ({ decrypt: jest.fn() }))

const mockDecrypt = jest.mocked(decrypt)

beforeEach(() => {
  jest.clearAllMocks()
  mockDecrypt.mockReturnValue('workspace-notion-token')
})

it('returns the decrypted token for a connected integration', () => {
  expect(getConnectedIntegrationToken({
    type: 'notion',
    accessToken: 'encrypted-token',
    metadata: { status: 'connected' },
  })).toBe('workspace-notion-token')
})

it('treats an undecryptable credential as disconnected', () => {
  mockDecrypt.mockImplementation(() => {
    throw new Error('invalid ciphertext')
  })

  expect(getConnectedIntegrationToken({
    type: 'notion',
    accessToken: 'stale-token',
    metadata: { status: 'connected' },
  })).toBeNull()
})

it('enforces solo workspace ownership before decrypting', () => {
  const token = getConnectedIntegrationToken({
    type: 'notion',
    accessToken: 'encrypted-token',
    metadata: { status: 'connected', connectedBy: 'user-a' },
  }, {
    currentUserId: 'user-b',
    workspaceType: 'solo',
    workspaceOwnerClerkId: 'user-a',
  })

  expect(token).toBeNull()
  expect(mockDecrypt).not.toHaveBeenCalled()
})
