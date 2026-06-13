import { motion, type Variants } from 'framer-motion'
import KnowledgeCard from '@/components/KnowledgeCard'
import type { QuerySource } from '@/lib/query/source-ranking'

export type SourceItem = QuerySource

interface Props {
  source: SourceItem
  i: number
  variants?: Variants
}

export default function SourceCard({ source, i, variants }: Props) {
  return (
    <motion.div variants={variants} data-relevance-rank={i + 1}>
      <KnowledgeCard
        compact
        item={{
          content: source.content,
          category: source.labels[0] ?? 'fact',
          source: source.source,
          sourceUrl: source.sourceUrl ?? (source.source === 'notion' && source.pageId ? `/dashboard/notion/${source.pageId}` : null),
          sourceExternalId: source.sourceExternalId,
          owner: source.owner,
          sourceCreatedAt: source.sourceCreatedAt,
          updatedAt: source.updatedAt,
          title: source.pageTitle,
          sourceLabels: source.labels,
        }}
      />
    </motion.div>
  )
}
