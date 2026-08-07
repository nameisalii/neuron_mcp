export type DetectedQueryIntent =
  | 'count_interviews'
  | 'interview_status'
  | 'deadline'
  | 'next_steps'
  | 'company_specific_followup'
  | 'task_lookup'
  | 'decision_lookup'
  | 'general_search'

export interface QueryHistoryMessage {
  role: 'user' | 'assistant'
  content: string
}

export interface QueryRewriteResult {
  originalQuery: string
  rewrittenQuery: string
  detectedEntities: string[]
  detectedIntent: DetectedQueryIntent
  sourceHints: string[]
  needsClarification: boolean
  clarificationQuestion: string | null
  isFollowUp: boolean
  entitySearchTerms: string[]
}

const ENTITY_ALIASES = [
  { canonical: 'Hudson River Trading', aliases: ['HRT', 'Hudson River Trading'] },
  { canonical: 'Jane Street', aliases: ['JS', 'Jane Street'] },
  { canonical: 'Capital One', aliases: ['C1', 'Capital One'] },
  { canonical: 'Citadel', aliases: ['Citadel'] },
  { canonical: 'The Trade Desk', aliases: ['The Trade Desk', 'Trade Desk', 'TTD'] },
  { canonical: 'DataTruck', aliases: ['DataTruck', 'Data Truck', 'TMS', 'dispatch', 'truck management'] },
  { canonical: 'Five ELD', aliases: ['Five ELD', '5 ELD', 'TT ELD', 'ELD', 'GPS'] },
  { canonical: 'Gmail', aliases: ['Gmail', 'email', 'mail', 'inbox'] },
] as const

const INTERVIEW_TERMS = /\b(interviews?|recruit(?:er|ing)?|oa|online assessment|onsite|phone screen|technical|behavioral|final round|offer deadline)\b/i
const TRUCKING_TERMS = /\b(truck(?:ing)?|tms|dispatch|eld|gps|fleet|driver|load|integration)\b/i
const FOLLOW_UP_START = /^(what about|and\b|also\b|that one\b|it\b|them\b|this\b|when\b|why\b|how many\b|any updates\b)/i

function hasAlias(text: string, alias: string): boolean {
  const escaped = alias.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/\s+/g, '\\s+')
  return new RegExp(`(^|\\W)${escaped}(?=$|\\W)`, 'i').test(text)
}

export function detectQueryEntities(text: string, context = ''): Array<{ canonical: string; aliases: string[] }> {
  const truckingContext = TRUCKING_TERMS.test(`${text} ${context}`)
  return ENTITY_ALIASES.filter((entity) => {
    if (entity.canonical === 'Five ELD' && !truckingContext) return entity.aliases.some((alias) => alias !== 'TT ELD' && alias !== 'ELD' && alias !== 'GPS' && hasAlias(text, alias))
    return entity.aliases.some((alias) => hasAlias(text, alias))
  }).map((entity) => ({ canonical: entity.canonical, aliases: [...entity.aliases] }))
}

export function isShortFollowUp(query: string): boolean {
  const words = query.trim().split(/\s+/).filter(Boolean)
  return words.length < 6 || FOLLOW_UP_START.test(query.trim()) || detectQueryEntities(query).some((entity) => entity.aliases.some((alias) => query.trim().toLowerCase() === alias.toLowerCase()))
}

function detectIntent(text: string): DetectedQueryIntent {
  if (/\bhow many\b/i.test(text) && INTERVIEW_TERMS.test(text)) return 'count_interviews'
  if (INTERVIEW_TERMS.test(text) && /\b(status|update|where|stage|round|do i have|is there|any)\b/i.test(text)) return 'interview_status'
  if (/\b(deadline|due|when is|what date)\b/i.test(text)) return 'deadline'
  if (/\b(next steps?|follow[- ]?ups?|what next)\b/i.test(text)) return 'next_steps'
  if (/\b(tasks?|to[- ]?dos?|action items?)\b/i.test(text)) return 'task_lookup'
  if (/\b(decisions?|decided)\b/i.test(text)) return 'decision_lookup'
  return 'general_search'
}

