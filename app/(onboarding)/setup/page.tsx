'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { motion, AnimatePresence } from 'framer-motion'
import { Button } from '@/components/ui/button'

type Step = 'intent' | 'team-name' | 'connect' | 'syncing' | 'ready'
type Intent = 'solo' | 'team'

const slide = {
  initial: { x: 40, opacity: 0 },
  animate: { x: 0, opacity: 1 },
  exit: { x: -40, opacity: 0 },
  transition: { duration: 0.22, ease: 'easeOut' as const },
}

export default function SetupPage() {
  const router = useRouter()
  const [step, setStep] = useState<Step>('intent')
  const [intent, setIntent] = useState<Intent>('solo')
  const [teamName, setTeamName] = useState('')
  const [notionSyncing, setNotionSyncing] = useState(false)
  const [slackConnecting, setSlackConnecting] = useState(false)
  const [notionDone, setNotionDone] = useState(false)
  const [syncProgress, setSyncProgress] = useState(0)
  const [syncTotal, setSyncTotal] = useState(0)
  const [extractedCount, setExtractedCount] = useState(0)
  const [question, setQuestion] = useState("What are our current priorities?")
  const [answer, setAnswer] = useState('')
  const [querying, setQuerying] = useState(false)
  const [saving, setSaving] = useState(false)

  async function chooseIntent(chosen: Intent) {
    setIntent(chosen)
    if (chosen === 'solo') {
      await fetch('/api/workspace', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type: 'solo' }),
      })
      setStep('connect')
    } else {
      setStep('team-name')
    }
  }

  async function saveTeamName() {
    if (!teamName.trim()) return
    setSaving(true)
    await fetch('/api/workspace', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type: 'team', name: teamName.trim() }),
    })
    setSaving(false)
    setStep('connect')
  }

  async function syncNotion() {
    setNotionSyncing(true)
    setSyncProgress(0)
    setSyncTotal(0)
    setStep('syncing')
    try {
      const res = await fetch('/api/integrations/notion/sync', { method: 'POST' })
      const data = await res.json()
      setSyncTotal(data.pages ?? 0)
      setSyncProgress(data.pages ?? 0)
      setExtractedCount(data.extracted ?? 0)
    } catch {
      // non-blocking
    } finally {
      setNotionSyncing(false)
      setNotionDone(true)
      setStep('ready')
    }
  }

  async function runQuery() {
    if (!question.trim()) return
    setQuerying(true)
    setAnswer('')
    try {
      const res = await fetch('/api/query', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ question }),
      })
      const data = await res.json()
      setAnswer(data.answer ?? '')
    } catch {
      setAnswer('Could not reach the brain right now.')
    } finally {
      setQuerying(false)
    }
  }

  async function finish() {
    await fetch('/api/user/onboarding-complete', { method: 'PATCH' })
    router.push('/dashboard')
  }

  return (
    <div className="w-full max-w-md">
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-8 min-h-[340px] relative overflow-hidden">
        <p className="text-xs font-semibold text-gray-400 tracking-widest uppercase mb-8">
          Neuron — Setup
        </p>

        <AnimatePresence mode="wait">
          {step === 'intent' && (
            <motion.div key="intent" {...slide}>
              <h1 className="text-xl font-bold text-gray-900 mb-2">How will you use Neuron?</h1>
              <p className="text-sm text-gray-500 mb-6">You can always invite your team later.</p>
              <div className="space-y-3">
                <button
                  onClick={() => chooseIntent('solo')}
                  className="w-full text-left p-4 rounded-lg border border-gray-200 hover:border-gray-900 hover:bg-gray-50 transition-colors group"
                >
                  <p className="font-semibold text-sm text-gray-900">Just me</p>
                  <p className="text-xs text-gray-500 mt-0.5">Personal knowledge brain — your notes, decisions, and context in one place.</p>
                </button>
                <button
                  onClick={() => chooseIntent('team')}
                  className="w-full text-left p-4 rounded-lg border border-gray-200 hover:border-gray-900 hover:bg-gray-50 transition-colors group"
                >
                  <p className="font-semibold text-sm text-gray-900">With my team</p>
                  <p className="text-xs text-gray-500 mt-0.5">Shared brain for your whole team — searchable, attributed, always up to date.</p>
                </button>
              </div>
            </motion.div>
          )}

          {step === 'team-name' && (
            <motion.div key="team-name" {...slide}>
              <h1 className="text-xl font-bold text-gray-900 mb-2">Name your workspace</h1>
              <p className="text-sm text-gray-500 mb-6">This is what your team will see.</p>
              <input
                autoFocus
                type="text"
                placeholder="Acme Inc."
                value={teamName}
                onChange={(e) => setTeamName(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && saveTeamName()}
                className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gray-900 mb-4"
              />
              <Button onClick={saveTeamName} disabled={saving || !teamName.trim()} className="w-full justify-center">
                {saving ? 'Saving…' : 'Continue →'}
              </Button>
            </motion.div>
          )}

          {step === 'connect' && (
            <motion.div key="connect" {...slide}>
              <h1 className="text-xl font-bold text-gray-900 mb-2">Connect your tools</h1>
              <p className="text-sm text-gray-500 mb-6">Sync your Notion pages and Slack conversations.</p>
              <div className="space-y-3 mb-6">
                <div className="flex items-center justify-between p-4 rounded-lg border border-gray-200">
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 bg-black rounded-md flex items-center justify-center text-white text-xs font-bold">N</div>
                    <div>
                      <p className="text-sm font-medium text-gray-900">Notion</p>
                      <p className="text-xs text-gray-500">Sync all pages your integration can access</p>
                    </div>
                  </div>
                  <Button onClick={syncNotion} disabled={notionSyncing || notionDone} className="shrink-0">
                    {notionDone ? '✓ Synced' : 'Sync'}
                  </Button>
                </div>

                <div className="flex items-center justify-between p-4 rounded-lg border border-gray-200">
                  <div className="flex items-center gap-3">
                    <img
                      src="/icons/slack.png"
                      alt="Slack"
                      className="w-8 h-8 rounded-md object-cover"
                    />
                    <div>
                      <p className="text-sm font-medium text-gray-900">Slack</p>
                      <p className="text-xs text-gray-500">Connect via OAuth to sync channels</p>
                    </div>
                  </div>
                  <a href="/api/integrations/slack/connect" className="shrink-0">
                    <Button disabled={slackConnecting}>Connect</Button>
                  </a>
                </div>
              </div>
              <button onClick={finish} className="text-sm text-gray-400 hover:text-gray-600 w-full text-center transition-colors">
                Skip for now — go to dashboard →
              </button>
            </motion.div>
          )}

          {step === 'syncing' && (
            <motion.div key="syncing" {...slide} className="py-4">
              <h1 className="text-xl font-bold text-gray-900 mb-2">Syncing your Notion…</h1>
              <p className="text-sm text-gray-500 mb-6">Extracting knowledge — this takes about a minute.</p>
              <div className="w-full h-2 bg-gray-100 rounded-full overflow-hidden mb-3">
                <motion.div
                  className="h-full bg-gray-900 rounded-full"
                  animate={{ width: notionSyncing ? '75%' : '100%' }}
                  transition={{ duration: 2, ease: 'easeInOut' }}
                />
              </div>
              <p className="text-xs text-gray-400">
                {syncTotal > 0 ? `${syncTotal} pages found` : 'Reading pages…'}
              </p>
            </motion.div>
          )}

          {step === 'ready' && (
            <motion.div key="ready" {...slide}>
              <h1 className="text-xl font-bold text-gray-900 mb-1">Your brain is ready</h1>
              {extractedCount > 0 && (
                <p className="text-sm text-gray-500 mb-4">
                  Found <strong>{extractedCount}</strong> knowledge item{extractedCount !== 1 ? 's' : ''} across {syncTotal} pages.
                </p>
              )}
              <p className="text-sm text-gray-500 mb-4">Try asking a question:</p>
              <textarea
                value={question}
                onChange={(e) => setQuestion(e.target.value)}
                rows={2}
                className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-gray-900 mb-3"
              />
              <Button onClick={runQuery} disabled={querying || !question.trim()} className="w-full justify-center mb-3">
                {querying ? 'Thinking…' : 'Ask →'}
              </Button>
              {answer && (
                <div className="p-3 bg-gray-50 rounded-lg border border-gray-200 mb-3 text-sm text-gray-700 leading-relaxed">
                  {answer}
                </div>
              )}
              <Button variant="secondary" onClick={finish} className="w-full justify-center">
                Go to my brain →
              </Button>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  )
}
