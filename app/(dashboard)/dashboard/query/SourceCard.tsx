'use client'

import Link from 'next/link'
import { motion, type Variants } from 'framer-motion'
import { getLabelMeta } from '@/lib/labelColors'

export interface SourceItem {
  chunkId: string
  pageId: string
  pageTitle: string
  notionPageId: string
  content: string
  labels: string[]
  confidence: number
}

interface Props {
  source: SourceItem
  i: number
  variants?: Variants
}

export default function SourceCard({ source, i, variants }: Props) {
  const relevanceDot = i <= 1 ? 'bg-green-400' : i <= 3 ? 'bg-yellow-400' : 'bg-gray-300'

  return (
    <motion.div variants={variants}>
      <Link
        href={`/dashboard/notion/${source.pageId}`}
        className="block bg-white rounded-lg border border-gray-200 p-3 hover:border-gray-300 hover:shadow-sm transition-all"
      >
        <div className="flex items-start gap-2">
          <img src="/icons/notion.svg" className="w-4 h-4 mt-0.5 shrink-0" alt="Notion" />
          <div className="flex-1 min-w-0">
            <p className="font-medium text-sm text-gray-900 truncate">{source.pageTitle}</p>
            <p className="text-xs text-gray-500 mt-0.5 line-clamp-2">
              {source.content.slice(0, 100)}
            </p>
            {source.labels.length > 0 && (
              <div className="flex flex-wrap gap-1 mt-1.5">
                {source.labels.map((label) => {
                  const meta = getLabelMeta(label)
                  return (
                    <span
                      key={label}
                      className={`inline-flex px-1.5 py-0.5 rounded text-xs font-medium ${meta.bg} ${meta.text}`}
                    >
                      {meta.displayName}
                    </span>
                  )
                })}
              </div>
            )}
          </div>
          <span className={`w-2 h-2 rounded-full shrink-0 mt-1.5 ${relevanceDot}`} />
        </div>
      </Link>
    </motion.div>
  )
}
