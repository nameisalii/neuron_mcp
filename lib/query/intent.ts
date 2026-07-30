import { detectRequestedSources } from './sourceIntent'

export type TemporalIntentType = 'latest' | 'today' | 'yesterday' | 'this_week' | 'last_7_days' | 'all_time'

export interface QueryIntent {
  requestedSources: string[]
  temporalIntent: {
    type: TemporalIntentType
    since?: Date
    until?: Date
  }
  queryType: 'summary' | 'lookup' | 'document' | 'calculation' | 'general'
}

function startOfLocalDay(now: Date): Date {
  return new Date(now.getFullYear(), now.getMonth(), now.getDate())
}

function startOfWeek(now: Date): Date {
  const start = startOfLocalDay(now)
  const day = start.getDay()
  const diff = day === 0 ? 6 : day - 1
  start.setDate(start.getDate() - diff)
  return start
}

export function detectQueryIntent(query: string, now: Date = new Date()): QueryIntent {
  const normalized = query.toLowerCase()
  const requestedSources: string[] = detectRequestedSources(query)

  let temporalIntent: QueryIntent['temporalIntent'] = { type: 'all_time' }
  if (/\b(today|this morning|this afternoon|tonight)\b/i.test(normalized)) {
    temporalIntent = { type: 'today', since: startOfLocalDay(now), until: now }
  } else if (/\byesterday\b/i.test(normalized)) {
    const until = startOfLocalDay(now)
    const since = new Date(until)
    since.setDate(since.getDate() - 1)
    temporalIntent = { type: 'yesterday', since, until }
  } else if (/\b(this week|week so far)\b/i.test(normalized)) {
    temporalIntent = { type: 'this_week', since: startOfWeek(now), until: now }
  } else if (/\b(last 7 days|past 7 days|recent|recently)\b/i.test(normalized)) {
    temporalIntent = { type: 'last_7_days', since: new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000), until: now }
  } else if (/\b(latest|newest|updates?|what changed|what happened)\b/i.test(normalized)) {
    temporalIntent = { type: 'latest', since: new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000), until: now }
  }

  const queryType = /\b(bol|pod|document|file|attachment|invoice pdf|rate con|rate confirmation)\b/i.test(normalized)
    ? 'document'
    : /\b(calculate|sum|total|average|count|how many)\b/i.test(normalized)
      ? 'calculation'
      : /\b(latest|recent|updates?|summarize|summary|what changed|what happened|today|yesterday|this week|last 7 days)\b/i.test(normalized)
        ? 'summary'
        : 'general'

  return { requestedSources, temporalIntent, queryType }
}
