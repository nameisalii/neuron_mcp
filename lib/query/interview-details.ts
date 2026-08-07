import type { QuerySource } from './source-ranking'
import type { QueryRewriteResult } from './rewrite'

export type InterviewEventType = 'screening interview' | 'technical interview' | 'behavioral interview' | 'online assessment' | 'coding assessment' | 'recruiter call' | 'unknown'
export type InterviewStatus = 'confirmed' | 'invited' | 'requested availability' | 'completed' | 'unknown'

export interface InterviewDetails {
  company: string | null
  role: string | null
  eventType: InterviewEventType
  status: InterviewStatus
  date: string | null
  time: string | null
  timezone: string | null
  duration: string | null
  interviewerNames: string[]
  interviewerEmails: string[]
  senderName: string | null
  senderEmail: string | null
  meetingLinks: string[]
  assessmentLinks: string[]
  platform: 'Zoom' | 'Google Meet' | 'Teams' | 'CodeSignal' | 'HackerRank' | 'Karat' | 'CoderPad' | 'unknown'
  nextAction: string | null
  sourceId: string
  sourceTitle: string
  sourceType: 'gmail' | 'task' | 'decision' | 'knowledge'
}

const INTERVIEW_EVIDENCE = /\b(interview|phone screen|technical round|behavioral round|onsite|final round|recruiter call|schedule(?:d| an)? (?:a |the )?(?:call|interview)|availability for (?:a |the )?(?:call|interview)|booking time|we are set to speak)\b/i
const RECRUITING_RELATED = /\b(application|applied|online assessment|\bOA\b|codesignal|karat|hackerrank|recruiter|candidate)\b/i
const SAFE_LINK = /https?:\/\/[^\s<>"']+/gi

function firstMatch(text: string, patterns: RegExp[]): string | null {
  for (const pattern of patterns) {
    const value = text.match(pattern)?.[1]?.replace(/\s+/g, ' ').trim()
    if (value) return value
  }
  return null
}

function parsePerson(value: string | null): { name: string | null; email: string | null } {
  if (!value) return { name: null, email: null }
  const email = value.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i)?.[0] ?? null
  const name = value.replace(/<[^>]+>/g, '').replace(email ?? '', '').trim() || null
  return { name, email }
}

function safeLinks(text: string): string[] {
  return [...new Set((text.match(SAFE_LINK) ?? []).map((url) => url.replace(/[),.;]+$/, '')))]
    .filter((url) => !/oauth|access_token|refresh_token|authcode|client_secret/i.test(url))
}

