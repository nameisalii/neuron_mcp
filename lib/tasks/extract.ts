export type ExtractedTask = {
  title: string
  dueAt: Date | null
  priority: 'low' | 'medium' | 'high' | 'urgent'
  category: 'work' | 'school' | 'startup' | 'truck' | 'personal' | 'other'
  sourceSnippet: string
  confidence: number
}

const ACTION = /\b(please|can you|could you|need(?:s)? to|has to|must|finish|send|review|upload|call|follow up|schedule|submit|due)\b/i
const SMALL_TALK = /^(thanks|thank you|sounds good|lol|yes|no problem|ok|okay|great|got it)[.! ]*$/i
const WEEKDAYS: Record<string, number> = { sunday: 0, monday: 1, tuesday: 2, wednesday: 3, thursday: 4, friday: 5, saturday: 6 }
const MONTHS: Record<string, number> = {
  january: 0, february: 1, march: 2, april: 3, may: 4, june: 5,
  july: 6, august: 7, september: 8, october: 9, november: 10, december: 11,
}

function atLocalTime(date: Date, hour: number, minute = 0) {
  const result = new Date(date)
  result.setHours(hour, minute, 0, 0)
  return result
}

export function parseTaskDueAt(text: string, now = new Date()): Date | null {
  const lower = text.toLowerCase()
  let due: Date | null = null
  if (/\btoday\b|\beod\b/.test(lower)) due = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  else if (/\btomorrow\b/.test(lower)) due = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1)
  else {
    const calendarDate = lower.match(/\b(january|february|march|april|may|june|july|august|september|october|november|december)\s+(\d{1,2})(?:st|nd|rd|th)?(?:,?\s+(\d{4}))?\b/)
    if (calendarDate) {
      const year = calendarDate[3] ? Number(calendarDate[3]) : now.getFullYear()
      due = new Date(year, MONTHS[calendarDate[1]], Number(calendarDate[2]))
      // A yearless deadline that has already passed means the next occurrence.
      if (!calendarDate[3] && due < new Date(now.getFullYear(), now.getMonth(), now.getDate())) due.setFullYear(year + 1)
    } else {
      const weekday = lower.match(/\b(this|next|by|before)?\s*(monday|tuesday|wednesday|thursday|friday|saturday|sunday)\b/)
      if (!weekday) return null
      const target = WEEKDAYS[weekday[2]]
      let days = (target - now.getDay() + 7) % 7
      if (weekday[1] === 'next') days = days === 0 ? 7 : days + 7
      else if (days === 0) days = 7
      due = new Date(now.getFullYear(), now.getMonth(), now.getDate() + days)
    }
  }
  if (!due) return null

  const time = lower.match(/\b(?:by|before|at|due)?\s*(1[0-2]|0?[1-9])(?::([0-5]\d))?\s*(am|pm)\b/)
  if (time) {
    let hour = Number(time[1]) % 12
    if (time[3] === 'pm') hour += 12
    return atLocalTime(due, hour, Number(time[2] ?? 0))
  }
  return atLocalTime(due, 17)
}

function taskTitle(text: string): string {
  let value = text.replace(/\s+/g, ' ').trim().split(/(?<=[.!?])\s+/)[0]
  value = value
    .replace(/^\s*(?:hi|hey|hello)\s+(?:[a-z][\w-]*[,:]?\s+)?/i, '')
    .replace(/^\s*(?:hey\s+)?[a-z][\w-]*[,:]\s*/i, '')
    .replace(/^\s*(?:please\s+|can you\s+|could you\s+|you\s+)?/i, '')
    .replace(/^\s*(?:need(?:s)? to|has to|must)\s+/i, '')
    .replace(/\s+(?:please\s+)?(?:by|before|due)\s+(?:today|tomorrow|eod|this\s+|next\s+)?(?:monday|tuesday|wednesday|thursday|friday|saturday|sunday|\d{1,2}(?::\d{2})?\s*(?:am|pm))?.*$/i, '')
    .replace(/\s+today(?:\s+by\s+\d{1,2}(?::\d{2})?\s*(?:am|pm))?.*$/i, '')
    .replace(/\s*\(?\s*priority\s*(?:is|:)?\s*(?:low|medium|high|urgent)\s*\)?\s*$/i, '')
    .replace(/[.!?]+$/, '')
    .trim()
  if (!value) return ''
  return value.charAt(0).toUpperCase() + value.slice(1)
}

function category(text: string, sourceType?: string): ExtractedTask['category'] {
  const lower = text.toLowerCase()
  if (sourceType === 'datatruck' || /\b(load|pod|driver|truck|dispatch|bol|rate con)\b/.test(lower)) return 'truck'
  if (/\b(school|class|assignment|homework|exam|course)\b/.test(lower)) return 'school'
  if (/\b(startup|yc|investor|fundrais|pitch|founder)\b/.test(lower)) return 'startup'
  if (/\b(personal|doctor|dentist|family|home|grocery)\b/.test(lower)) return 'personal'
  return 'work'
}

export function extractTasks(text: string, options: { now?: Date; sourceType?: string } = {}): ExtractedTask[] {
  const cleaned = text.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim()
  if (cleaned.length < 8 || cleaned.length > 10_000 || SMALL_TALK.test(cleaned) || !ACTION.test(cleaned)) return []
  const title = taskTitle(cleaned)
  if (title.length < 4 || title.length > 180) return []
  const dueAt = parseTaskDueAt(cleaned, options.now)
  const explicitPriority = cleaned.match(/\bpriority\s*(?:is|:)?\s*(low|medium|high|urgent)\b/i)?.[1]?.toLowerCase() as ExtractedTask['priority'] | undefined
  const priority = explicitPriority ?? (/\b(urgent|asap|immediately|critical)\b/i.test(cleaned)
    ? 'urgent'
    : /\b(must|today|eod|high priority)\b/i.test(cleaned) ? 'high' : dueAt ? 'medium' : 'low')
  const confidence = Math.min(0.95, 0.58 + (dueAt ? 0.14 : 0) + (/\b(please|can you|could you|must)\b/i.test(cleaned) ? 0.12 : 0))
  return [{
    title,
    dueAt,
    priority,
    category: category(cleaned, options.sourceType),
    sourceSnippet: cleaned.slice(0, 300),
    confidence,
  }]
}

export function normalizeTaskTitle(title: string) {
  return title.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()
}
