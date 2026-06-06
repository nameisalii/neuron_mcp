import { auth } from '@clerk/nextjs/server'
import { redirect } from 'next/navigation'
import { prisma } from '@/lib/db'
import Image from 'next/image'
import Link from 'next/link'
import { FileText, ChevronRight, Search, RefreshCw } from 'lucide-react'
import NotionSyncButton from '../integrations/NotionSyncButton'

function timeAgo(date: Date): string {
  const s = Math.floor((Date.now() - date.getTime()) / 1000)
  if (s < 60) return 'just now'
  if (s < 3600) return `${Math.floor(s / 60)}m ago`
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`
  if (s < 604800) return `${Math.floor(s / 86400)}d ago`
  return date.toLocaleDateString()
}

const LABEL_COLORS: Record<string, string> = {
  rule: 'bg-blue-500',
  decision: 'bg-purple-500',
  process: 'bg-amber-500',
  idea: 'bg-emerald-500',
  fact: 'bg-slate-500',
  context: 'bg-gray-400',
  reference: 'bg-cyan-500',
  meeting_note: 'bg-pink-500',
}

const LIMIT = 9

export default async function NotionPagesPage({
  searchParams,
}: {
  searchParams: { search?: string; filter?: string; page?: string }
}) {
  const { userId } = await auth()
  if (!userId) redirect('/sign-in')

  const user = await prisma.user.findUnique({
    where: { clerkId: userId },
    select: { workspace: { select: { id: true } } },
  })
  const workspaceId = user?.workspace?.id
  if (!workspaceId) redirect('/dashboard')

  const search = searchParams.search ?? ''
  const filter = searchParams.filter ?? ''
  const currentPage = Math.max(1, parseInt(searchParams.page ?? '1', 10) || 1)

  const notion = await prisma.integration.findUnique({
    where: { workspaceId_type: { workspaceId, type: 'notion' } },
    select: { lastSyncAt: true },
  })

  const isFresh = notion?.lastSyncAt
    ? Date.now() - notion.lastSyncAt.getTime() < 24 * 60 * 60 * 1000
    : false

  const baseWhere = {
    workspaceId,
    OR: [{ syncedBy: userId }, { chunks: { some: { visibility: 'team' } } }],
    ...(search ? { title: { contains: search, mode: 'insensitive' as const } } : {}),
    ...(filter === 'labeled' ? { chunks: { some: { labels: { not: [] } } } } : {}),
  }

  const [pages, total] = await Promise.all([
    prisma.notionPage.findMany({
      where: baseWhere,
      orderBy: { lastEditedAt: 'desc' },
      take: LIMIT,
      skip: (currentPage - 1) * LIMIT,
      include: { _count: { select: { chunks: true } } },
    }),
    prisma.notionPage.count({ where: baseWhere }),
  ])

  const pageIds = pages.map((p) => p.id)

  const [chunkData, memberData, parentPages] = await Promise.all([
    prisma.notionChunk.findMany({
      where: { notionPageId: { in: pageIds } },
      select: { notionPageId: true, labels: true },
    }),
    prisma.workspaceMember.findMany({
      where: {
        workspaceId,
        userId: { in: [...new Set(pages.map((p) => p.syncedBy).filter(Boolean) as string[])] },
      },
      select: { userId: true, displayName: true },
    }),
    prisma.notionPage.findMany({
      where: {
        workspaceId,
        notionPageId: { in: pages.map((p) => p.parentPageId).filter(Boolean) as string[] },
      },
      select: { notionPageId: true, title: true },
    }),
  ])

  const labeledCountMap = new Map<string, number>()
  const labelTypesMap = new Map<string, Set<string>>()
  for (const c of chunkData) {
    const labels = (c.labels as string[]) ?? []
    if (labels.length > 0) {
      labeledCountMap.set(c.notionPageId, (labeledCountMap.get(c.notionPageId) ?? 0) + 1)
      const types = labelTypesMap.get(c.notionPageId) ?? new Set()
      labels.forEach((l) => types.add(l))
      labelTypesMap.set(c.notionPageId, types)
    }
  }
  const syncedByMap = new Map(memberData.map((m) => [m.userId, m.displayName]))
  const parentMap = new Map(parentPages.map((p) => [p.notionPageId, p.title]))

  const totalPages = Math.ceil(total / LIMIT)

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <Image src="/icons/notion.svg" alt="Notion" width={32} height={32} className="rounded-md" />
          <div>
            <h1 className="text-xl font-bold text-gray-900">Notion Knowledge</h1>
            <p className="text-xs text-gray-500">{total} pages synced</p>
          </div>
          {notion?.lastSyncAt && (
            <span
              className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${
                isFresh ? 'bg-green-50 text-green-700' : 'bg-yellow-50 text-yellow-700'
              }`}
            >
              <span className={`w-1.5 h-1.5 rounded-full ${isFresh ? 'bg-green-500' : 'bg-yellow-400'}`} />
              {isFresh ? 'Fresh' : 'Stale'}
            </span>
          )}
        </div>
        <NotionSyncButton workspaceId={workspaceId} />
      </div>

      {/* Search/filter bar */}
      <form method="get" className="flex gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
          <input
            name="search"
            defaultValue={search}
            placeholder="Search pages…"
            className="w-full pl-9 pr-3 py-2 text-sm border border-gray-200 rounded-md focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-transparent"
          />
        </div>
        <select
          name="filter"
          defaultValue={filter}
          className="px-3 py-2 text-sm border border-gray-200 rounded-md bg-white focus:outline-none focus:ring-2 focus:ring-brand-500"
        >
          <option value="">All pages</option>
          <option value="labeled">Has labels</option>
          <option value="unlabeled">Unlabeled</option>
        </select>
        <button
          type="submit"
          className="px-4 py-2 text-sm font-medium bg-gray-900 text-white rounded-md hover:bg-gray-700 transition-colors"
        >
          Search
        </button>
      </form>

      {/* Grid */}
      {pages.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-center">
          <FileText className="w-12 h-12 text-gray-300 mb-3" />
          <p className="text-gray-500 font-medium">
            {search || filter ? 'No pages match your filters.' : 'No Notion pages synced yet.'}
          </p>
          {!search && !filter && (
            <p className="text-sm text-gray-400 mt-1">
              Connect Notion and sync to get started.
            </p>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {pages.map((page) => {
            const parentTitle = page.parentPageId ? parentMap.get(page.parentPageId) : null
            const syncedBy = syncedByMap.get(page.syncedBy ?? '') ?? null
            const chunkCount = page._count.chunks
            const labeledCount = labeledCountMap.get(page.id) ?? 0
            const labelTypes = [...(labelTypesMap.get(page.id) ?? [])]

            return (
              <Link
                key={page.id}
                href={`/dashboard/notion/${page.id}`}
                className="group block bg-white rounded-lg border border-gray-200 shadow-sm hover:shadow-md hover:border-gray-300 transition-all p-4"
              >
                {/* Icon + title */}
                <div className="flex items-start gap-3 mb-3">
                  <div className="w-8 h-8 rounded bg-gray-100 flex items-center justify-center shrink-0 text-base">
                    {page.iconUrl ? (
                      <Image src={page.iconUrl} alt="" width={20} height={20} />
                    ) : (
                      <FileText className="w-4 h-4 text-gray-400" />
                    )}
                  </div>
                  <div className="min-w-0">
                    {parentTitle && (
                      <p className="text-xs text-gray-400 flex items-center gap-1 mb-0.5 truncate">
                        <span className="truncate">{parentTitle}</span>
                        <ChevronRight className="w-3 h-3 shrink-0" />
                      </p>
                    )}
                    <h3 className="text-sm font-semibold text-gray-900 group-hover:text-brand-600 transition-colors line-clamp-2">
                      {page.title}
                    </h3>
                  </div>
                </div>

                {/* Attribution */}
                {syncedBy && (
                  <p className="text-xs text-gray-500 mb-2">
                    Synced by <span className="font-medium text-gray-700">{syncedBy}</span>
                    {', '}
                    {timeAgo(page.syncedAt)}
                  </p>
                )}

                {/* Stats */}
                <div className="flex items-center justify-between">
                  <p className="text-xs text-gray-400">
                    {chunkCount} chunk{chunkCount !== 1 ? 's' : ''}
                    {labeledCount > 0 && (
                      <span className="text-gray-500">, {labeledCount} labeled</span>
                    )}
                  </p>
                  {labelTypes.length > 0 && (
                    <div className="flex items-center gap-1">
                      {labelTypes.slice(0, 5).map((l) => (
                        <span
                          key={l}
                          title={l}
                          className={`w-2 h-2 rounded-full ${LABEL_COLORS[l] ?? 'bg-gray-400'}`}
                        />
                      ))}
                    </div>
                  )}
                </div>
              </Link>
            )
          })}
        </div>
      )}

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-2 pt-4">
          {currentPage > 1 && (
            <Link
              href={`?${new URLSearchParams({ search, filter, page: String(currentPage - 1) })}`}
              className="px-3 py-1.5 text-sm border border-gray-200 rounded-md hover:bg-gray-50 transition-colors"
            >
              ← Prev
            </Link>
          )}
          <span className="text-sm text-gray-500">
            Page {currentPage} of {totalPages}
          </span>
          {currentPage < totalPages && (
            <Link
              href={`?${new URLSearchParams({ search, filter, page: String(currentPage + 1) })}`}
              className="px-3 py-1.5 text-sm border border-gray-200 rounded-md hover:bg-gray-50 transition-colors"
            >
              Next →
            </Link>
          )}
        </div>
      )}
    </div>
  )
}
