/**
 * @jest-environment node
 */
import { evaluateCapture } from '../capture-rules'
import { prisma } from '@/lib/db'

jest.mock('@/lib/db', () => ({
  prisma: { captureRule: { findMany: jest.fn() } },
}))

const mockFindMany = jest.mocked(prisma.captureRule.findMany)

const WS = 'ws-1'

function makeRule(id: string, ruleType: string, target: string, targetName = 'Test Rule') {
  return { id, ruleType, target, targetName }
}

beforeEach(() => jest.clearAllMocks())

describe('evaluateCapture', () => {
  it('captures by default when no rules configured', async () => {
    mockFindMany.mockResolvedValue([])
    const result = await evaluateCapture(WS, { integration: 'notion', sourceId: 'page-1', contentPreview: 'Hello' })
    expect(result.decision).toBe('capture')
    expect(result.reason).toBe('no_rules_configured')
    expect(result.ruleId).toBeUndefined()
  })

  it('captures when only exclude rules exist but none match', async () => {
    mockFindMany.mockResolvedValue([makeRule('r1', 'exclude', 'other-page')] as never)
    const result = await evaluateCapture(WS, { integration: 'notion', sourceId: 'page-1', contentPreview: 'Hello' })
    expect(result.decision).toBe('capture')
    expect(result.reason).toBe('no_include_rules_configured')
  })

  it('excludes when exclude rule matches sourceId', async () => {
    mockFindMany.mockResolvedValue([makeRule('r1', 'exclude', 'page-1', 'Skip Page')] as never)
    const result = await evaluateCapture(WS, { integration: 'notion', sourceId: 'page-1', contentPreview: 'Hello' })
    expect(result.decision).toBe('exclude')
    expect(result.ruleId).toBe('r1')
    expect(result.reason).toContain('Skip Page')
  })

  it('excludes when exclude rule matches keyword in contentPreview', async () => {
    mockFindMany.mockResolvedValue([makeRule('r2', 'exclude', 'secret', 'Secret Filter')] as never)
    const result = await evaluateCapture(WS, { integration: 'slack', sourceId: 'C001', contentPreview: 'This is a secret message' })
    expect(result.decision).toBe('exclude')
    expect(result.ruleId).toBe('r2')
  })

  it('captures when include rule matches sourceId', async () => {
    mockFindMany.mockResolvedValue([makeRule('r3', 'include', 'page-1', 'Include Page')] as never)
    const result = await evaluateCapture(WS, { integration: 'notion', sourceId: 'page-1', contentPreview: 'Hello' })
    expect(result.decision).toBe('capture')
    expect(result.ruleId).toBe('r3')
    expect(result.reason).toContain('Include Page')
  })

  it('skips when include rules exist but none match', async () => {
    mockFindMany.mockResolvedValue([makeRule('r4', 'include', 'other-page')] as never)
    const result = await evaluateCapture(WS, { integration: 'notion', sourceId: 'page-1', contentPreview: 'Hello' })
    expect(result.decision).toBe('skip')
    expect(result.reason).toBe('no_include_rule_matched')
    expect(result.ruleId).toBeUndefined()
  })

  it('exclude takes priority over matching include rule', async () => {
    mockFindMany.mockResolvedValue([
      makeRule('r5', 'include', 'page-1', 'Include'),
      makeRule('r6', 'exclude', 'page-1', 'Exclude'),
    ] as never)
    const result = await evaluateCapture(WS, { integration: 'notion', sourceId: 'page-1', contentPreview: 'Hello' })
    expect(result.decision).toBe('exclude')
    expect(result.ruleId).toBe('r6')
  })

  it('queries prisma with correct workspaceId and integration', async () => {
    mockFindMany.mockResolvedValue([])
    await evaluateCapture(WS, { integration: 'slack', sourceId: 'C001', contentPreview: '' })
    expect(mockFindMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { workspaceId: WS, integration: 'slack' } }),
    )
  })
})