function interviewRewrite(entity: { canonical: string; aliases: string[] }, count: boolean): string {
  const names = entity.canonical === 'Hudson River Trading' ? 'HRT or Hudson River Trading' : entity.aliases.slice(0, 2).join(' or ')
  return `What ${count ? 'interviews, interview count, ' : ''}interview status, upcoming steps, recruiter messages or emails, tasks, or deadlines do I have related to ${names}?`
}

export function rewriteQuery(input: {
  currentQuery: string
  history?: QueryHistoryMessage[]
}): QueryRewriteResult {
  const originalQuery = input.currentQuery.trim()
  const history = (input.history ?? []).slice(-6)
  const previousUser = [...history].reverse().find((message) => message.role === 'user')?.content ?? ''
  const recentContext = history.map((message) => message.content).join(' ')
  const entities = detectQueryEntities(originalQuery, recentContext)
  const previousEntities = detectQueryEntities(previousUser, recentContext)
  const followUp = isShortFollowUp(originalQuery)
  const previousIntent = detectIntent(previousUser)
  const currentIntent = detectIntent(originalQuery)
  const interviewContext = INTERVIEW_TERMS.test(recentContext) || previousIntent === 'count_interviews' || previousIntent === 'interview_status'
  const entity = entities[0]
  const entityOnly = Boolean(entity?.aliases.some((alias) => originalQuery.toLowerCase() === alias.toLowerCase()))
  const explicitFollowUpPhrase = FOLLOW_UP_START.test(originalQuery)

  let rewrittenQuery = originalQuery
  let detectedIntent = currentIntent
  let needsClarification = false
  let clarificationQuestion: string | null = null

  if (followUp && entity && interviewContext && entity.canonical !== 'DataTruck' && entity.canonical !== 'Five ELD' && entity.canonical !== 'Gmail') {
    rewrittenQuery = interviewRewrite(entity, previousIntent === 'count_interviews')
    detectedIntent = 'company_specific_followup'
  } else if (followUp && entity?.canonical === 'DataTruck' && TRUCKING_TERMS.test(previousUser)) {
    rewrittenQuery = 'What updates, integration status, tasks, decisions, or next steps are related to DataTruck or Data Truck TMS?'
    detectedIntent = 'company_specific_followup'
  } else if (followUp && entity?.canonical === 'DataTruck' && interviewContext) {
    rewrittenQuery = 'Find information related to DataTruck / Data Truck TMS.'
    needsClarification = true
    clarificationQuestion = 'Do you mean DataTruck recruiting/interviews, or the DataTruck trucking integration?'
  } else if (/^when\b/i.test(originalQuery) && previousUser) {
    const previousEntity = previousEntities[0]
    rewrittenQuery = `When is the event, interview, deadline, or next step${previousEntity ? ` related to ${previousEntity.aliases.slice(0, 2).join(' or ')}` : ''} discussed in: ${previousUser}`
    detectedIntent = 'deadline'
  } else if (followUp && entity && !previousUser && (explicitFollowUpPhrase || entityOnly)) {
    const names = entity.canonical === 'Hudson River Trading' ? 'HRT / Hudson River Trading' : entity.aliases.slice(0, 2).join(' / ')
    rewrittenQuery = `Find information related to ${names}.`
  } else if (followUp && entity && previousUser) {
    rewrittenQuery = `Regarding ${entity.aliases.slice(0, 2).join(' or ')}, ${previousUser}`
    detectedIntent = 'company_specific_followup'
  }

  const detected = entities.length ? entities : (followUp ? previousEntities : [])
  const recruiting = INTERVIEW_TERMS.test(rewrittenQuery) || detectedIntent === 'company_specific_followup' && interviewContext
  return {
    originalQuery,
    rewrittenQuery,
    detectedEntities: detected.map((item) => item.canonical),
    detectedIntent,
    sourceHints: recruiting
      ? ['gmail', 'tasks', 'decisions', 'knowledge', 'slack', 'telegram']
      : detectedIntent === 'task_lookup' ? ['tasks', 'knowledge'] : detectedIntent === 'decision_lookup' ? ['decisions', 'knowledge'] : ['knowledge'],
    needsClarification,
    clarificationQuestion,
    isFollowUp: followUp,
    entitySearchTerms: [...new Set(detected.filter((item) => item.canonical !== 'Gmail').flatMap((item) => item.aliases))],
  }
}
