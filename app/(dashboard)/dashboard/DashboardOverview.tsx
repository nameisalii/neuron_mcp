import Link from 'next/link'
import { AlertCircle, ArrowRight, BookOpen, CheckCircle2, GitBranch, ListTodo, Plug, Scale, Sparkles } from 'lucide-react'

type DashboardData = {
  counts: {
    active: number
    suggested: number
    decisions: number
    connectedIntegrations: number
    savedContext: number
    rules: number
    dueToday: number
    overdue: number
    upcomingIntegrations: number
    integrationErrors: number
  }
  suggestedTasks: Array<{ id: string; title: string; sourceType: string | null; dueAt: string | null; priority: string }>
  priorityTasks: Array<{ id: string; title: string; sourceType: string | null; dueAt: string | null; priority: string }>
  recentDecisions: Array<{ id: string; title: string; source: string; status: string; date: string }>
  health: Array<{ name: string; status: 'Connected' | 'Needs attention' | 'Upcoming'; lastSyncAt: string | null }>
}

const pretty = (value: string) => {
  const normalized = value.toLowerCase()
  if (normalized === 'five_eld' || normalized === 'tt_eld' || normalized === 'tt-eld') return 'Five ELD'
  if (normalized === 'teams' || normalized === 'microsoft_teams') return 'Microsoft Teams'
  return value.replaceAll('_', ' ').replace(/\b\w/g, letter => letter.toUpperCase())
}
const dateLabel = (value: string | null) => value
  ? new Date(value).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
  : 'No due date'

