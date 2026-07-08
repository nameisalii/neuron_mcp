import { motion, type Variants } from 'framer-motion'
import { ExternalLink } from 'lucide-react'
import SourceIcon from '@/components/SourceIcon'
import type { QuerySource } from '@/lib/query/source-ranking'

export type SourceItem = QuerySource

interface Props {
  source: SourceItem
  i: number
  variants?: Variants
}

function titleCase(value: string) {
  return value
    .replace(/[_-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/\b\w/g, (letter) => letter.toUpperCase())
}

function getMetadataValue(source: SourceItem, keys: string[]) {
  const metadata = source.sourceMetadata ?? {}
  for (const key of keys) {
    const value = metadata[key]
    if (typeof value === 'string' && value.trim()) return value.trim()
  }
  return null
}

function formatDate(value: string | null) {
  if (!value) return null
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return null
  return new Intl.DateTimeFormat('en', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  }).format(date)
}

export function getSourceTitle(source: SourceItem) {
  return source.pageTitle || getMetadataValue(source, ['title', 'subject', 'fileName']) || titleCase(source.labels[0] ?? source.source)
}

export function getSourceSubtitle(source: SourceItem) {
  const manualMetadata = source.sourceMetadata ?? {}
  if (manualMetadata.manual === true) {
    const creator = getMetadataValue(source, ['createdByName']) ?? source.owner
    const integration = titleCase(typeof manualMetadata.integration === 'string' ? manualMetadata.integration : source.source)
    const loadId = getMetadataValue(source, ['externalLoadId'])
    return [creator, 'Manual', integration, loadId ? `Load ${loadId}` : null]
      .filter((part): part is string => Boolean(part))
      .join(' · ')
  }
  if (source.source === 'datatruck') {
    const metadata = source.sourceMetadata ?? {}
    const recordType = typeof metadata.recordType === 'string' ? metadata.recordType : ''
    const loadNumber = typeof metadata.loadNumber === 'string' ? metadata.loadNumber : null
    const driverName = typeof metadata.name === 'string'
      ? metadata.name
      : typeof metadata.driverName === 'string'
        ? metadata.driverName
        : null
    const unitNumber = typeof metadata.unitNumber === 'string' ? metadata.unitNumber : null
    const workOrderId = typeof metadata.workOrderId === 'string' ? metadata.workOrderId : null
    const summaryLabel = recordType === 'load'
      ? `Load ${loadNumber ?? source.sourceExternalId ?? source.pageTitle ?? 'record'}`
      : recordType === 'driver'
        ? `Driver ${driverName ?? source.owner ?? source.pageTitle ?? 'record'}`
        : recordType === 'truck'
          ? `Truck ${unitNumber ?? source.pageTitle ?? 'record'}`
          : recordType === 'trailer'
            ? `Trailer ${unitNumber ?? source.pageTitle ?? 'record'}`
            : recordType === 'work_order'
              ? `Work order ${workOrderId ?? source.pageTitle ?? 'record'}`
              : source.pageTitle ?? 'record'
    return ['Datatruck', summaryLabel].join(' · ')
  }
  const account = getMetadataValue(source, [
    'channelName',
    'channel',
    'authorName',
    'fromDisplayName',
    'senderName',
    'accountName',
    'userName',
    'email',
    'from',
    'name',
  ]) || source.owner
  const integration = titleCase(source.source)
  const date = formatDate(source.sourceCreatedAt ?? source.updatedAt)
  return [account, integration, date].filter((part): part is string => Boolean(part && part !== 'undefined' && part !== 'null')).join(' · ')
}

export default function SourceCard({ source, i, variants }: Props) {
  const sourceUrl = source.sourceUrl ?? (source.source === 'notion' && source.pageId ? `/dashboard/notion/${source.pageId}` : null)
  const label = titleCase(source.labels[0] ?? source.source)
  const excerpt = source.content.trim()

  return (
    <motion.div variants={variants} data-relevance-rank={i + 1} className="rounded-lg border border-gray-100 bg-gray-50/80 p-3">
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 gap-3">
          <SourceIcon source={source.source} size={18} />
          <div className="min-w-0">
            <div className="flex min-w-0 flex-wrap items-center gap-2">
              <h3 className="truncate text-sm font-medium text-gray-900">{getSourceTitle(source)}</h3>
              <span className="rounded-full bg-white px-2 py-0.5 text-[11px] font-medium text-gray-500 ring-1 ring-gray-200">
                {label}
              </span>
            </div>
            <p className="mt-1 text-xs text-gray-500">{getSourceSubtitle(source)}</p>
          </div>
        </div>
        {sourceUrl && (
          <a
            href={sourceUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex shrink-0 items-center gap-1 text-xs font-medium text-indigo-600 hover:text-indigo-700"
          >
            Open source
            <ExternalLink className="h-3 w-3" />
          </a>
        )}
      </div>
      {excerpt && <p className="mt-3 line-clamp-3 text-xs leading-relaxed text-gray-600">{excerpt}</p>}
    </motion.div>
  )
}