function linkKind(url: string) {
  if (/zoom\.us\//i.test(url)) return 'Zoom'
  if (/meet\.google\.com\//i.test(url)) return 'Google Meet'
  if (/teams\.microsoft\.com\//i.test(url)) return 'Teams'
  if (/codesignal\.com\//i.test(url)) return 'CodeSignal'
  if (/hackerrank\.com\//i.test(url)) return 'HackerRank'
  if (/karat\.com\//i.test(url)) return 'Karat'
  if (/coderpad\.io\//i.test(url)) return 'CoderPad'
  return null
}

function eventType(text: string): InterviewEventType {
  if (/screening interview|screening call/i.test(text)) return 'screening interview'
  if (/technical interview|technical round/i.test(text)) return 'technical interview'
  if (/behavioral interview|behavioral round/i.test(text)) return 'behavioral interview'
  if (/online assessment/i.test(text)) return 'online assessment'
  if (/coding assessment|codesignal|hackerrank/i.test(text)) return 'coding assessment'
  if (/recruiter call|speak with (?:a |the )?recruiter/i.test(text)) return 'recruiter call'
  return 'unknown'
}

function durationFromRange(time: string | null): string | null {
  if (!time) return null
  const match = time.match(/(\d{1,2}):(\d{2})\s*(am|pm)\s*[–—-]\s*(\d{1,2}):(\d{2})\s*(am|pm)/i)
  if (!match) return null
  const minutes = (hour: string, minute: string, meridiem: string) => {
    let value = Number(hour) % 12
    if (meridiem.toLowerCase() === 'pm') value += 12
    return value * 60 + Number(minute)
  }
  const difference = minutes(match[4], match[5], match[6]) - minutes(match[1], match[2], match[3])
  return difference > 0 ? `${difference} minutes` : null
}

function sourceType(source: QuerySource): InterviewDetails['sourceType'] {
  return source.source === 'gmail' || source.source === 'task' || source.source === 'decision' ? source.source : 'knowledge'
}

export function extractInterviewDetails(source: QuerySource, company: string | null): InterviewDetails {
  const metadata = source.sourceMetadata ?? {}
  const text = `${source.pageTitle}\n${source.content}`
  const sender = parsePerson(typeof metadata.from === 'string' ? metadata.from : source.owner)
  const links = safeLinks(source.content)
  const meetingLinks = links.filter((url) => ['Zoom', 'Google Meet', 'Teams'].includes(linkKind(url) ?? ''))
  const assessmentLinks = links.filter((url) => ['CodeSignal', 'HackerRank', 'Karat', 'CoderPad'].includes(linkKind(url) ?? ''))
  const platform = linkKind([...meetingLinks, ...assessmentLinks][0] ?? '') ??
    (/codesignal/i.test(text) ? 'CodeSignal' : /zoom/i.test(text) ? 'Zoom' : 'unknown')
  const schedule = firstMatch(source.content, [
    /Date\s*\/\s*Time\s*:\s*([^\n\r]+)/i,
    /Date\s*and\s*time\s*:\s*([^\n\r]+)/i,
  ])
  const date = firstMatch(schedule ?? source.content, [
    /((?:Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|Jul(?:y)?|Aug(?:ust)?|Sep(?:tember)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)\s+\d{1,2},?\s+\d{4})/i,
    /(\d{1,2}\/\d{1,2}\/\d{2,4})/,
  ])
  const time = firstMatch(schedule ?? source.content, [
    /(\d{1,2}:\d{2}\s*(?:am|pm)\s*[–—-]\s*\d{1,2}:\d{2}\s*(?:am|pm))/i,
    /(\d{1,2}:\d{2}\s*(?:am|pm))/i,
  ])
  const timezone = firstMatch(schedule ?? source.content, [
    /(\(GMT[+-]\d{2}:?\d{2}\)\s*[^\n,]*(?:Time)?(?:\s*\([^\n]+\))?)/i,
    /((?:Pacific|Eastern|Central|Mountain) Time(?:\s*\([^\n]+\))?)/i,
    /(GMT[+-]\d{2}:?\d{2})/i,
  ])
  const interviewerLine = firstMatch(source.content, [/Interviewers?\s*:\s*([^\n\r]+)/i])
  const interviewerPeople = (interviewerLine ?? '').split(/,|\band\b/i).map((value) => parsePerson(value)).filter((person) => person.name || person.email)
  const role = firstMatch(source.content, [
    /(?:speak|talk|meet) (?:with me )?about (?:the )?([^\n.!?]+?(?:internship|role|position))/i,
    /(?:for|regarding) (?:the )?([^\n.!?]+?(?:internship|role|position))/i,
  ])
  const type = eventType(text)
  const status: InterviewStatus = /confirmed|we are set to speak|scheduled/i.test(text)
    ? 'confirmed'
    : /invited|invitation/i.test(text) ? 'invited'
      : /availability|select a time|book(?:ing)? time/i.test(text) ? 'requested availability'
        : /completed|thank you for interviewing/i.test(text) ? 'completed' : 'unknown'
  return {
    company,
    role,
    eventType: type,
    status,
    date,
    time,
    timezone,
    duration: durationFromRange(time) ?? firstMatch(source.content, [/(\d+\s*(?:minutes?|mins?|hours?))/i]),
    interviewerNames: interviewerPeople.map((person) => person.name).filter((value): value is string => Boolean(value)),
    interviewerEmails: interviewerPeople.map((person) => person.email).filter((value): value is string => Boolean(value)),
    senderName: sender.name,
    senderEmail: sender.email,
    meetingLinks,
    assessmentLinks,
    platform,
    nextAction: /(?:complete|take|start) (?:the |your )?(?:online |coding )?assessment/i.test(text) ? 'Complete the assessment' : null,
    sourceId: source.chunkId,
    sourceTitle: source.pageTitle,
    sourceType: sourceType(source),
  }
}

function label(value: string) {
  return value.charAt(0).toUpperCase() + value.slice(1)
}

export function buildDetailedInterviewAnswer(rewrite: QueryRewriteResult, sources: QuerySource[]): string | null {
  if (!['interview_status', 'count_interviews', 'company_specific_followup', 'deadline'].includes(rewrite.detectedIntent)) return null
  const company = rewrite.detectedEntities[0]
  if (!company) return null
  const extracted = sources.map((source) => ({ source, details: extractInterviewDetails(source, company) }))
  const confirmed = extracted.filter(({ source, details }) => INTERVIEW_EVIDENCE.test(source.content) && details.eventType !== 'online assessment' && details.eventType !== 'coding assessment')
  const related = extracted.filter(({ source, details }) => RECRUITING_RELATED.test(source.content) || details.assessmentLinks.length > 0)
  if (confirmed.length === 0) {
    if (related.length) return `I found ${company}-related recruiting content, but I don’t see enough evidence in the synced content to confirm an interview. The available sources appear related to an application or assessment rather than a confirmed interview.`
    return `I found ${company}-related synced content, but I don’t see evidence inside that content of an interview. A company name in a subject or title alone is not enough to confirm one.`
  }
  const primary = confirmed[0].details
  const lines = [`Yes — you have a ${primary.status === 'confirmed' ? 'confirmed ' : ''}${primary.eventType === 'unknown' ? 'interview' : primary.eventType} with ${company}.`, '', 'Details:']
  if (primary.role) lines.push(`- Role: ${primary.role}`)
  lines.push(`- Interview type: ${label(primary.eventType === 'unknown' ? 'interview (exact stage not specified)' : primary.eventType)}`)
  if (primary.date || primary.time) lines.push(`- Date/time: ${[primary.date, primary.time].filter(Boolean).join(', ')}${primary.timezone ? ` ${primary.timezone}` : ''}`)
  else lines.push('- Date/time: Not specified in the retrieved content')
  if (primary.duration) lines.push(`- Duration: ${primary.duration}`)
  const interviewer = primary.interviewerNames[0] ?? primary.senderName
  if (interviewer) lines.push(`- Interviewer/contact: ${interviewer}${primary.interviewerEmails[0] ? ` <${primary.interviewerEmails[0]}>` : ''}`)
  for (const url of primary.meetingLinks) lines.push(`- ${primary.platform === 'unknown' ? 'Meeting' : primary.platform} link: ${url}`)
  const assessment = related.find(({ details }) => ['online assessment', 'coding assessment'].includes(details.eventType) || details.assessmentLinks.length > 0)
  if (assessment) {
    lines.push(`- Related step: ${label(assessment.details.eventType === 'unknown' ? 'online assessment invitation' : assessment.details.eventType)} — “${assessment.details.sourceTitle}”`)
    for (const url of assessment.details.assessmentLinks) lines.push(`- ${assessment.details.platform === 'unknown' ? 'Assessment' : assessment.details.platform} link: ${url}`)
  }
  lines.push('', 'Sources:')
  for (const { details } of [...confirmed, ...related.filter((item) => !confirmed.includes(item))].slice(0, 4)) {
    lines.push(`- ${details.sourceType === 'gmail' ? 'Gmail' : label(details.sourceType)}${details.senderName ? ` from ${details.senderName}` : ''}: “${details.sourceTitle}”`)
  }
  const missing = [!primary.role && 'role', !primary.date && 'date', !primary.time && 'time', !(primary.interviewerNames.length || primary.senderName) && 'interviewer'].filter(Boolean)
  if (missing.length) lines.push('', `I could not confirm the ${missing.join(', ')} from the retrieved content, so I did not infer ${missing.length === 1 ? 'it' : 'them'}.`)
  return lines.join('\n')
}
