/** @jest-environment node */
import { POST } from '../route'
import { auth } from '@clerk/nextjs/server'

jest.mock('@clerk/nextjs/server', () => ({ auth: jest.fn() }))

const request = new Request('http://localhost/api/integrations/notion/connect', { method: 'POST' })

describe('POST /api/integrations/notion/connect', () => {
  it('requires authentication', async () => {
    ;(auth as unknown as jest.Mock).mockResolvedValue({ userId: null })

    const response = await POST(request)

    expect(response.status).toBe(401)
  })

  it('hands authenticated users to the existing Notion connection process', async () => {
    ;(auth as unknown as jest.Mock).mockResolvedValue({ userId: 'user-1' })

    const response = await POST(request)

    expect(response.status).toBe(307)
    expect(response.headers.get('location')).toBe('http://localhost/api/integrations/notion/sync')
  })
})