export default function DashboardOverview({ data }: { data: DashboardData }) {
  const cards = [
    { label: 'Active tasks', value: data.counts.active, note: 'Ready to work on', href: '/dashboard/tasks', icon: ListTodo },
    { label: 'Suggested tasks', value: data.counts.suggested, note: 'Waiting for review', href: '/dashboard/tasks', icon: Sparkles },
    { label: 'Decisions', value: data.counts.decisions, note: 'Remembered decisions', href: '/dashboard/decisions', icon: GitBranch },
    { label: 'Integrations', value: data.counts.connectedIntegrations, note: 'Connected tools', href: '/dashboard/integrations', icon: Plug },
    { label: 'Total knowledge', value: data.counts.savedContext, note: 'Saved context', href: '/dashboard/knowledge', icon: BookOpen },
    { label: 'Rules', value: data.counts.rules, note: 'Operating rules', href: '/dashboard/knowledge?type=rules', icon: Scale },
  ]
  const empty = data.counts.active === 0
    && data.counts.suggested === 0
    && data.counts.decisions === 0
    && data.counts.connectedIntegrations === 0
    && data.counts.savedContext === 0
  const attentionItems = [
    data.counts.overdue > 0 ? { label: `${data.counts.overdue} overdue ${data.counts.overdue === 1 ? 'task' : 'tasks'}`, href: '/dashboard/tasks' } : null,
    data.counts.suggested > 0 ? { label: `${data.counts.suggested} suggested ${data.counts.suggested === 1 ? 'task' : 'tasks'} waiting for review`, href: '/dashboard/tasks' } : null,
    data.counts.integrationErrors > 0 ? { label: `${data.counts.integrationErrors} ${data.counts.integrationErrors === 1 ? 'integration needs' : 'integrations need'} attention`, href: '/dashboard/integrations' } : null,
  ].filter((item): item is { label: string; href: string } => Boolean(item))

  return (
    <div className="w-full space-y-8">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight text-gray-950">Dashboard</h1>
          <p className="mt-1 text-sm text-gray-500">Your workspace at a glance.</p>
        </div>
        <p className="text-xs text-gray-400">Updated {new Date().toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}</p>
      </header>

      {empty && (
        <section className="rounded-2xl border border-indigo-100 bg-indigo-50/60 p-6">
          <h2 className="font-semibold text-gray-900">Set up your workspace</h2>
          <p className="mt-1 text-sm text-gray-600">Connect an integration or query Neuron to get started.</p>
          <div className="mt-4 flex gap-3">
            <Link href="/dashboard/integrations" className="rounded-lg bg-gray-900 px-4 py-2 text-sm font-medium text-white">Connect integration</Link>
            <Link href="/dashboard/query" className="rounded-lg border bg-white px-4 py-2 text-sm font-medium">Open Query</Link>
          </div>
        </section>
      )}

      <section aria-label="Dashboard overview" className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {cards.map(({ label, value, note, href, icon: Icon }) => (
          <Link key={label} href={href} className="group rounded-2xl border border-gray-200 bg-white p-4 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md">
            <div className="flex items-start justify-between">
              <span className="rounded-xl bg-gray-50 p-2 text-gray-600"><Icon className="h-5 w-5" /></span>
              <ArrowRight className="h-4 w-4 text-gray-300 transition group-hover:translate-x-0.5" />
            </div>
            <p className="mt-3 text-2xl font-semibold text-gray-950">{value}</p>
            <p className="mt-1 text-sm font-medium text-gray-800">{label}</p>
            <p className="text-xs text-gray-500">{note}</p>
          </Link>
        ))}
      </section>

      <div data-testid="dashboard-detail-grid" className="grid grid-cols-1 items-start gap-6 lg:grid-cols-2">
        <div data-testid="dashboard-left-column" className="space-y-6">
          <Panel title="Today" link="/dashboard/tasks" linkLabel="View tasks">
          <div className="grid grid-cols-2 gap-3">
            <Mini label="Due today" value={data.counts.dueToday} />
            <Mini label="Overdue" value={data.counts.overdue} warning={data.counts.overdue > 0} />
          </div>
          <div className="mt-4">
            <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-gray-400">Priority today</p>
            {data.priorityTasks.length > 0 ? (
              <div className="space-y-2">
                {data.priorityTasks.map(task => (
                  <Link href="/dashboard/tasks" key={task.id} className="flex items-center gap-3 rounded-xl border border-gray-100 px-3 py-2.5 transition hover:border-indigo-200">
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium text-gray-900">{task.title}</p>
                      <p className="mt-0.5 text-xs text-gray-400">{dateLabel(task.dueAt)}</p>
                    </div>
                    <Badge>{pretty(task.sourceType ?? 'manual')}</Badge>
                    <PriorityBadge priority={task.priority} />
                  </Link>
                ))}
              </div>
            ) : <Empty>No urgent tasks today.</Empty>}
          </div>
          </Panel>

          <Panel title="Suggested tasks" link="/dashboard/tasks" linkLabel="View all tasks">
            <div className="space-y-3">
              {data.suggestedTasks.map(task => (
                <div key={task.id} className="rounded-xl border border-gray-100 p-3">
                  <div className="flex justify-between gap-3">
                    <p className="text-sm font-medium text-gray-900">{task.title}</p>
                    <span className="shrink-0 text-xs text-gray-400">{dateLabel(task.dueAt)}</span>
                  </div>
                  <div className="mt-2 flex flex-wrap items-center gap-2 text-[11px]">
                    <Badge>{pretty(task.sourceType ?? 'manual')}</Badge>
                    <PriorityBadge priority={task.priority} />
                    <Link href="/dashboard/tasks" className="ml-auto font-medium text-indigo-600">Review</Link>
                  </div>
                </div>
              ))}
              {data.suggestedTasks.length === 0 && <Empty>No suggested tasks waiting.</Empty>}
            </div>
          </Panel>
        </div>

        <div data-testid="dashboard-right-column" className="space-y-6">
          <Panel title="Integration health" link="/dashboard/integrations" linkLabel="Manage integrations">
          <div className="mb-4 grid grid-cols-3 gap-2">
            <Mini label="Connected" value={data.counts.connectedIntegrations} />
            <Mini label="Upcoming" value={data.counts.upcomingIntegrations} />
            <Mini label="Attention" value={data.counts.integrationErrors} warning={data.counts.integrationErrors > 0} />
          </div>
          <div className="space-y-2">
            {data.health.slice(0, 7).map(item => (
              <div key={`${item.name}-${item.status}`} className="flex items-center justify-between rounded-lg bg-gray-50 px-3 py-2 text-sm">
                <span className="font-medium text-gray-800">{pretty(item.name)}</span>
                <span className={item.status === 'Connected' ? 'text-emerald-600' : item.status === 'Upcoming' ? 'text-gray-400' : 'text-amber-600'}>{item.status}</span>
              </div>
            ))}
            {data.health.length === 0 && <Empty>No integrations connected yet.</Empty>}
          </div>
          </Panel>

          <Panel title="Recent decisions" link="/dashboard/decisions" linkLabel="View decisions">
          <div className="space-y-3">
            {data.recentDecisions.map(decision => (
              <div key={decision.id} className="flex items-start gap-3 rounded-xl border border-gray-100 p-3">
                <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-500" />
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-gray-900">{decision.title}</p>
                  <div className="mt-1 flex flex-wrap items-center gap-1.5 text-[11px]">
                    <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-emerald-700">{decision.status}</span>
                    <Badge>{pretty(decision.source)}</Badge>
                    <span className="text-gray-400">{dateLabel(decision.date)}</span>
                  </div>
                </div>
              </div>
            ))}
            {data.recentDecisions.length === 0 && <Empty>No decisions yet.</Empty>}
          </div>
          </Panel>

          <Panel title="Needs attention">
            {attentionItems.length > 0 ? (
              <div className="space-y-3">
                {attentionItems.map(item => (
                  <Link key={item.label} href={item.href} className="flex items-center gap-3 rounded-xl border border-amber-100 bg-amber-50/70 px-4 py-3 text-sm font-medium text-amber-900 transition hover:bg-amber-50">
                    <AlertCircle className="h-4 w-4 shrink-0 text-amber-600" />
                    {item.label}
                    <ArrowRight className="ml-auto h-4 w-4 text-amber-400" />
                  </Link>
                ))}
              </div>
            ) : <Empty>Nothing needs attention right now.</Empty>}
          </Panel>
        </div>
      </div>
    </div>
  )
}

