import { auth } from '@clerk/nextjs/server'
import { redirect } from 'next/navigation'
import { prisma } from '@/lib/db'
import { normalizeKnowledgeItem, type KnowledgeDisplayCategory } from '@/lib/knowledge/display'
import KnowledgePageClient from './KnowledgePageClient'

export const dynamic = 'force-dynamic'

const TYPE_FILTERS = new Set(['all', 'rules', 'decisions', 'ideas', 'facts', 'processes'])

export default async function KnowledgePage({
  searchParams,
}: {
  searchParams: Promise<{ type?: string }>
}) {
  const { userId } = await auth()
  if (!userId) redirect('/sign-in')

  const user = await prisma.user.findUnique({
    where: { clerkId: userId },
    select: { workspace: { select: { id: true } } },
  })
  if (!user?.workspace) redirect('/setup')
  const workspaceId = user.workspace.id
  const requestedType = (await searchParams).type ?? 'all'
  const initialType = (TYPE_FILTERS.has(requestedType) ? requestedType : 'all') as 'all' | KnowledgeDisplayCategory

  const visibleKnowledge = {
    workspaceId,
    OR: [
      { visibility: 'team' },
      { visibility: 'personal', visibilitySetBy: userId },
    ],
  }
  const archivedKnowledge = {
    OR: [
      { sourceMetadata: { path: ['knowledgeStatus'], equals: 'archived' } },
      { sourceMetadata: { path: ['archived'], equals: true } },
    ],
  }
  const ruleKnowledge = {
    OR: [
      { category: { in: ['rule', 'rules'], mode: 'insensitive' as const } },
      { sourceMetadata: { path: ['knowledgeType'], equals: 'rule' } },
      { sourceMetadata: { path: ['knowledgeType'], equals: 'rules' } },
      { sourceMetadata: { path: ['type'], equals: 'rule' } },
      { sourceMetadata: { path: ['type'], equals: 'rules' } },
    ],
  }
  const decisionKnowledge = {
    OR: [
      { category: { in: ['decision', 'decisions'], mode: 'insensitive' as const } },
      { sourceMetadata: { path: ['knowledgeType'], equals: 'decision' } },
      { sourceMetadata: { path: ['knowledgeType'], equals: 'decisions' } },
      { sourceMetadata: { path: ['type'], equals: 'decision' } },
      { sourceMetadata: { path: ['type'], equals: 'decisions' } },
    ],
  }

  const [visibleCount, archivedCount, rules, decisions, knowledgeItems] = await Promise.all([
    prisma.knowledgeItem.count({ where: visibleKnowledge }),
    prisma.knowledgeItem.count({ where: { AND: [visibleKnowledge, archivedKnowledge] } }),
    prisma.knowledgeItem.count({ where: { AND: [visibleKnowledge, ruleKnowledge, { NOT: archivedKnowledge }] } }),
    prisma.knowledgeItem.count({ where: { AND: [visibleKnowledge, decisionKnowledge, { NOT: archivedKnowledge }] } }),
    prisma.knowledgeItem.findMany({
      where: visibleKnowledge,
      orderBy: [{ updatedAt: 'desc' }, { createdAt: 'desc' }],
      take: 100,
      select: {
        id: true,
        content: true,
        summary: true,
        reason: true,
        label: true,
        category: true,
        source: true,
        sourceUrl: true,
        sourceMetadata: true,
        notionPageTitle: true,
        verified: true,
        createdAt: true,
        updatedAt: true,
      },
    }),
  ])

  const items = knowledgeItems
    .map(item => ({ item, normalized: normalizeKnowledgeItem(item) }))
    .filter(({ normalized }) => !normalized.displayArchived)
    .map(({ item, normalized }) => ({
      id: item.id,
      title: normalized.displayTitle,
      summary: normalized.displaySummary,
      content: item.content,
      category: normalized.displayCategory,
      source: normalized.displayIntegration,
      date: new Date(normalized.displayDate ?? item.createdAt).toISOString(),
      verified: item.verified,
      sourceUrl: item.sourceUrl ?? normalized.displaySourceUrl ?? null,
    }))

  return (
    <KnowledgePageClient
      counts={{
        total: Math.max(0, visibleCount - archivedCount),
        rules,
        decisions,
        integrations: new Set(items.map(item => item.source)).size,
      }}
      items={items}
      initialType={initialType}
    />
  )
}
