import { detectSourceIntent, SOURCE_ALIASES } from '@/lib/query/sourceIntent'
import { isTtEldLiveQuestion } from '@/lib/tteld/query'

describe('detectSourceIntent', () => {
  it('detects datatruck from "data truck any updates"', () => {
    // Arrange
    const query = 'data truck any updates?'

    // Act
    const intent = detectSourceIntent(query)

    // Assert
    expect(intent.requestedSource).toBe('datatruck')
    expect(intent.aliases).toContain('data truck')
  })

  it('detects datatruck from "datatruck status"', () => {
    expect(detectSourceIntent('datatruck status?').requestedSource).toBe('datatruck')
  })

  it('detects five_eld from "five eld gps status"', () => {
    expect(detectSourceIntent('five eld gps status').requestedSource).toBe('five_eld')
  })

  it('detects telegram from "telegram recent messages"', () => {
    expect(detectSourceIntent('telegram recent messages').requestedSource).toBe('telegram')
  })

  it('returns null requestedSource when no source is named', () => {
    const intent = detectSourceIntent('what did we decide about refunds?')
    expect(intent.requestedSource).toBeNull()
    expect(intent.confidence).toBe(0)
  })

  describe('datatruck aliases from the spec', () => {
    const cases = [
      'data-truck update',
      'dispatch board update',
      'work orders',
      'trailers list',
      'drivers list',
      'trucks list',
      'orders update',
    ]
    it.each(cases)('routes %j to datatruck, never five_eld', (query) => {
      expect(detectSourceIntent(query).requestedSource).toBe('datatruck')
    })
  })

  describe('five_eld aliases from the spec', () => {
    const cases = [
      'five eld status',
      '5 eld status',
      'tt eld status',
      'live gps',
      'hours of service',
      'hos report',
      'truck assignments',
    ]
    it.each(cases)('routes %j to five_eld', (query) => {
      expect(detectSourceIntent(query).requestedSource).toBe('five_eld')
    })
  })

  it('prefers datatruck when both vocabularies could match', () => {
    // "truck" is a substring of both product vocabularies. DataTruck must win
    // when its own alias is present, otherwise "data truck" leaks to Five ELD.
    expect(detectSourceIntent('data truck gps').requestedSource).toBe('datatruck')
  })

  it('exposes a non-empty alias table for every declared source', () => {
    for (const [source, aliases] of SOURCE_ALIASES) {
      expect(aliases.length).toBeGreaterThan(0)
      expect(typeof source).toBe('string')
    }
  })
})

describe('isTtEldLiveQuestion — must not hijack DataTruck questions', () => {
  const mustNotMatch = [
    'data truck any updates?',
    'datatruck status?',
    'trucks list',
    'trailers list',
    'dispatch board update',
    'work orders',
    'orders update',
    'telegram recent messages',
    'what did telegram say recently',
    'what did we decide about refunds',
  ]

  it.each(mustNotMatch)('does not route %j to the live Five ELD branch', (query) => {
    expect(isTtEldLiveQuestion(query)).toBe(false)
  })

  const mustMatch = [
    'five eld status',
    'tt eld status',
    'five eld gps',
    'where is truck 118',
    'truck #118 location',
    'truck gps',
    'live gps',
    'driver location',
    'fleet location',
    'where is my driver',
    'stale gps',
    'route today',
    'currently moving',
    'hours of service',
  ]

  it.each(mustMatch)('still routes %j to the live Five ELD branch', (query) => {
    expect(isTtEldLiveQuestion(query)).toBe(true)
  })
})
