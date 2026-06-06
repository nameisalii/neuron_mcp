'use client'

import { useEffect, useState } from 'react'
import { useRouter, useParams } from 'next/navigation'
import { Button } from '@/components/ui/button'

type State = 'loading' | 'accepting' | 'done' | 'error'

export default function InviteAcceptPage() {
  const router = useRouter()
  const { token } = useParams<{ token: string }>()
  const [state, setState] = useState<State>('loading')
  const [errorMsg, setErrorMsg] = useState('')
  const [workspaceId, setWorkspaceId] = useState('')

  useEffect(() => {
    setState('accepting')
    fetch(`/api/team/invite/${token}/accept`, { method: 'POST' })
      .then(async (res) => {
        const data = await res.json()
        if (!res.ok) {
          setErrorMsg(data.error ?? 'Something went wrong.')
          setState('error')
        } else {
          setWorkspaceId(data.workspaceId)
          setState('done')
        }
      })
      .catch(() => {
        setErrorMsg('Network error. Please try again.')
        setState('error')
      })
  }, [token])

  return (
    <div className="w-full max-w-md">
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-8 text-center">
        <p className="text-xs font-semibold text-gray-400 tracking-widest uppercase mb-8">Neuron</p>

        {(state === 'loading' || state === 'accepting') && (
          <div>
            <div className="w-8 h-8 border-2 border-gray-300 border-t-gray-900 rounded-full animate-spin mx-auto mb-4" />
            <p className="text-sm text-gray-500">Joining workspace…</p>
          </div>
        )}

        {state === 'done' && (
          <div>
            <div className="w-12 h-12 bg-emerald-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <span className="text-emerald-600 text-xl">✓</span>
            </div>
            <h1 className="text-xl font-bold text-gray-900 mb-2">You're in!</h1>
            <p className="text-sm text-gray-500 mb-6">You've joined the workspace. Your personal brain is still yours — use the workspace switcher in the sidebar to move between them.</p>
            <Button onClick={() => router.push('/dashboard')} className="w-full justify-center">
              Go to dashboard →
            </Button>
          </div>
        )}

        {state === 'error' && (
          <div>
            <div className="w-12 h-12 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <span className="text-red-600 text-xl">✕</span>
            </div>
            <h1 className="text-xl font-bold text-gray-900 mb-2">Invite issue</h1>
            <p className="text-sm text-red-600 mb-6">{errorMsg}</p>
            <Button variant="secondary" onClick={() => router.push('/dashboard')} className="w-full justify-center">
              Go to dashboard
            </Button>
          </div>
        )}
      </div>
    </div>
  )
}
