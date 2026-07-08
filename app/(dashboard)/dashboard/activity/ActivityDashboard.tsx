'use client'

import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import Link from 'next/link'
import { clsx } from 'clsx'
import {
  AlertTriangle,
  ArrowUpRight,
  Brain,
  CheckCircle2,
  FileText,
  Filter,
  Loader2,
  MessageSquareText,
  RefreshCcw,
  ShieldAlert,
  SlidersHorizontal,
  Sparkles,
  Tag,
  Users,
  type LucideIcon,
} from 'lucide-react'
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion'
import { Card, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import SourceIcon from '@/components/SourceIcon'
import type {
  BrainActivityAnalytics,
  IntegrationHealthStat,
  ActivityFeedEvent,
} from '@/lib/activity/analytics'

interface Member {
  userId: string
  displayName: string
  avatarUrl?: string | null
}

interface ApiResponse {
  success: boolean
  data: ActivityFeedEvent[]
  meta: { total: number; page: number; limit: number }
}

interface Props {
  workspaceId: string
  workspaceType: string
  members: Member[]
  currentUserId: string
  analytics: BrainActivityAnalytics
}

const EVENT_FILTERS = [
  { value: '', label: 'All' },
  { value: 'sync', label: 'Syncs' },
  { value: 'label', label: 'Labels' },
  { value: 'query', label: 'Queries' },
  { value: 'invite', label: 'Team' },
  { value: 'conflict_detected', label: 'Conflicts' },
]

const EVENT_STYLES: Record<string, { label: string; icon: LucideIcon; tone: string }> = {
  sync: { label: 'Sync', icon: RefreshCcw, tone: 'bg-blue-50 text-blue-700 border-blue-200' },
  label: { label: 'Label', icon: Tag, tone: 'bg-violet-50 text-violet-700 border-violet-200' },
  verify: { label: 'Verify', icon: ShieldAlert, tone: 'bg-emerald-50 text-emerald-700 border-emerald-200' },
  invite: { label: 'Team', icon: Users, tone: 'bg-emerald-50 text-emerald-700 border-emerald-200' },
  join: { label: 'Team', icon: Users, tone: 'bg-emerald-50 text-emerald-700 border-emerald-200' },
  settings_change: { label: 'Settings', icon: SlidersHorizontal, tone: 'bg-gray-100 text-gray-700 border-gray-200' },
  conflict_detected: { label: 'Conflict', icon: AlertTriangle, tone: 'bg-red-50 text-red-700 border-red-200' },
  page_viewed: { label: 'View', icon: FileText, tone: 'bg-gray-100 text-gray-700 border-gray-200' },
  query: { label: 'Query', icon: MessageSquareText, tone: 'bg-amber-50 text-amber-700 border-amber-200' },
}

const FEED_DEFAULT_VISIBLE = 5
const FEED_VISIBLE_STEP = 5

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime()
  const seconds = Math.floor(diff / 1000)
  if (seconds < 60) return 'just now'
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`
  if (seconds < 86400 * 7) return `${Math.floor(seconds / 86400)}d ago`
  return new Date(iso).toLocaleDateString()
}

function initials(name: string): string {
  const parts = name.split(/\s+/).filter(Boolean)
  if (parts.length === 0) return '?'
  if (parts.length === 1) return parts[0]!.slice(0, 2).toUpperCase()
  return `${parts[0]![0]}${parts[1]![0]}`.toUpperCase()
}

function formatChipLabel(value: string): string {
  return value
    .replace(/[_-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/\b\w/g, (letter) => letter.toUpperCase())
}

function stringMeta(metadata: Record<string, unknown> | null | undefined, key: string): string | null {
  const value = metadata?.[key]
  return typeof value === 'string' && value.trim() ? value : null
}

function activityLinks(event: ActivityFeedEvent): Array<{ label: string; href: string }> {
  const metadata = event.metadata ?? null
  const conversationId = stringMeta(metadata, 'conversationId')
  const documentId = stringMeta(metadata, 'documentId')
  const sourceUrl = stringMeta(metadata, 'sourceUrl')
  const integration = stringMeta(metadata, 'integration')
  return [
    conversationId ? { label: 'Open conversation', href: `/dashboard/query?conversationId=${encodeURIComponent(conversationId)}` } : null,
    documentId ? { label: 'Open document', href: `/api/documents/${encodeURIComponent(documentId)}` } : null,
    sourceUrl ? { label: 'Open source', href: sourceUrl } : null,
    integration ? { label: 'View integration', href: `/dashboard/integrations/${encodeURIComponent(integration)}` } : null,
  ].filter((link): link is { label: string; href: string } => Boolean(link))
}

function StatCard({
  icon: Icon,
  label,
  value,
  note,
}: {
  icon: LucideIcon
  label: string
  value: string
  note: string
}) {
  return (
    <Card padding="md">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-[12px] font-medium uppercase tracking-[0.18em] text-ink-muted">{label}</p>
          <p className="mt-2 text-[30px] font-semibold tracking-tight text-ink-primary">{value}</p>
          <p className="mt-2 text-[13px] text-ink-muted">{note}</p>
        </div>
        <span className="inline-flex h-10 w-10 items-center justify-center rounded-2xl border border-line-subtle bg-bg-card text-ink-secondary">
          <Icon className="h-5 w-5" />
        </span>
      </div>
    </Card>
  )
}

function SectionShell({
  title,
  subtitle,
  action,
  children,
  testId,
}: {
  title: string
  subtitle: string
  action?: ReactNode
  children: ReactNode
  testId?: string
}) {
  return (
    <Card padding="lg" data-testid={testId}>
      <div className="mb-5 flex items-start justify-between gap-4">
        <div>
          <CardTitle className="text-[18px] sm:text-[20px]">{title}</CardTitle>
          <p className="mt-2 text-[13px] leading-relaxed text-ink-muted">{subtitle}</p>
        </div>
        {action}
      </div>
      {children}
    </Card>
  )
}

function EmptyBlock({ title, description }: { title: string; description: string }) {
  return (
    <div className="rounded-2xl border border-dashed border-line-subtle bg-bg-card/60 px-5 py-8 text-center">
      <p className="text-[15px] font-medium text-ink-primary">{title}</p>
      <p className="mt-2 text-[13px] leading-relaxed text-ink-muted">{description}</p>
    </div>
  )
}

function ChartBlock({ data }: { data: BrainActivityAnalytics['activityByDay'] }) {
  const max = Math.max(...data.map((day) => day.count), 0)
  if (max === 0) {
    return <EmptyBlock title="No activity yet." description="Start asking questions or connect integrations." />
  }

  return (
    <div className="grid grid-cols-7 gap-2 sm:gap-3">
      {data.map((day) => {
        const height = Math.max(10, Math.round((day.count / max) * 100))
        return (
          <div key={day.date} className="flex flex-col items-center gap-2">
            <div className="flex h-36 w-full items-end rounded-2xl border border-line-subtle bg-bg-card px-2 py-2 sm:h-44">
              <div className="flex h-full w-full flex-col items-center justify-end">
                <span className="mb-2 text-[12px] font-medium text-ink-primary">{day.count}</span>
                <div
                  className="w-full rounded-full bg-gradient-to-t from-accent/55 to-accent-primary shadow-soft transition-all"
                  style={{ height: `${height}%`, minHeight: '10px' }}
                  title={`${day.label}: ${day.count}`}
                />
              </div>
            </div>
            <div className="text-[12px] font-medium text-ink-muted">{day.label}</div>
          </div>
        )
      })}
    </div>
  )
}

function SourcesBlock({ sources }: { sources: BrainActivityAnalytics['sources'] }) {
  const max = Math.max(...sources.map((source) => source.count), 0)
  if (sources.length === 0) {
    return <EmptyBlock title="Connect integrations to see source activity." description="Source usage will appear here once Neuron starts ingesting knowledge." />
  }

  return (
    <div className="space-y-4">
      {sources.map((source) => {
        const width = max > 0 ? Math.max(8, Math.round((source.count / max) * 100)) : 0
        return (
          <div key={source.source} className="space-y-2">
            <div className="flex items-center gap-3">
              <SourceIcon source={source.source} size={18} />
              <div className="min-w-0 flex-1">
                <p className="truncate text-[14px] font-medium text-ink-primary">{source.label}</p>
              </div>
              <span className="text-[13px] font-semibold text-ink-secondary">{source.count}</span>
            </div>
            <div className="h-2 overflow-hidden rounded-full bg-gray-100">
              <div
                className="h-full rounded-full bg-gradient-to-r from-accent-primary to-accent"
                style={{ width: `${width}%` }}
                aria-hidden="true"
              />
            </div>
          </div>
        )
      })}
      <div className="pt-1">
        <Link href="/dashboard/integrations" className="inline-flex items-center gap-1 rounded-full border border-line-subtle bg-white px-3 py-1.5 text-[12px] font-medium text-ink-secondary transition-colors hover:border-accent hover:text-ink-primary">
          View all integrations
          <ArrowUpRight className="h-3.5 w-3.5" />
        </Link>
      </div>
    </div>
  )
}

function QuestionsBlock({ questions }: { questions: BrainActivityAnalytics['frequentQuestions'] }) {
  if (questions.length === 0) {
    return <EmptyBlock title="Questions will appear here." description="Questions will appear here after your team starts using Neuron." />
  }

  return (
    <div className="space-y-3">
      {questions.map((question) => (
        <div key={question.key} className="rounded-2xl border border-line-subtle bg-bg-card p-4">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0 flex-1">
              <p className="text-[14px] font-medium leading-6 text-ink-primary">{question.label}</p>
              <p className="mt-1 text-[13px] leading-relaxed text-ink-muted">{question.preview}</p>
            </div>
            <span className="rounded-full border border-line-subtle bg-white px-2.5 py-1 text-[12px] font-medium text-ink-secondary">
              {question.count}
            </span>
          </div>
          <div className="mt-3 flex flex-wrap items-center gap-2 text-[12px] text-ink-muted">
            <span>{timeAgo(question.lastAskedAt)}</span>
            {question.conversationId && (
              <Link
                href={`/dashboard/query?conversationId=${encodeURIComponent(question.conversationId)}`}
                className="inline-flex items-center gap-1 rounded-full border border-line-subtle bg-white px-2.5 py-1 font-medium text-ink-secondary transition-colors hover:border-accent hover:text-ink-primary"
              >
                Open conversation
                <ArrowUpRight className="h-3.5 w-3.5" />
              </Link>
            )}
          </div>
        </div>
      ))}
    </div>
  )
}

function UsersBlock({ members, users, currentUserId }: {
  members: Member[]
  users: BrainActivityAnalytics['activeUsers']
  currentUserId: string
}) {
  const memberLookup = useMemo(
    () => Object.fromEntries(members.map((member) => [member.userId, member])),
    [members],
  )

  if (users.length === 0) {
    return <EmptyBlock title="No active users yet." description="User activity will appear here once people start asking questions or triggering workspace events." />
  }

  return (
    <div className="space-y-3">
      {users.map((user) => {
        const member = memberLookup[user.userId]
        const avatarLabel = member?.displayName ?? user.displayName
        const avatarUrl = member?.avatarUrl ?? null
        return (
          <div key={user.userId} className="flex items-center gap-3 rounded-2xl border border-line-subtle bg-bg-card px-4 py-3">
            <div className="flex h-10 w-10 items-center justify-center overflow-hidden rounded-full border border-line-subtle bg-white text-[13px] font-semibold text-ink-primary">
              {avatarUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={avatarUrl} alt={avatarLabel} className="h-full w-full object-cover" />
              ) : (
                initials(avatarLabel)
              )}
            </div>
            <div className="min-w-0 flex-1">
              <p className="truncate text-[14px] font-medium text-ink-primary">
                {avatarLabel}
                {user.userId === currentUserId ? ' (you)' : ''}
              </p>
              <p className="text-[12px] text-ink-muted">
                {user.count} events and questions · {timeAgo(user.lastActiveAt)}
              </p>
            </div>
            <span className="rounded-full border border-line-subtle bg-white px-2.5 py-1 text-[12px] font-medium text-ink-secondary">
              {user.count}
            </span>
          </div>
        )
      })}
    </div>
  )
}

function AttentionBlock({ items }: { items: BrainActivityAnalytics['needsAttention'] }) {
  if (items.length === 0) {
    return (
      <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-5 py-4">
        <p className="text-[14px] font-medium text-emerald-800">All clear. No issues found.</p>
      </div>
    )
  }

  return (
    <div className="space-y-3">
      {items.map((item) => (
        <div
          key={`${item.label}:${item.description}`}
          className={clsx(
            'rounded-2xl border px-4 py-3',
            item.tone === 'danger'
              ? 'border-red-200 bg-red-50'
              : 'border-amber-200 bg-amber-50',
          )}
        >
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className={clsx('text-[14px] font-medium', item.tone === 'danger' ? 'text-red-800' : 'text-amber-800')}>{item.label}</p>
              <p className={clsx('mt-1 text-[13px] leading-relaxed', item.tone === 'danger' ? 'text-red-700' : 'text-amber-700')}>
                {item.description}
              </p>
            </div>
            {item.actionLabel && item.actionHref && (
              <Link
                href={item.actionHref}
                className="inline-flex shrink-0 items-center gap-1 rounded-full border border-white/60 bg-white px-2.5 py-1 text-[12px] font-medium text-ink-secondary shadow-sm transition-colors hover:border-accent hover:text-ink-primary"
              >
                {item.actionLabel}
                <ArrowUpRight className="h-3.5 w-3.5" />
              </Link>
            )}
          </div>
        </div>
      ))}
    </div>
  )
}

function HealthBlock({ items }: { items: BrainActivityAnalytics['integrationHealth'] }) {
  if (items.length === 0) {
    return <EmptyBlock title="No integration health data yet." description="Connect sources and sync content to see health at a glance." />
  }

  const toneStyles: Record<IntegrationHealthStat['status'], string> = {
    connected: 'bg-emerald-50 text-emerald-700 border-emerald-200',
    sync_warning: 'bg-amber-50 text-amber-700 border-amber-200',
    needs_setup: 'bg-gray-100 text-gray-700 border-gray-200',
    disconnected: 'bg-red-50 text-red-700 border-red-200',
  }

  return (
    <div className="space-y-3">
      {items.map((item) => (
        <div key={item.source} className="rounded-2xl border border-line-subtle bg-bg-card p-4">
          <div className="flex items-start gap-3">
            <SourceIcon source={item.source} size={18} />
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <p className="text-[14px] font-medium text-ink-primary">{item.label}</p>
                <span className={clsx('inline-flex items-center rounded-full border px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.14em]', toneStyles[item.status])}>
                  {item.statusLabel}
                </span>
              </div>
              <p className="mt-1 text-[12px] text-ink-muted">
                {item.itemCount.toLocaleString()} items
                {item.documentCount > 0 ? ` · ${item.documentCount.toLocaleString()} documents` : ''}
                {item.lastSyncAt ? ` · Last sync ${timeAgo(item.lastSyncAt)}` : ''}
              </p>
            </div>
            <Link
              href={item.href}
              className="inline-flex items-center gap-1 rounded-full border border-line-subtle bg-white px-2.5 py-1 text-[12px] font-medium text-ink-secondary transition-colors hover:border-accent hover:text-ink-primary"
            >
              View
              <ArrowUpRight className="h-3.5 w-3.5" />
            </Link>
          </div>
        </div>
      ))}
    </div>
  )
}

function KnowledgeBlock({ items }: { items: BrainActivityAnalytics['recentKnowledge'] }) {
  if (items.length === 0) {
    return <EmptyBlock title="New knowledge will appear here." description="New knowledge will appear here after syncs, uploads, or manual additions." />
  }

  return (
    <div className="space-y-3">
      {items.map((item) => (
        <div key={item.id} className="rounded-2xl border border-line-subtle bg-bg-card p-4">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0 flex-1">
              <p className="text-[14px] font-medium leading-6 text-ink-primary">{item.title}</p>
              <p className="mt-1 text-[13px] leading-relaxed text-ink-muted">{item.preview}</p>
              <div className="mt-3 flex flex-wrap items-center gap-2 text-[12px] text-ink-muted">
                <span className="rounded-full border border-line-subtle bg-white px-2.5 py-1 font-medium text-ink-secondary">
                  {item.sourceLabel}
                </span>
                <span className="rounded-full border border-line-subtle bg-white px-2.5 py-1 font-medium text-ink-secondary">
                  {formatChipLabel(item.category)}
                </span>
                <span>{timeAgo(item.updatedAt)}</span>
                {item.verified && (
                  <span className="inline-flex items-center gap-1 rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-1 font-medium text-emerald-700">
                    <CheckCircle2 className="h-3.5 w-3.5" />
                    Verified
                  </span>
                )}
              </div>
            </div>
            {item.href && (
              <Link
                href={item.href}
                className="inline-flex items-center gap-1 rounded-full border border-line-subtle bg-white px-2.5 py-1 text-[12px] font-medium text-ink-secondary transition-colors hover:border-accent hover:text-ink-primary"
              >
                Open
                <ArrowUpRight className="h-3.5 w-3.5" />
              </Link>
            )}
          </div>
        </div>
      ))}
    </div>
  )
}

function FeedRow({ event }: { event: ActivityFeedEvent }) {
  const meta = EVENT_STYLES[event.eventType] ?? {
    label: event.eventType,
    icon: Sparkles,
    tone: 'bg-gray-100 text-gray-700 border-gray-200',
  }
  const Icon = meta.icon
  const links = activityLinks(event)
  return (
    <div className="rounded-2xl border border-line-subtle bg-bg-card p-4 shadow-sm transition-colors hover:border-accent/40">
      <div className="flex items-start gap-3">
        <div className={clsx('mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl border', meta.tone)}>
          <Icon className="h-4.5 w-4.5" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-start gap-2">
            <p className="text-[14px] font-medium text-ink-primary">
              <span className="font-semibold">{event.displayName}</span>{' '}
              <span className="text-ink-secondary">{event.description}</span>
            </p>
            <span className={clsx('inline-flex items-center rounded-full border px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.16em]', meta.tone)}>
              {meta.label}
            </span>
          </div>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            {links.map((link) => {
              const external = link.href.startsWith('http')
              return external ? (
                <a
                  key={`${event.id}:${link.label}`}
                  href={link.href}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 rounded-full border border-line-subtle bg-white px-2.5 py-1 text-[12px] font-medium text-ink-secondary transition-colors hover:border-accent hover:text-ink-primary"
                >
                  {link.label}
                  <ArrowUpRight className="h-3.5 w-3.5" />
                </a>
              ) : (
                <Link
                  key={`${event.id}:${link.label}`}
                  href={link.href}
                  className="inline-flex items-center gap-1 rounded-full border border-line-subtle bg-white px-2.5 py-1 text-[12px] font-medium text-ink-secondary transition-colors hover:border-accent hover:text-ink-primary"
                >
                  {link.label}
                  <ArrowUpRight className="h-3.5 w-3.5" />
                </Link>
              )
            })}
          </div>
          <p className="mt-3 text-[12px] text-ink-muted">{timeAgo(event.createdAt)}</p>
        </div>
      </div>
    </div>
  )
}

export default function ActivityDashboard({ members, currentUserId, analytics }: Props) {
  const [events, setEvents] = useState<ActivityFeedEvent[]>(analytics.feed.events)
  const [loading, setLoading] = useState(false)
  const [page, setPage] = useState(1)
  const [totalPages, setTotalPages] = useState(Math.max(1, Math.ceil(analytics.feed.total / analytics.feed.limit)))
  const [filterType, setFilterType] = useState('')
  const [filterUser, setFilterUser] = useState('')
  const [visibleFeedCount, setVisibleFeedCount] = useState(FEED_DEFAULT_VISIBLE)
  const shouldReduceMotion = useReducedMotion()
  const hasMounted = useRef(false)

  const fetchEvents = useCallback(async () => {
    setLoading(true)
    try {
      const params = new URLSearchParams({ page: String(page), limit: String(analytics.feed.limit) })
      if (filterType) params.set('eventType', filterType)
      if (filterUser) params.set('userId', filterUser)
      const res = await fetch(`/api/activity?${params.toString()}`)
      const data = await res.json() as ApiResponse
      setEvents(data.data ?? [])
      setTotalPages(Math.max(1, Math.ceil((data.meta?.total ?? 0) / (data.meta?.limit ?? analytics.feed.limit))))
    } catch {
      // Non-fatal: keep the current feed visible.
    } finally {
      setLoading(false)
    }
  }, [analytics.feed.limit, filterType, filterUser, page])

  useEffect(() => {
    if (!hasMounted.current) {
      hasMounted.current = true
      return
    }
    void fetchEvents()
  }, [fetchEvents])

  const resetAndSetFilter = useCallback((nextFilter: string) => {
    setPage(1)
    setFilterType(nextFilter)
    setVisibleFeedCount(FEED_DEFAULT_VISIBLE)
  }, [])

  const resetAndSetUser = useCallback((nextUser: string) => {
    setPage(1)
    setFilterUser(nextUser)
    setVisibleFeedCount(FEED_DEFAULT_VISIBLE)
  }, [])

  const refreshFeed = useCallback(() => {
    void fetchEvents()
  }, [fetchEvents])

  const feedEmpty = events.length === 0 && !loading
  const visibleEvents = events.slice(0, visibleFeedCount)
  const hasMoreFeed = events.length > visibleFeedCount
  const canShowLess = visibleFeedCount > FEED_DEFAULT_VISIBLE && events.length > FEED_DEFAULT_VISIBLE

  return (
    <div className="mx-auto flex min-h-0 w-full max-w-7xl flex-col gap-6 overflow-hidden">
      <div className="space-y-2">
        <p className="font-mono text-[11px] uppercase tracking-[0.22em] text-ink-muted">Activity</p>
        <h1 className="text-[32px] font-semibold tracking-tight text-ink-primary sm:text-[40px]">Team Activity</h1>
        <p className="max-w-2xl text-[16px] leading-relaxed text-ink-muted">
          Workspace brain health, usage, and recent changes.
        </p>
      </div>

      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-6" data-testid="activity-kpis">
        <StatCard icon={Brain} label="Knowledge items" value={analytics.totals.knowledgeItems.toLocaleString()} note="All time" />
        <StatCard icon={MessageSquareText} label="Questions asked" value={analytics.totals.questionsAsked.toLocaleString()} note="All time query activity" />
        <StatCard icon={FileText} label="Documents" value={analytics.totals.documents.toLocaleString()} note="All uploaded and imported documents" />
        <StatCard icon={Filter} label="Active sources" value={analytics.totals.activeSources.toLocaleString()} note="Connected integrations and connectors" />
        <StatCard icon={Users} label="Active users" value={analytics.totals.activeUsers.toLocaleString()} note="Last 30 days" />
        <StatCard icon={RefreshCcw} label="Syncs" value={analytics.totals.syncs.toLocaleString()} note="Last 7 days" />
      </section>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1.55fr)_minmax(320px,0.9fr)]">
        <div className="space-y-6">
          <SectionShell
            title="Brain activity"
            subtitle="Events and questions from the last 7 days."
            action={<span className="rounded-full border border-line-subtle bg-white px-3 py-1 text-[12px] font-medium text-ink-muted">Last 7 days</span>}
            testId="activity-chart"
          >
            <ChartBlock data={analytics.activityByDay} />
          </SectionShell>

          <SectionShell
            title="Recent activity"
            subtitle="Latest questions, syncs, documents, and knowledge changes."
            action={
              <Button variant="ghost" size="sm" onClick={refreshFeed} disabled={loading} className="gap-2">
                {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCcw className="h-4 w-4" />}
                Refresh
              </Button>
            }
            testId="activity-feed"
          >
            <div className="mb-4 flex flex-wrap items-center gap-3">
              <div className="flex flex-wrap gap-1 rounded-2xl border border-line-subtle bg-bg-card p-1">
                {EVENT_FILTERS.map((filter) => (
                  <button
                    key={filter.value}
                    type="button"
                    onClick={() => resetAndSetFilter(filter.value)}
                    className={clsx(
                      'rounded-xl px-3 py-2 text-[13px] font-medium transition-colors',
                      filterType === filter.value
                        ? 'bg-navy text-white shadow-soft'
                        : 'text-ink-muted hover:bg-white hover:text-ink-primary',
                    )}
                  >
                    {filter.label}
                  </button>
                ))}
              </div>

              {members.length > 1 && (
                <select
                  value={filterUser}
                  onChange={(event) => resetAndSetUser(event.target.value)}
                  className="rounded-2xl border border-line-subtle bg-white px-3 py-2 text-[13px] text-ink-primary shadow-sm outline-none ring-0 transition focus:border-accent"
                >
                  <option value="">All members</option>
                  {members.map((member) => (
                    <option key={member.userId} value={member.userId}>
                      {member.displayName}{member.userId === currentUserId ? ' (you)' : ''}
                    </option>
                  ))}
                </select>
              )}
            </div>

            {loading ? (
              <div className="space-y-3">
                {[1, 2, 3].map((index) => (
                  <div key={index} className="rounded-2xl border border-line-subtle bg-bg-card p-4">
                    <div className="flex items-start gap-3">
                      <div className="h-10 w-10 animate-pulse rounded-2xl bg-gray-100" />
                      <div className="flex-1 space-y-2">
                        <div className="h-4 w-3/4 animate-pulse rounded-full bg-gray-100" />
                        <div className="h-3 w-1/3 animate-pulse rounded-full bg-gray-50" />
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            ) : feedEmpty ? (
              <EmptyBlock title="No activity yet." description="Connect an integration or ask your first question." />
            ) : (
              <div className="space-y-3">
                <AnimatePresence initial={false}>
                  {visibleEvents.map((event, index) => (
                    <motion.div
                      key={event.id}
                      initial={shouldReduceMotion ? { opacity: 1 } : { opacity: 0, y: 8 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={shouldReduceMotion ? { opacity: 1 } : { opacity: 0, y: -8 }}
                      transition={{ duration: shouldReduceMotion ? 0 : 0.2, delay: index * 0.015 }}
                    >
                      <FeedRow event={event} />
                    </motion.div>
                  ))}
                </AnimatePresence>
              </div>
            )}

            {!feedEmpty && (hasMoreFeed || canShowLess) && (
              <div className="mt-4 flex flex-wrap items-center gap-3 border-t border-line-subtle pt-4">
                {hasMoreFeed && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="gap-2"
                    onClick={() => setVisibleFeedCount((current) => Math.min(events.length, current + FEED_VISIBLE_STEP))}
                  >
                    <Sparkles className="h-4 w-4" />
                    Show more
                  </Button>
                )}
                {canShowLess && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="gap-2"
                    onClick={() => setVisibleFeedCount(FEED_DEFAULT_VISIBLE)}
                  >
                    <Sparkles className="h-4 w-4" />
                    Show less
                  </Button>
                )}
              </div>
            )}

            {totalPages > 1 && (
              <div className="mt-5 flex items-center justify-center gap-3 border-t border-line-subtle pt-4">
                <button
                  type="button"
                  onClick={() => setPage((current) => Math.max(1, current - 1))}
                  disabled={page === 1 || loading}
                  className="rounded-full border border-line-subtle bg-white px-3 py-1.5 text-[13px] font-medium text-ink-secondary transition-colors hover:border-accent hover:text-ink-primary disabled:cursor-not-allowed disabled:opacity-50"
                >
                  ← Previous
                </button>
                <span className="text-[13px] text-ink-muted">
                  {page} / {totalPages}
                </span>
                <button
                  type="button"
                  onClick={() => setPage((current) => Math.min(totalPages, current + 1))}
                  disabled={page === totalPages || loading}
                  className="rounded-full border border-line-subtle bg-white px-3 py-1.5 text-[13px] font-medium text-ink-secondary transition-colors hover:border-accent hover:text-ink-primary disabled:cursor-not-allowed disabled:opacity-50"
                >
                  Next →
                </button>
              </div>
            )}
          </SectionShell>

          <SectionShell
            title="Recent knowledge"
            subtitle="New and updated knowledge entering the brain."
            testId="activity-knowledge"
          >
            <KnowledgeBlock items={analytics.recentKnowledge} />
          </SectionShell>
        </div>

        <div className="space-y-6">
          <SectionShell
            title="Most used sources"
            subtitle="Where your workspace knowledge is coming from."
            testId="activity-sources"
          >
            <SourcesBlock sources={analytics.sources} />
          </SectionShell>

          <SectionShell
            title="Frequent questions"
            subtitle="What your team is asking Neuron."
            testId="activity-questions"
          >
            <QuestionsBlock questions={analytics.frequentQuestions} />
          </SectionShell>

          <SectionShell
            title="Needs attention"
            subtitle="Items that may need a human to review them."
            testId="activity-attention"
          >
            <AttentionBlock items={analytics.needsAttention} />
          </SectionShell>

          <SectionShell
            title="Integration health"
            subtitle="Connection status, sync health, and source volume."
            testId="activity-health"
          >
            <HealthBlock items={analytics.integrationHealth} />
          </SectionShell>

          <SectionShell
            title="Active users"
            subtitle="Who is using the brain most."
            testId="activity-users"
          >
            <UsersBlock members={members} users={analytics.activeUsers} currentUserId={currentUserId} />
          </SectionShell>
        </div>
      </div>
    </div>
  )
}
