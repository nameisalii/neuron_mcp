/** @jest-environment node */
import { listMessageIds, parseMessage } from '../api'

describe('Gmail API pagination', () => {
  afterEach(() => jest.restoreAllMocks())

  it('continues past the first page and exposes a resumable cursor at the budget', async () => {
    const fetchMock = jest.spyOn(global, 'fetch').mockImplementation(async (input) => {
      const token = new URL(String(input)).searchParams.get('pageToken')
      const page = token
        ? { messages: [{ id: 'm3', threadId: 't3' }], nextPageToken: 'cursor-3' }
        : { messages: [{ id: 'm1', threadId: 't1' }, { id: 'm2', threadId: 't2' }], nextPageToken: 'cursor-2' }
      return { ok: true, json: async () => page } as Response
    })

    const result = await listMessageIds('redacted-token', { cap: 3, pageSize: 2 })

    expect(fetchMock).toHaveBeenCalledTimes(2)
    expect(result.ids.map(({ id }) => id)).toEqual(['m1', 'm2', 'm3'])
    expect(result).toMatchObject({ hasMore: true, nextPageToken: 'cursor-3' })
  })

  it('uses Gmail snippet as a minimal record when MIME content is unavailable', () => {
    const parsed = parseMessage({
      id: 'm1', threadId: 't1', internalDate: '1786000000000', snippet: 'Safe preview',
      payload: { headers: [{ name: 'Subject', value: 'Status' }] },
    })
    expect(parsed?.body).toBe('Safe preview')
  })
})
