/**
 * @jest-environment node
 */
import { detectDatatruckResponseShape } from '../shape'

describe('detectDatatruckResponseShape', () => {
  it('detects a bare array', () => {
    const result = detectDatatruckResponseShape([{ id: 1, status: 'paid' }, { id: 2 }])

    expect(result.shape).toBe('array')
    expect(result.recordCount).toBe(2)
    expect(result.fieldNames).toEqual(['id', 'status'])
    expect(result.pagination.detected).toBe(false)
  })

  it('detects DRF-style results with pagination', () => {
    const result = detectDatatruckResponseShape({ count: 50, next: 'https://x.datatruck.io/?page=2', results: [{ id: 1 }] })

    expect(result.shape).toBe('results')
    expect(result.recordCount).toBe(1)
    expect(result.pagination).toEqual({ detected: true, nextField: 'next', pageField: null })
  })

  it('detects data and items containers', () => {
    expect(detectDatatruckResponseShape({ data: [{ id: 1 }] }).shape).toBe('data')
    expect(detectDatatruckResponseShape({ items: [{ id: 1 }], page: 1 })).toMatchObject({
      shape: 'items',
      pagination: { detected: true, pageField: 'page' },
    })
  })

  it('returns unknown for non-list payloads', () => {
    const result = detectDatatruckResponseShape({ message: 'hi' })

    expect(result.shape).toBe('unknown')
    expect(result.recordCount).toBe(0)
    expect(result.fieldNames).toEqual(['message'])
  })
})
