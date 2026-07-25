'use client'

import { useState } from 'react'
import { Plus, X } from 'lucide-react'
import { useRouter } from 'next/navigation'
import DecisionTimeline, { type DecisionRow } from './DecisionTimeline'

export default function DecisionsClient({ initialDecisions }: { initialDecisions: DecisionRow[] }) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setSaving(true); setError(null)
    const form = new FormData(event.currentTarget)
    const response = await fetch('/api/decisions', {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ title: form.get('title'), summary: form.get('summary'), reason: form.get('reason'), impact: form.get('impact') }),
    })
    setSaving(false)
    if (!response.ok) { setError('Could not save this decision.'); return }
    setOpen(false); router.refresh()
  }

  return <div className="mx-auto max-w-4xl space-y-8">
    <header className="flex items-start justify-between gap-4">
      <div><h1 className="text-2xl font-bold text-gray-900">Decisions</h1><p className="mt-1 text-sm text-gray-500">Important decisions remembered from your company brain.</p></div>
      <button onClick={() => setOpen(true)} className="inline-flex items-center gap-2 rounded-lg bg-gray-900 px-4 py-2 text-sm font-medium text-white"><Plus className="h-4 w-4"/> Add decision</button>
    </header>
    <section className="space-y-3"><div><h2 className="font-semibold text-gray-900">Suggested decisions</h2><p className="text-sm text-gray-500">No suggested decisions right now.</p></div></section>
    <section className="space-y-3"><h2 className="font-semibold text-gray-900">Verified decisions</h2><DecisionTimeline decisions={initialDecisions}/></section>
    <section className="space-y-3"><div><h2 className="font-semibold text-gray-900">Archived decisions</h2><p className="text-sm text-gray-500">No archived decisions.</p></div></section>
    {open && <div className="fixed inset-0 z-50 grid place-items-center bg-black/30 p-4" onClick={() => setOpen(false)}><form onSubmit={submit} onClick={event => event.stopPropagation()} className="w-full max-w-lg space-y-4 rounded-2xl bg-white p-6 shadow-xl"><div className="flex justify-between"><h2 className="text-lg font-semibold">Add decision</h2><button type="button" aria-label="Close" onClick={() => setOpen(false)}><X className="h-5 w-5"/></button></div>{[['title','Title'],['summary','Summary'],['reason','Reason'],['impact','Impact']].map(([name,label]) => <label key={name} className="block text-sm font-medium">{label}<textarea name={name} required={name === 'title' || name === 'summary'} rows={name === 'summary' ? 3 : 2} className="mt-1 w-full rounded-lg border px-3 py-2"/></label>)}{error && <p className="text-sm text-red-600">{error}</p>}<button disabled={saving} className="w-full rounded-lg bg-gray-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-50">{saving ? 'Saving…' : 'Save decision'}</button></form></div>}
  </div>
}
