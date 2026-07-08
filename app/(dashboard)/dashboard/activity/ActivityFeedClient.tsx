'use client'

import ActivityDashboard from './ActivityDashboard'
import type { BrainActivityAnalytics } from '@/lib/activity/analytics'

interface Member {
  userId: string
  displayName: string
  avatarUrl?: string | null
}

interface Props {
  workspaceId: string
  workspaceType: string
  members: Member[]
  currentUserId: string
  analytics: BrainActivityAnalytics
}

export default function ActivityFeedClient(props: Props) {
  return <ActivityDashboard {...props} />
}