function Panel({ title, children, link, linkLabel }: { title: string; children: React.ReactNode; link?: string; linkLabel?: string }) {
  return (
    <section className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
      <div className="mb-4 flex items-center justify-between">
        <h2 className="font-semibold text-gray-900">{title}</h2>
        {link && <Link href={link} className="text-xs font-medium text-indigo-600">{linkLabel}</Link>}
      </div>
      {children}
    </section>
  )
}

function Mini({ label, value, warning }: { label: string; value: number; warning?: boolean }) {
  return <div className={warning ? 'rounded-xl bg-red-50 p-3' : 'rounded-xl bg-gray-50 p-3'}><p className={warning ? 'text-xl font-semibold text-red-700' : 'text-xl font-semibold text-gray-900'}>{value}</p><p className="text-xs text-gray-500">{label}</p></div>
}

function Badge({ children }: { children: React.ReactNode }) {
  return <span className="rounded-full bg-blue-50 px-2 py-0.5 text-[11px] text-blue-700">{children}</span>
}

function PriorityBadge({ priority }: { priority: string }) {
  const urgent = priority === 'urgent' || priority === 'high'
  return <span className={urgent ? 'rounded-full bg-orange-50 px-2 py-0.5 text-[11px] text-orange-700' : 'rounded-full bg-gray-100 px-2 py-0.5 text-[11px] text-gray-600'}>{pretty(priority)}</span>
}

function Empty({ children }: { children: React.ReactNode }) {
  return <p className="rounded-xl bg-gray-50 px-3 py-3 text-sm text-gray-500">{children}</p>
}
