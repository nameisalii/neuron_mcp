import Link from 'next/link'
import { ArrowLeft, CheckCircle, ChevronRight, ExternalLink, FileText } from 'lucide-react'
import { Card } from '@/components/ui/card'
import SourceIcon from '@/components/SourceIcon'
import KnowledgeCard from '@/components/KnowledgeCard'
import { INTEGRATION_FILTERS, type IntegrationOverviewData } from '@/lib/integrations/overview'
import { clsx } from 'clsx'

interface Props {
  data: IntegrationOverviewData
}

function timeAgo(iso: string | null): string {
  if (!iso) return 'Never'
  const diff = Date.now() - new Date(iso).getTime()
  if (diff < 60_000) return 'just now'
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m ago`
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}h ago`
  if (diff < 604_800_000) return `${Math.floor(diff / 86_400_000)}d ago`
  return new Date(iso).toLocaleDateString()
}

export default function IntegrationOverviewView({ data }: Props) {
  const filterOptions = INTEGRATION_FILTERS.map((filter) => ({
    ...filter,
    active: filter.key === data.filter,
  }))

  return (
    <div className="max-w-5xl mx-auto space-y-8">
      <div className="flex items-start justify-between gap-4">
        <div className="space-y-3">
          <Link href="/dashboard/integrations" className="inline-flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-700 transition-colors">
            <ArrowLeft className="w-4 h-4" />
            Back to Integrations
          </Link>
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-xl border border-gray-200 bg-white flex items-center justify-center shadow-sm overflow-hidden">
              <SourceIcon source={data.source} size={44} className="rounded-xl" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-gray-900">{data.title}</h1>
              <p className="text-sm text-gray-500 mt-1">{data.subtitle}</p>
            </div>
          </div>
          {data.privacyNote && (
            <div className="inline-flex items-center gap-2 rounded-full border border-indigo-100 bg-indigo-50 px-3 py-1.5 text-xs font-medium text-indigo-700">
              <CheckCircle className="w-3.5 h-3.5" />
              {data.privacyNote}
            </div>
          )}
        </div>
        <div className="text-right">
          <span className={clsx('inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium', data.connected ? 'bg-green-50 text-green-700' : 'bg-gray-100 text-gray-600')}>
            <CheckCircle className="w-3 h-3" />
            {data.connected ? 'Connected' : 'Not connected'}
          </span>
          <p className="mt-2 text-xs text-gray-400">Last sync: {timeAgo(data.lastSyncAt)}</p>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {data.summaryCards.map((card) => (
          <Card key={card.label} padding="sm">
            <p className="text-xs font-medium uppercase tracking-wide text-gray-400">{card.label}</p>
            <p className="mt-2 text-lg font-semibold text-gray-900 break-words">{card.value}</p>
          </Card>
        ))}
      </div>

      {data.details.length > 0 && (
        <Card padding="sm">
          <div className="flex items-center justify-between gap-3 mb-3">
            <h2 className="text-sm font-semibold text-gray-900">Source details</h2>
            <span className="text-xs text-gray-400">{data.details.length} item{data.details.length === 1 ? '' : 's'}</span>
          </div>
          <div className="flex flex-wrap gap-2">
            {data.details.map((detail) => (
              <span key={`${detail.label}:${detail.value}`} className="inline-flex items-center gap-1.5 rounded-full bg-gray-50 px-3 py-1.5 text-xs text-gray-600">
                <span className="font-medium text-gray-500">{detail.label}:</span>
                <span className="truncate">{detail.value}</span>
              </span>
            ))}
          </div>
        </Card>
      )}

      {data.source === 'notion' && (
        <section>
          <div className="flex items-center justify-between gap-3 mb-3">
            <div>
              <h2 className="text-lg font-semibold text-gray-900">All Notion projects</h2>
              <p className="text-sm text-gray-500 mt-0.5">Every synced page you can access.</p>
            </div>
            <span className="text-xs text-gray-400">
              {data.notionProjects?.length ?? 0} project{data.notionProjects?.length === 1 ? '' : 's'}
            </span>
          </div>
          {data.notionProjects?.length ? (
            <div className="grid gap-3 sm:grid-cols-2">
              {data.notionProjects.map((project) => (
                <Link
                  key={project.id}
                  href={`/dashboard/notion/${project.id}`}
                  className="group flex items-start gap-3 rounded-xl border border-gray-200 bg-white p-4 hover:border-gray-300 hover:shadow-sm transition-all"
                >
                  <div className="w-9 h-9 rounded-lg bg-gray-100 flex items-center justify-center shrink-0">
                    <FileText className="w-4 h-4 text-gray-500" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1">
                      <h3 className="font-medium text-gray-900 truncate group-hover:text-brand-600 transition-colors">
                        {project.title}
                      </h3>
                      <ChevronRight className="w-4 h-4 text-gray-300 shrink-0 group-hover:text-brand-500" />
                    </div>
                    <p className="text-xs text-gray-400 mt-1">
                      {project.knowledgeCount} knowledge items · {project.chunkCount} chunks
                    </p>
                  </div>
                </Link>
              ))}
            </div>
          ) : (
            <Card padding="md">
              <p className="text-sm text-gray-500">No Notion projects have been synced yet.</p>
            </Card>
          )}
        </section>
      )}

      <div className="flex flex-wrap gap-2">
        {filterOptions.map((filter) => (
          <Link
            key={filter.key}
            href={`/dashboard/integrations/${data.source}${filter.key === 'all' ? '' : `?filter=${filter.key}`}`}
            className={clsx(
              'inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-sm font-medium transition-colors',
              filter.active
                ? 'border-indigo-200 bg-indigo-50 text-indigo-700'
                : 'border-gray-200 bg-white text-gray-600 hover:bg-gray-50',
            )}
          >
            {filter.label}
            <span className="text-xs text-gray-400">{data.filters.find((item) => item.key === filter.key)?.count ?? 0}</span>
          </Link>
        ))}
      </div>

      {data.items.length > 0 ? (
        <div className="space-y-3">
          {data.items.map((item) => (
            <KnowledgeCard
              key={item.id}
              compact
              item={item}
              footer={item.sourceUrl ? (
                <a
                  href={item.sourceUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 text-xs font-medium text-indigo-600 hover:text-indigo-700"
                >
                  Open source
                  <ExternalLink className="w-3 h-3" />
                </a>
              ) : null}
            />
          ))}
        </div>
      ) : (
        <Card padding="md">
          <div className="space-y-3">
            <h2 className="text-lg font-semibold text-gray-900">{data.emptyState.title}</h2>
            <p className="text-sm text-gray-500 max-w-2xl">{data.emptyState.description}</p>
            <div className="flex flex-wrap gap-2">
              <Link href={data.emptyState.actionHref} className="inline-flex items-center gap-1.5 rounded-md bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700 transition-colors">
                {data.emptyState.actionLabel}
              </Link>
              {data.source === 'gmail' && (
                <Link href="/dashboard/integrations?connected=gmail" className="inline-flex items-center gap-1.5 rounded-md border border-gray-200 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors">
                  Change Gmail filters
                </Link>
              )}
            </div>
          </div>
        </Card>
      )}
    </div>
  )
}
