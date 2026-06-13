import type { Week1ReportData } from '@/lib/email/week1-report'

type DigestItem = Week1ReportData['topItems'][number]

interface EmailDigestPreviewProps {
  data: Week1ReportData
}

interface SectionDefinition {
  title: string
  categories: readonly string[]
  empty: string
}

const sectionDefinitions: SectionDefinition[] = [
  {
    title: 'Decisions',
    categories: ['decision'],
    empty: 'No new decisions were captured for this preview.',
  },
  {
    title: 'Ideas',
    categories: ['idea'],
    empty: 'No new ideas were captured for this preview.',
  },
  {
    title: 'Processes / Updates',
    categories: ['process', 'plan', 'status_update'],
    empty: 'No process or status updates were captured for this preview.',
  },
]

function DigestSection({
  title,
  items,
  empty,
}: {
  title: string
  items: DigestItem[]
  empty: string
}) {
  return (
    <section className="border-t border-gray-100 pt-6">
      <h2 className="text-sm font-semibold text-gray-900">{title}</h2>
      {items.length > 0 ? (
        <ul className="mt-3 space-y-3">
          {items.map((item) => (
            <li key={item.id} className="rounded-lg bg-gray-50 px-4 py-3">
              <p className="text-sm leading-6 text-gray-700">{item.content}</p>
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-2 text-sm leading-6 text-gray-500">{empty}</p>
      )}
    </section>
  )
}

export default function EmailDigestPreview({ data }: EmailDigestPreviewProps) {
  const categorizedIds = new Set<string>()
  const sections = sectionDefinitions.map((section) => {
    const items = data.topItems.filter((item) => section.categories.includes(item.category))
    items.forEach((item) => categorizedIds.add(item.id))
    return { ...section, items }
  })
  const recentKnowledge = data.topItems.filter((item) => !categorizedIds.has(item.id))

  return (
    <article className="overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-sm">
      <div className="border-b border-gray-100 px-6 py-5 sm:px-10">
        <p className="text-xs font-semibold uppercase tracking-[0.16em] text-gray-500">Neuron digest</p>
      </div>

      <div className="space-y-7 px-6 py-8 sm:px-10 sm:py-10">
        <header>
          <h1 className="text-3xl font-bold tracking-tight text-gray-900">What is going on</h1>
          <p className="mt-3 text-sm leading-6 text-gray-600">
            Here&apos;s a quick catch-up on what happened in your workspace.
          </p>
        </header>

        <section className="rounded-xl bg-gray-50 p-5">
          <h2 className="text-sm font-semibold text-gray-900">Key updates</h2>
          <p className="mt-2 text-sm leading-6 text-gray-600">
            Neuron has captured {data.knowledgeCount} knowledge item{data.knowledgeCount === 1 ? '' : 's'},
            including {data.decisionsCount} decision{data.decisionsCount === 1 ? '' : 's'} and {data.ideasCount} idea{data.ideasCount === 1 ? '' : 's'}.
          </p>
        </section>

        {sections.map((section) => (
          <DigestSection
            key={section.title}
            title={section.title}
            items={section.items}
            empty={section.empty}
          />
        ))}

        <DigestSection
          title="Recent important knowledge"
          items={recentKnowledge}
          empty="No other important knowledge was captured for this preview."
        />
      </div>
    </article>
  )
}
