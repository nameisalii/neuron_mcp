'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'

export default function OnboardingClient() {
  const router = useRouter()
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')

  async function completeOnboarding() {
    setSubmitting(true)
    setError('')

    const response = await fetch('/api/onboarding', { method: 'POST' })
    if (!response.ok) {
      setError('Could not finish setup. Please try again.')
      setSubmitting(false)
      return
    }

    router.push('/dashboard/overview')
    router.refresh()
  }

  return (
    <div className="w-full max-w-md rounded-xl border border-gray-200 bg-white p-8 shadow-sm">
      <p className="mb-6 text-xs font-semibold uppercase tracking-widest text-gray-400">
        Neuron Setup
      </p>
      <h1 className="mb-2 text-2xl font-bold text-gray-900">Welcome to Neuron</h1>
      <p className="mb-6 text-sm text-gray-500">Let&apos;s create your personal workspace.</p>
      <Button
        className="w-full justify-center"
        disabled={submitting}
        onClick={completeOnboarding}
      >
        {submitting ? 'Creating workspace...' : 'Continue to dashboard'}
      </Button>
      {error && <p className="mt-3 text-sm text-red-600">{error}</p>}
    </div>
  )
}
