'use client'

import { useState } from 'react'
import { ChevronDown, ChevronUp } from 'lucide-react'
import { clsx } from 'clsx'

interface CaptureRule {
  id: string
  integration: string
  ruleType: string
  target: string
  targetName: string
  createdBy: string
  createdAt: string
}

interface SyncStatus {
  id: string
  integration: string
  mode: string
  status: string
  lastSyncAt: string | null
  nextSyncAt: string | null
  configuredBy: string
  errorMessage: string | null
}

interface CaptureLog {
  id: string
  source: string
  sourceId: string
  contentPreview: string
  status: string
  reason: string
  timestamp: string
  captureRuleId: string | null
}

interface Props {
  canManage: boolean
  notionRules: CaptureRule[]
  slackRules: CaptureRule[]
  notionStatus: SyncStatus | null
  slackStatus: SyncStatus | null
  recentLogs: CaptureLog[]
  memberMap: Record<string, string>
  slackChannels: string[]
}

type Tab = 'notion' | 'slack' | 'log'
type LogFilter = 'all' | 'captured' | 'skipped' | 'excluded'

const STATUS_BADGE: Record<string, string> = {
  captured: 'bg-green-100 text-green-700',
  skipped: 'bg-gray-100 text-gray-600',
  excluded: 'bg-red-100 text-red-700',
}

