export type KnowledgeCategory =
  | 'rule'
  | 'decision'
  | 'process'
  | 'idea'
  | 'plan'
  | 'follow_up'
  | 'status_update'
  | 'reference'
  | 'fact'
  | 'note'

export type WorkspaceType = 'solo' | 'team'
export type WorkspacePlan = 'free' | 'starter' | 'team' | 'business'
export type MemberRole = 'owner' | 'admin' | 'member' | 'viewer'
export type MemberStatus = 'active' | 'pending' | 'removed'
export type InvitationStatus = 'pending' | 'accepted' | 'expired' | 'revoked'
export type ChunkVisibility = 'personal' | 'team'
export type ActivityEventType =
  | 'sync'
  | 'label'
  | 'verify'
  | 'invite'
  | 'join'
  | 'query'
  | 'settings_change'
  | 'conflict_detected'
  | 'page_viewed'

export interface LabeledByEntry {
  userId: string
  label: string
  displayName: string
  at: string
}

export interface ActivityEventRow {
  id: string
  workspaceId: string
  userId: string
  displayName: string
  eventType: ActivityEventType
  description: string
  metadata: Record<string, unknown> | null
  createdAt: Date
}

export interface WorkspaceSummary {
  id: string
  name: string | null
  type: WorkspaceType
  iconUrl: string | null
  plan: WorkspacePlan
  role: MemberRole
}

export interface WorkspaceMemberRow {
  id: string
  userId: string
  displayName: string
  avatarUrl: string | null
  role: MemberRole
  status: MemberStatus
  department: string | null
  joinedAt: Date
  invitedBy: string | null
}

export interface InvitationRow {
  id: string
  email: string
  role: MemberRole
  status: InvitationStatus
  expiresAt: Date
  createdAt: Date
}

export interface SlackMessage {
  text: string
  user: string
  channel: string
  ts: string
  permalink?: string
}

export interface ExtractedItem {
  content: string
  category: KnowledgeCategory
  owner: string | null
  confidence: number
}

export interface WorkspaceStats {
  knowledgeItems: number
  decisions: number
  ideas: number
  integrations: number
}

export interface SlackOAuthToken {
  ok: boolean
  access_token: string
  bot_user_id: string
  team: {
    id: string
    name: string
  }
  error?: string
}

export interface GmailSyncMetadata {
  selectedLabels: string[]
  selectedLabelNames: string[]
  timeWindow: number
  syncFrom?: string
  lastSyncAttemptAt?: string
  lastSuccessfulImportAt?: string
  senderFilter: string[]
  excludeFilter?: string[]
  maxMessages?: number
  threadCount?: number
  status?: string
  privacy?: 'personal'
}

export interface GmailLabelInfo {
  id: string
  name: string
  type: 'system' | 'user'
  messageCount: number
}

export interface QueryResult {
  answer: string
  confidence: number
  sources: Array<{
    id: string
    content: string
    category: KnowledgeCategory
    source: string
    verified: boolean
    confidence: number
  }>
}
