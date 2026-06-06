import { prisma } from '@/lib/db'

export interface CaptureItem {
  integration: 'notion' | 'slack'
  sourceId: string
  contentPreview: string
}

export interface CaptureDecision {
  decision: 'capture' | 'skip' | 'exclude'
  reason: string
  ruleId?: string
}

interface RuleRow {
  id: string
  ruleType: string
  target: string
  targetName: string
}

function matchesRule(rule: RuleRow, item: CaptureItem): boolean {
  if (rule.target === item.sourceId) return true
  if (item.contentPreview.toLowerCase().includes(rule.target.toLowerCase())) return true
  return false
}

export async function evaluateCapture(
  workspaceId: string,
  item: CaptureItem,
): Promise<CaptureDecision> {
  const rules = await prisma.captureRule.findMany({
    where: { workspaceId, integration: item.integration },
    orderBy: { createdAt: 'asc' },
    select: { id: true, ruleType: true, target: true, targetName: true },
  })

  if (rules.length === 0) {
    return { decision: 'capture', reason: 'no_rules_configured' }
  }

  for (const rule of rules.filter((r) => r.ruleType === 'exclude')) {
    if (matchesRule(rule, item)) {
      return { decision: 'exclude', reason: `excluded_by_rule:${rule.targetName}`, ruleId: rule.id }
    }
  }

  const includeRules = rules.filter((r) => r.ruleType === 'include')
  if (includeRules.length === 0) {
    return { decision: 'capture', reason: 'no_include_rules_configured' }
  }

  for (const rule of includeRules) {
    if (matchesRule(rule, item)) {
      return { decision: 'capture', reason: `included_by_rule:${rule.targetName}`, ruleId: rule.id }
    }
  }

  return { decision: 'skip', reason: 'no_include_rule_matched' }
}