function timeAgo(iso: string): string {
  const s = Math.floor((Date.now() - new Date(iso).getTime()) / 1000)
  if (s < 60) return 'just now'
  if (s < 3600) return `${Math.floor(s / 60)}m ago`
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`
  return `${Math.floor(s / 86400)}d ago`
}

export default function CaptureSettingsClient({
  canManage,
  notionRules: initialNotionRules,
  slackRules: initialSlackRules,
  notionStatus: initialNotionStatus,
  slackStatus: initialSlackStatus,
  recentLogs,
  memberMap,
  slackChannels,
}: Props) {
  const [tab, setTab] = useState<Tab>('notion')
  const [notionRules, setNotionRules] = useState(initialNotionRules)
  const [slackRules, setSlackRules] = useState(initialSlackRules)
  const [notionStatus, setNotionStatus] = useState(initialNotionStatus)
  const [slackStatus, setSlackStatus] = useState(initialSlackStatus)
  const [logFilter, setLogFilter] = useState<LogFilter>('all')
  const [saving, setSaving] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  async function createRule(integration: 'notion' | 'slack', target: string, targetName: string) {
    if (!canManage) return
    setSaving(`create-${integration}-${target}`)
    setError(null)
    try {
      const res = await fetch('/api/settings/capture-rules', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ integration, ruleType: 'include', target, targetName }),
      })
      const data = await res.json() as { data?: CaptureRule; error?: string }
      if (!res.ok) throw new Error(data.error ?? 'Failed to create rule')
      if (integration === 'notion') setNotionRules((prev) => [...prev, data.data!])
      else setSlackRules((prev) => [...prev, data.data!])
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong')
    } finally {
      setSaving(null)
    }
  }

  async function deleteRule(integration: 'notion' | 'slack', ruleId: string) {
    if (!canManage) return
    setSaving(ruleId)
    setError(null)
    try {
      const res = await fetch(`/api/settings/capture-rules/${ruleId}`, { method: 'DELETE' })
      if (!res.ok) {
        const data = await res.json() as { error?: string }
        throw new Error(data.error ?? 'Failed to delete rule')
      }
      if (integration === 'notion') setNotionRules((prev) => prev.filter((r) => r.id !== ruleId))
      else setSlackRules((prev) => prev.filter((r) => r.id !== ruleId))
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong')
    } finally {
      setSaving(null)
    }
  }

  async function patchSyncStatus(integration: 'notion' | 'slack', patch: Record<string, string>) {
    if (!canManage) return
    setSaving(`status-${integration}`)
    setError(null)
    try {
      const res = await fetch('/api/settings/sync-status', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ integration, ...patch }),
      })
      const data = await res.json() as { data?: SyncStatus; error?: string }
      if (!res.ok) throw new Error(data.error ?? 'Failed to update sync status')
      if (integration === 'notion') setNotionStatus(data.data ?? null)
      else setSlackStatus(data.data ?? null)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong')
    } finally {
      setSaving(null)
    }
  }

  const filteredLogs = logFilter === 'all' ? recentLogs : recentLogs.filter((l) => l.status === logFilter)
  const notionIncludeIds = new Set(notionRules.filter((r) => r.ruleType === 'include').map((r) => r.target))
  const slackIncludeIds = new Set(slackRules.filter((r) => r.ruleType === 'include').map((r) => r.target))

  const tabs: { key: Tab; label: string }[] = [
    { key: 'notion', label: 'Notion' },
    { key: 'slack', label: 'Slack' },
    { key: 'log', label: 'Capture Log' },
  ]

  return (
    <div className="space-y-4">
      {error && (
        <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">{error}</div>
      )}

      {/* Privacy summary */}
      <div className="bg-gray-50 border border-gray-200 rounded-lg p-4 flex gap-6 text-sm text-gray-600">
        <span><span className="font-medium text-gray-900">{notionRules.filter(r => r.ruleType === 'include').length}</span> Notion rules</span>
        <span><span className="font-medium text-gray-900">{slackRules.filter(r => r.ruleType === 'include').length}</span> Slack rules</span>
        {notionStatus?.lastSyncAt && (
          <span>Last sync: <span className="font-medium text-gray-900">{timeAgo(notionStatus.lastSyncAt)}</span></span>
        )}
      </div>

      {/* Tabs */}
      <div className="border-b border-gray-200 flex gap-0">
        {tabs.map(({ key, label }) => (
          <button
            key={key}
            onClick={() => setTab(key)}
            className={clsx(
              'px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors',
              tab === key
                ? 'border-indigo-600 text-indigo-600'
                : 'border-transparent text-gray-500 hover:text-gray-700',
            )}
          >
            {label}
          </button>
        ))}
      </div>

      {/* Notion tab */}
      {tab === 'notion' && (
        <div className="space-y-4">
          <SyncControls
            label="Notion"
            status={notionStatus}
            saving={saving === 'status-notion'}
            canManage={canManage}
            onTogglePause={() =>
              patchSyncStatus('notion', { status: notionStatus?.status === 'paused' ? 'active' : 'paused' })
            }
            onToggleBackground={() =>
              patchSyncStatus('notion', { mode: notionStatus?.mode === 'background' ? 'manual' : 'background' })
            }
          />

          <div className="space-y-1">
            <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">Include Rules</p>
            {notionRules.filter((r) => r.ruleType === 'include').map((rule) => (
              <RuleRow
                key={rule.id}
                rule={rule}
                configuredBy={memberMap[rule.createdBy] ?? rule.createdBy}
                onDelete={() => deleteRule('notion', rule.id)}
                deleting={saving === rule.id}
                canManage={canManage}
              />
            ))}
            {canManage && (
              <AddRuleForm
                placeholder="Notion page ID or keyword"
                onAdd={(target, targetName) => createRule('notion', target, targetName)}
                saving={saving?.startsWith('create-notion') ?? false}
              />
            )}
          </div>
        </div>
      )}

      {/* Slack tab */}
      {tab === 'slack' && (
        <div className="space-y-4">
          <SyncControls
            label="Slack"
            status={slackStatus}
            saving={saving === 'status-slack'}
            canManage={canManage}
            onTogglePause={() =>
              patchSyncStatus('slack', { status: slackStatus?.status === 'paused' ? 'active' : 'paused' })
            }
            onToggleBackground={() =>
              patchSyncStatus('slack', { mode: slackStatus?.mode === 'background' ? 'manual' : 'background' })
            }
          />

          {slackChannels.length > 0 && (
            <div className="space-y-1">
              <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">Channels</p>
              {slackChannels.map((channelId) => {
                const active = slackIncludeIds.has(channelId)
                const rule = slackRules.find((r) => r.target === channelId && r.ruleType === 'include')
                return (
                  <div key={channelId} className="flex items-center justify-between p-3 bg-white rounded-lg border border-gray-200">
                    <div>
                      <span className="text-sm font-medium text-gray-900">{channelId}</span>
                      {rule && (
                        <span className="ml-2 text-xs text-gray-400">Configured by {memberMap[rule.createdBy] ?? rule.createdBy}</span>
                      )}
                    </div>
                    {canManage && (
                      <Toggle
                        checked={active}
                        disabled={!!saving}
                        onChange={() =>
                          active && rule
                            ? deleteRule('slack', rule.id)
                            : createRule('slack', channelId, channelId)
                        }
                      />
                    )}
                  </div>
                )
              })}
            </div>
          )}

          <div className="space-y-1">
            <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">Keyword Rules</p>
            {slackRules.filter((r) => r.ruleType === 'include' && !slackIncludeIds.has(r.target)).map((rule) => (
              <RuleRow
                key={rule.id}
                rule={rule}
                configuredBy={memberMap[rule.createdBy] ?? rule.createdBy}
                onDelete={() => deleteRule('slack', rule.id)}
                deleting={saving === rule.id}
                canManage={canManage}
              />
            ))}
            {canManage && (
              <AddRuleForm
                placeholder="Channel ID or keyword"
                onAdd={(target, targetName) => createRule('slack', target, targetName)}
                saving={saving?.startsWith('create-slack') ?? false}
              />
            )}
          </div>
        </div>
      )}

      {/* Capture Log tab */}
      {tab === 'log' && (
        <div className="space-y-3">
          <div className="flex gap-2">
            {(['all', 'captured', 'skipped', 'excluded'] as LogFilter[]).map((f) => (
              <button
                key={f}
                onClick={() => setLogFilter(f)}
                className={clsx(
                  'px-3 py-1 text-xs rounded-full font-medium transition-colors',
                  logFilter === f ? 'bg-indigo-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200',
                )}
              >
                {f.charAt(0).toUpperCase() + f.slice(1)}
              </button>
            ))}
          </div>

          <div className="space-y-1">
            {filteredLogs.length === 0 && (
              <p className="text-sm text-gray-400 text-center py-8">No capture events yet.</p>
            )}
            {filteredLogs.map((log) => (
              <div key={log.id} className="flex items-start gap-3 p-3 bg-white rounded-lg border border-gray-200">
                <span className={clsx('shrink-0 px-2 py-0.5 rounded text-xs font-medium', STATUS_BADGE[log.status] ?? 'bg-gray-100 text-gray-600')}>
                  {log.status}
                </span>
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-gray-900 truncate">{log.contentPreview}</p>
                  <p className="text-xs text-gray-400">{log.source} · {log.reason}</p>
                </div>
                <span className="text-xs text-gray-400 shrink-0">{timeAgo(log.timestamp)}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

// ─── sub-components ───────────────────────────────────────────────────────────

function SyncControls({
  label, status, saving, canManage, onTogglePause, onToggleBackground,
}: {
  label: string
  status: SyncStatus | null
  saving: boolean
  canManage: boolean
  onTogglePause: () => void
  onToggleBackground: () => void
}) {
  return (
    <div className="bg-white rounded-lg border border-gray-200 p-4 space-y-3">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm font-medium text-gray-900">{label} Sync</p>
          {status?.lastSyncAt && (
            <p className="text-xs text-gray-400">Last synced {timeAgo(status.lastSyncAt)}</p>
          )}
        </div>
        {status?.status === 'error' && (
          <span className="text-xs text-red-600 bg-red-50 px-2 py-1 rounded">{status.errorMessage ?? 'Error'}</span>
        )}
      </div>
      {canManage && (
        <div className="flex gap-3">
          <label className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer">
            <Toggle
              checked={status?.status !== 'paused'}
              disabled={saving}
              onChange={onTogglePause}
            />
            Active
          </label>
          <label className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer">
            <Toggle
              checked={status?.mode === 'background'}
              disabled={saving}
              onChange={onToggleBackground}
            />
            Background sync
          </label>
        </div>
      )}
    </div>
  )
}

function RuleRow({
  rule, configuredBy, onDelete, deleting, canManage,
}: {
  rule: CaptureRule
  configuredBy: string
  onDelete: () => void
  deleting: boolean
  canManage: boolean
}) {
  return (
    <div className="flex items-center justify-between p-3 bg-white rounded-lg border border-gray-200">
      <div>
        <span className="text-sm font-medium text-gray-900">{rule.targetName}</span>
        <span className="ml-2 text-xs text-gray-400">Configured by {configuredBy}</span>
      </div>
      {canManage && (
        <button
          onClick={onDelete}
          disabled={deleting}
          className="text-xs text-red-500 hover:text-red-700 disabled:opacity-50 transition-colors"
        >
          Remove
        </button>
      )}
    </div>
  )
}

function AddRuleForm({
  placeholder, onAdd, saving,
}: {
  placeholder: string
  onAdd: (target: string, targetName: string) => void
  saving: boolean
}) {
  const [target, setTarget] = useState('')
  const [name, setName] = useState('')

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!target.trim() || !name.trim()) return
    onAdd(target.trim(), name.trim())
    setTarget('')
    setName('')
  }

  return (
    <form onSubmit={handleSubmit} className="flex gap-2 pt-1">
      <input
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder="Display name"
        className="flex-1 px-3 py-1.5 text-sm border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-indigo-500"
      />
      <input
        value={target}
        onChange={(e) => setTarget(e.target.value)}
        placeholder={placeholder}
        className="flex-1 px-3 py-1.5 text-sm border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-indigo-500"
      />
      <button
        type="submit"
        disabled={saving || !target.trim() || !name.trim()}
        className="px-3 py-1.5 text-sm bg-indigo-600 text-white rounded-md hover:bg-indigo-700 disabled:opacity-50 transition-colors"
      >
        Add
      </button>
    </form>
  )
}

function Toggle({
  checked, disabled, onChange,
}: {
  checked: boolean
  disabled: boolean
  onChange: () => void
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      disabled={disabled}
      onClick={onChange}
      className={clsx(
        'relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200',
        checked ? 'bg-indigo-600' : 'bg-gray-200',
        disabled && 'opacity-50 cursor-not-allowed',
      )}
    >
      <span
        className={clsx(
          'pointer-events-none inline-block h-4 w-4 rounded-full bg-white shadow transform transition-transform duration-200',
          checked ? 'translate-x-4' : 'translate-x-0',
        )}
      />
    </button>
  )
}
