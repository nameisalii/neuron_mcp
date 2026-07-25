'use client'

import { usePathname, useSearchParams } from 'next/navigation'
import { useState, type FormEvent } from 'react'

const feedbackTypes = [
  'General feedback',
  'Bug report',
  'Feature request',
  'Integration request',
  'Confusing answer',
  'Other',
] as const

export default function FeedbackForm() {
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const [type, setType] = useState<(typeof feedbackTypes)[number]>('General feedback')
  const [message, setMessage] = useState('')
  const [email, setEmail] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [sent, setSent] = useState(false)

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setBusy(true)
    setError(null)
    setSent(false)
    try {
      const context = searchParams?.get('context')
      const page = context ? `${pathname}?context=${context}` : pathname
      const response = await fetch('/api/feedback', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type, message, email, page }),
      })
      const body = await response.json().catch(() => ({})) as { error?: string }
      if (!response.ok) throw new Error(body.error || 'Could not send feedback.')
      setMessage('')
      setSent(true)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not send feedback.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <form onSubmit={submit} className="space-y-5">
      <label className="block text-sm font-medium text-gray-800">
        Type
        <select value={type} onChange={(event) => setType(event.target.value as typeof type)} className="mt-2 w-full rounded-xl border border-gray-200 bg-white px-3 py-2.5">
          {feedbackTypes.map((option) => <option key={option}>{option}</option>)}
        </select>
      </label>
      <label className="block text-sm font-medium text-gray-800">
        Message
        <textarea required minLength={5} maxLength={5000} value={message} onChange={(event) => setMessage(event.target.value)} rows={7} placeholder="What would you like us to know?" className="mt-2 w-full resize-y rounded-xl border border-gray-200 px-3 py-2.5" />
      </label>
      <label className="block text-sm font-medium text-gray-800">
        Email <span className="font-normal text-gray-400">(optional)</span>
        <input type="email" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="you@example.com" className="mt-2 w-full rounded-xl border border-gray-200 px-3 py-2.5" />
      </label>
      {error && <p role="alert" className="text-sm text-red-600">{error}</p>}
      {sent && <p role="status" className="rounded-xl bg-emerald-50 px-4 py-3 text-sm text-emerald-700">Thank you — your feedback was sent.</p>}
      <button type="submit" disabled={busy || message.trim().length < 5} className="rounded-xl bg-black px-5 py-2.5 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50">
        {busy ? 'Sending…' : 'Submit feedback'}
      </button>
    </form>
  )
}
