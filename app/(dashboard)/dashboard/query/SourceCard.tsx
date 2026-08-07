import { motion, type Variants } from 'framer-motion'
import { ExternalLink } from 'lucide-react'
import SourceIcon from '@/components/SourceIcon'
import { extractInterviewDetails } from '@/lib/query/interview-details'
import type { QuerySource } from '@/lib/query/source-ranking'

export type SourceItem = QuerySource

interface Props {
  source: SourceItem
  i: number
  variants?: Variants
}

function titleCase(value: string) {
  if (value.toLowerCase() === 'five_eld') return 'Five ELD'
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

function isGenericTitle(value: string | null | undefined) {
  if (!value) return true
  return /^(fact|reference|update|message|note|status update|status_update)$/i.test(value.trim())
}

function previewTitle(content: string) {
  const firstLine = content.replace(/\s+/g, ' ').trim()
  if (!firstLine || isGenericTitle(firstLine)) return null
  return firstLine.length > 80 ? `${firstLine.slice(0, 77)}...` : firstLine
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

function sourceDomain(value: string | null): string | null {
  if (!value) return null
  try {
    return new URL(value).hostname
  } catch {
    return null
  }
}

export function getSourceTitle(source: SourceItem) {
  const primaryMetadataTitle = getMetadataValue(source, [
    'title',
    'subject',
    'fileName',
    'threadTitle',
    'loadNumber',
    'externalLoadId',
  ])
  if (source.source === 'datatruck') {
    const loadNumber = getMetadataValue(source, ['loadNumber', 'externalLoadId'])
    if (loadNumber) return `Load ${loadNumber}`
  }
  if (primaryMetadataTitle && !isGenericTitle(primaryMetadataTitle)) return primaryMetadataTitle
  if (!isGenericTitle(source.pageTitle)) return source.pageTitle
  const conversationTitle = getMetadataValue(source, ['channelName', 'chatTitle', 'groupName'])
  if (conversationTitle && !isGenericTitle(conversationTitle)) return conversationTitle
  return previewTitle(source.content) || titleCase(source.labels.find((label) => !isGenericTitle(label)) ?? source.source)
}

export function getSourceSubtitle(source: SourceItem) {
  if (source.source === 'five_eld' && source.sourceMetadata?.live === true) return 'Live Five ELD API'
  if (source.source === 'linked_page') {
    const metadata = source.sourceMetadata ?? {}
    const linkedFrom = metadata.linkedFrom && typeof metadata.linkedFrom === 'object' && !Array.isArray(metadata.linkedFrom)
      ? metadata.linkedFrom as Record<string, unknown>
      : {}
    const parentAccount = [
      'channelName',
      'channel',
      'chatTitle',
      'groupName',
      'authorName',
      'username',
      'senderName',
    ].map((key) => linkedFrom[key]).find((value): value is string => typeof value === 'string' && Boolean(value.trim()))
    const parentSource = typeof metadata.parentSource === 'string' ? titleCase(metadata.parentSource) : 'source'
    const domain = sourceDomain(source.sourceUrl)
    const fetchedAt = typeof metadata.fetchedAt === 'string' ? formatDate(metadata.fetchedAt) : null
    return [
      'Linked page',
      domain,
      `Linked from ${parentAccount ?? parentSource}`,
      parentAccount ? parentSource : null,
      fetchedAt ? `Fetched ${fetchedAt}` : null,
    ].filter((part): part is string => Boolean(part)).join(' · ')
  }
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
  if (source.source === 'telegram') {
    const mode = getMetadataValue(source, ['mode'])
    const account = getMetadataValue(source, [
      'channelName',
      'chatTitle',
      'channelUsername',
      'chatUsername',
      'groupName',
      'username',
    ]) || source.owner
    const modeLabel = mode === 'telegram_public_channel_import'
      ? 'Public Channel'
      : mode === 'telegram_account_sync' || mode === 'account_sync'
        ? 'Account Sync'
        : 'Bot Mode'
    const date = formatDate(source.sourceCreatedAt ?? source.updatedAt)
    return ['Telegram', modeLabel, account, date]
      .filter((part): part is string => Boolean(part && part !== 'undefined' && part !== 'null'))
      .join(' · ')
  }
  const account = getMetadataValue(source, [
    'channelName',
    'channel',
    'chatTitle',
    'groupName',
    'authorName',
    'username',
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
  const privacy = source.source === 'slack'
    ? source.visibility === 'personal' ? 'Personal' : 'Team'
    : null
  const parts = source.source === 'slack'
    ? [integration, account, date, privacy]
    : [account, integration, date]
  return parts.filter((part): part is string => Boolean(part && part !== 'undefined' && part !== 'null')).join(' · ')
}

export default function SourceCard({ source, i, variants }: Props) {
  const sourceUrl = source.sourceUrl ?? (source.source === 'notion' && source.pageId ? '/dashboard/knowledge' : null)
  const label = titleCase(source.labels[0] ?? source.source)
  const excerpt = source.content.trim()
  const gmailDetails = source.source === 'gmail' ? extractInterviewDetails(source, null) : null
  const detectedLinks = gmailDetails ? [...gmailDetails.meetingLinks, ...gmailDetails.assessmentLinks] : []

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
            <p className="mt-1 text-[11px] text-gray-400">{source.verified ? 'Verified source' : `${Math.round(Math.max(0, Math.min(source.relevanceScore, 1)) * 100)}% relevance`}</p>
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
      {source.source === 'gmail' && excerpt && (
        <details className="mt-2 text-xs text-gray-600">
          <summary className="cursor-pointer font-medium text-indigo-600">View email details</summary>
          <div className="mt-2 space-y-2 border-t border-gray-200 pt-2">
            <p className="max-h-40 overflow-y-auto whitespace-pre-wrap break-words leading-relaxed">{excerpt.slice(0, 2400)}</p>
            {detectedLinks.map((url) => (
              <a key={url} href={url} target="_blank" rel="noopener noreferrer" className="block break-all font-medium text-indigo-600 hover:text-indigo-700">
                {url.includes('zoom.us') ? 'Open Zoom link' : url.includes('meet.google.com') ? 'Open Google Meet link' : url.includes('teams.microsoft.com') ? 'Open Teams link' : 'Open assessment link'}
              </a>
            ))}
          </div>
        </details>
      )}
    </motion.div>
  )
}
