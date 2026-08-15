import { calculateKnowledgeHealth } from '../knowledgeHealthService'
import { calculateStaleScore } from '../staleKnowledgeService'
import { calculateConcentration } from '../knowledgeRiskService'
import { isMeaningfulChange } from '../changeDetectionService'
import { discoverRepeatedProcesses } from '../processDiscoveryService'

describe('company intelligence deterministic scoring', () => {
  test('health is bounded and weighting is explicit', () => { expect(calculateKnowledgeHealth({ coverage: 100, freshness: 0, consistency: 100, connectivity: 100, distribution: 100 }).score).toBe(80); expect(calculateKnowledgeHealth({ coverage: 900 }).score).toBe(100); expect(calculateKnowledgeHealth({}).insufficientData).toBe(true) })
  test('age alone is insufficient but newer activity raises staleness', () => { const oldOnly = calculateStaleScore({ ageDays: 70, expectedUpdateDays: 30, newerRelatedCount: 0, recentContradictions: 0 }); const changed = calculateStaleScore({ ageDays: 70, expectedUpdateDays: 30, newerRelatedCount: 3, recentContradictions: 1 }); expect(oldOnly).toBeLessThan(0.55); expect(changed).toBeGreaterThan(oldOnly); expect(calculateStaleScore({ ageDays: 70, expectedUpdateDays: 30, newerRelatedCount: 3, recentContradictions: 1, confirmedAt: new Date(), now: new Date() })).toBeLessThan(changed) })
  test('concentration handles percentages, zero volume, and minimum volume', () => { const [topic] = calculateConcentration([{ topic: 'Payments', person: 'Ali', ownership: 2 }, { topic: 'Payments', person: 'Abdi', authored: 1 }]); expect(topic.distribution.reduce((sum, row) => sum + row.percentage, 0)).toBeCloseTo(1); expect(topic.highRisk).toBe(true); expect(calculateConcentration([{ topic: 'Tiny', person: 'Ali' }])[0].highRisk).toBe(false) })
  test('trivial formatting changes are suppressed', () => { expect(isMeaningfulChange('Launch Sep 8', ' launch  sep 8 ')).toBe(false); expect(isMeaningfulChange('$79', '$99')).toBe(true) })
  test('processes require repeated evidence', () => { const at = (day: number) => new Date(2026, 0, day); const rows = [1, 2, 3].flatMap(run => [{ instanceId: String(run), step: 'Closed won', at: at(run), evidenceId: `a${run}` }, { instanceId: String(run), step: 'Onboard', at: at(run + 1), evidenceId: `b${run}` }]); expect(discoverRepeatedProcesses(rows)).toHaveLength(1); expect(discoverRepeatedProcesses(rows.slice(0, 4))).toHaveLength(0) })
})
