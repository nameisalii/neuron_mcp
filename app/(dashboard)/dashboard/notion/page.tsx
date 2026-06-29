import { auth } from '@clerk/nextjs/server'
import { redirect } from 'next/navigation'
import { prisma } from '@/lib/db'
import Link from 'next/link'
import { ChevronRight, FileText } from 'lucide-react'
import NotionSyncButton from '../integrations/NotionSyncButton'
import { notionPageSummary, rankNotionPages } from '@/lib/notion/ranking'
import { BrandTile } from '@/components/BrandLogo'

export default async function NotionPagesPage({
  searchParams,
}: {
  searchParams: Promise<{ view?: string }>
}) {
  const { userId } = await auth()
  if (!userId) redirect('/sign-in')

  const user = await prisma.user.findUnique({
    where: { clerkId: userId },
    select: { workspace: { select: { id: true } } },
  })
  const workspaceId = user?.workspace?.id
  if (!workspaceId) redirect('/dashboard')
  const showAll = (await searchParams).view === 'all'

  const pages = await prisma.notionPage.findMany({
    where: {
      workspaceId,
      OR: [{ syncedBy: userId }, { chunks: { some: { visibility: 'team' } } }],
    },
    include: {
      _count: { select: { chunks: true, knowledgeItems: true } },
      chunks: { select: { labels: true } },
    },
  })

  const ranked = rankNotionPages(pages
    .map((page) => {
      const labels = [...new Set(page.chunks.flatMap((chunk) => Array.isArray(chunk.labels) ? chunk.labels as string[] : []))]
      return {
        id: page.id, title: page.title, lastEditedAt: page.lastEditedAt, syncedAt: page.syncedAt,
        knowledgeCount: page._count.knowledgeItems, labels, page,
      }
    }))

  const visible = showAll ? ranked : ranked.slice(0, 3)

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <BrandTile brand="notion" className="h-12 w-12" />
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Notion Knowledge</h1>
            <p className="text-sm text-gray-500">The pages carrying the most useful company context.</p>
          </div>
        </div>
        <NotionSyncButton workspaceId={workspaceId} />
      </div>

      <div className="rounded-xl border border-brand-100 bg-brand-50/60 p-5">
        <p className="text-sm font-semibold text-brand-900">Summary</p>
        <p className="text-sm text-brand-800 mt-1">
          {pages.length} Notion page{pages.length === 1 ? '' : 's'} synced.{' '}
          {Math.min(3, pages.length)} page{Math.min(3, pages.length) === 1 ? '' : 's'} contain the most useful company context.
          {' '}Neuron extracts rules, decisions, processes, ideas, and facts from these pages.
        </p>
      </div>

      <div>
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-sm font-semibold text-gray-700">{showAll ? 'All Notion Pages' : 'Top Notion Pages'}</h2>
          {pages.length > 3 && (
            <Link
              href={showAll ? '/dashboard/notion' : '/dashboard/notion?view=all'}
              className="text-xs font-medium text-brand-600 hover:text-brand-700"
            >
              {showAll ? 'Show top 3' : 'View all pages'}
            </Link>
          )}
        </div>

        {visible.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 rounded-xl border border-gray-200 bg-white text-center">
            <FileText className="w-10 h-10 text-gray-300 mb-3" />
            <p className="text-sm font-medium text-gray-600">No Notion pages synced yet.</p>
          </div>
        ) : (
          <div className="space-y-3">
            {visible.map(({ page, labels }, index) => (
              <Link
                key={page.id}
                href={`/dashboard/notion/${page.id}`}
                className="group flex items-start gap-4 rounded-xl border border-gray-200 bg-white p-5 hover:border-gray-300 hover:shadow-sm transition-all"
              >
                <div className="w-8 h-8 rounded-full bg-gray-100 flex items-center justify-center text-sm font-semibold text-gray-500 shrink-0">
                  {index + 1}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <h3 className="font-semibold text-gray-900 group-hover:text-brand-600 transition-colors">{page.title}</h3>
                    <ChevronRight className="w-4 h-4 text-gray-300 group-hover:text-brand-500" />
                  </div>
                  <p className="text-sm text-gray-500 mt-1">
                    {notionPageSummary(page.title, labels, page._count.knowledgeItems)}
                  </p>
                  <p className="text-xs text-gray-400 mt-2">
                    {page._count.knowledgeItems} knowledge items · {page._count.chunks} chunks
                  </p>
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
