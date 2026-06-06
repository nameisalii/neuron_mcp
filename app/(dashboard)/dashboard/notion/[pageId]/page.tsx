import { auth } from '@clerk/nextjs/server'
import { redirect, notFound } from 'next/navigation'
import { prisma } from '@/lib/db'
import Link from 'next/link'
import { FileText, ChevronRight, RefreshCw } from 'lucide-react'
import ChunkBlock from './ChunkBlock'

function timeAgo(date: Date): string {
  const s = Math.floor((Date.now() - date.getTime()) / 1000)
  if (s < 60) return 'just now'
  if (s < 3600) return `${Math.floor(s / 60)}m ago`
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`
  if (s < 604800) return `${Math.floor(s / 86400)}d ago`
  return date.toLocaleDateString()
}

const LABEL_COLORS: Record<string, { bg: string; text: string }> = {
  rule:         { bg: 'bg-blue-100',    text: 'text-blue-700' },
  decision:     { bg: 'bg-purple-100',  text: 'text-purple-700' },
  process:      { bg: 'bg-amber-100',   text: 'text-amber-700' },
  idea:         { bg: 'bg-emerald-100', text: 'text-emerald-700' },
  fact:         { bg: 'bg-slate-100',   text: 'text-slate-700' },
  context:      { bg: 'bg-gray-100',    text: 'text-gray-600' },
  reference:    { bg: 'bg-cyan-100',    text: 'text-cyan-700' },
  meeting_note: { bg: 'bg-pink-100',    text: 'text-pink-700' },
}

export default async function NotionPageDetail({
  params,
}: {
  params: { pageId: string }
}) {
  const { userId } = await auth()
  if (!userId) redirect('/sign-in')

  const notionPage = await prisma.notionPage.findUnique({
    where: { id: params.pageId },
    include: { chunks: { orderBy: { position: 'asc' } } },
  })
  if (!notionPage) notFound()

  const { workspaceId } = notionPage

  const [member, parentPage, recentActivity] = await Promise.all([
    prisma.workspaceMember.findUnique({
      where: { workspaceId_userId: { workspaceId, userId } },
      select: { role: true, displayName: true },
    }),
    notionPage.parentPageId
      ? prisma.notionPage.findFirst({
          where: { workspaceId, notionPageId: notionPage.parentPageId },
          select: { id: true, title: true },
        })
      : null,
    prisma.activityEvent.findMany({
      where: { workspaceId },
      orderBy: { createdAt: 'desc' },
      take: 8,
      select: { id: true, displayName: true, eventType: true, description: true, createdAt: true },
    }),
  ])

  if (!member) redirect('/dashboard')

  // Resolve syncedBy name
  let syncedByName: string | null = null
  if (notionPage.syncedBy) {
    const syncer = await prisma.workspaceMember.findUnique({
      where: { workspaceId_userId: { workspaceId, userId: notionPage.syncedBy } },
      select: { displayName: true },
    })
    syncedByName = syncer?.displayName ?? null
  }

  const visibleChunks = notionPage.chunks.filter(
    (c) => c.visibility === 'team' || (c.visibility === 'personal' && c.visibilitySetBy === userId),
  )

  const labelDistribution: Record<string, number> = {}
  for (const chunk of visibleChunks) {
    for (const label of (chunk.labels as string[])) {
      labelDistribution[label] = (labelDistribution[label] ?? 0) + 1
    }
  }

  return (
    <div className="max-w-6xl mx-auto">
      {/* Breadcrumb */}
      <nav className="flex items-center gap-1.5 text-xs text-gray-400 mb-4">
        <Link href="/dashboard" className="hover:text-gray-600">Dashboard</Link>
        <ChevronRight className="w-3 h-3" />
        <Link href="/dashboard/notion" className="hover:text-gray-600">Notion</Link>
        {parentPage && (
          <>
            <ChevronRight className="w-3 h-3" />
            <Link href={`/dashboard/notion/${parentPage.id}`} className="hover:text-gray-600 truncate max-w-32">
              {parentPage.title}
            </Link>
          </>
        )}
        <ChevronRight className="w-3 h-3" />
        <span className="text-gray-600 truncate max-w-48">{notionPage.title}</span>
      </nav>

      <div className="flex gap-6">
        {/* Main content */}
        <div className="flex-1 min-w-0 space-y-4">
          {/* Page header */}
          <div className="bg-white rounded-lg border border-gray-200 shadow-sm p-5">
            <div className="flex items-start justify-between gap-4">
              <div className="flex items-start gap-3 min-w-0">
                <div className="w-10 h-10 rounded bg-gray-100 flex items-center justify-center shrink-0 text-xl">
                  {notionPage.iconUrl ? notionPage.iconUrl : <FileText className="w-5 h-5 text-gray-400" />}
                </div>
                <div className="min-w-0">
                  <h1 className="text-xl font-bold text-gray-900 leading-tight">{notionPage.title}</h1>
                  <p className="text-xs text-gray-500 mt-1">
                    {syncedByName && (
                      <>Synced by <span className="font-medium text-gray-700">{syncedByName}</span> · </>
                    )}
                    {timeAgo(notionPage.syncedAt)}
                    {' · '}
                    {visibleChunks.length} chunks
                  </p>
                </div>
              </div>
              <a
                href={`/api/integrations/notion/sync`}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md border border-gray-200 text-xs text-gray-600 hover:bg-gray-50 shrink-0 transition-colors"
              >
                <RefreshCw className="w-3 h-3" />
                Re-sync
              </a>
            </div>
          </div>

          {/* Chunks */}
          <div className="space-y-2">
            {visibleChunks.map((chunk) => (
              <ChunkBlock
                key={chunk.id}
                chunk={{
                  id: chunk.id,
                  content: chunk.content,
                  blockType: chunk.blockType,
                  position: chunk.position,
                  labels: chunk.labels,
                  labeledBy: chunk.labeledBy,
                  visibility: chunk.visibility,
                }}
                userId={userId}
              />
            ))}
          </div>
        </div>

        {/* Sidebar */}
        <aside className="w-60 shrink-0 space-y-4 hidden lg:block">
          {/* Label distribution */}
          {Object.keys(labelDistribution).length > 0 && (
            <div className="bg-white rounded-lg border border-gray-200 shadow-sm p-4">
              <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">Labels</h3>
              <div className="space-y-2">
                {Object.entries(labelDistribution)
                  .sort(([, a], [, b]) => b - a)
                  .map(([label, count]) => {
                    const colors = LABEL_COLORS[label] ?? { bg: 'bg-gray-100', text: 'text-gray-600' }
                    return (
                      <div key={label} className="flex items-center justify-between">
                        <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${colors.bg} ${colors.text}`}>
                          {label}
                        </span>
                        <span className="text-xs text-gray-400">{count}</span>
                      </div>
                    )
                  })}
              </div>
            </div>
          )}

          {/* Recent activity */}
          <div className="bg-white rounded-lg border border-gray-200 shadow-sm p-4">
            <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">Activity</h3>
            {recentActivity.length === 0 ? (
              <p className="text-xs text-gray-400">No recent activity.</p>
            ) : (
              <div className="space-y-3">
                {recentActivity.map((event) => (
                  <div key={event.id}>
                    <p className="text-xs text-gray-700 leading-snug line-clamp-2">{event.description}</p>
                    <p className="text-xs text-gray-400 mt-0.5">{timeAgo(event.createdAt)}</p>
                  </div>
                ))}
              </div>
            )}
          </div>
        </aside>
      </div>
    </div>
  )
}
