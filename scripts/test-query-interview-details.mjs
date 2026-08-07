import 'dotenv/config'
import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()
const originalQuery = 'Do I have an interview with trade desk?'
const linkKinds = (text) => ({
  Zoom: (text.match(/https?:\/\/[^\s]*zoom\.us[^\s]*/gi) ?? []).length,
  CodeSignal: (text.match(/https?:\/\/[^\s]*codesignal\.com[^\s]*/gi) ?? []).length,
})

try {
  const sources = await prisma.emailChunk.findMany({
    where: { OR: [{ content: { contains: 'Trade Desk', mode: 'insensitive' } }, { thread: { subject: { contains: 'Trade Desk', mode: 'insensitive' } } }] },
    include: { thread: { select: { subject: true } } }, orderBy: { updatedAt: 'desc' }, take: 10,
  })
  const top = sources.map((source) => ({
    title: source.thread.subject,
    hasInterview: /interview|phone screen|recruiter call/i.test(source.content),
    role: source.content.match(/about (?:the )?([^\n.!?]+?(?:internship|role|position))/i)?.[1] ?? null,
    eventType: /screening interview/i.test(`${source.thread.subject} ${source.content}`) ? 'screening interview' : /online assessment|codesignal/i.test(source.content) ? 'online assessment' : 'unknown',
    dateTime: source.content.match(/Date\s*\/\s*Time\s*:\s*([^\n\r]+)/i)?.[1]?.trim() ?? null,
    timezone: source.content.match(/\(GMT[+-]\d{2}:?\d{2}\)|Pacific Time/i)?.[0] ?? null,
    interviewer: source.content.match(/Interviewers?\s*:\s*([^\n\r]+)/i)?.[1]?.trim() ?? null,
    linkTypes: linkKinds(source.content),
  }))
  const interview = top.find((source) => source.eventType.includes('interview'))
  const assessment = top.find((source) => source.eventType.includes('assessment'))
  const answerPreview = interview
    ? `Yes — a ${interview.eventType} with The Trade Desk was found. Role: ${interview.role ?? 'not extracted'}. Date/time: ${interview.dateTime ?? 'not extracted'}. Interviewer: ${interview.interviewer ?? 'not extracted'}. Zoom links found: ${interview.linkTypes.Zoom}. Related CodeSignal assessment: ${assessment ? 'yes' : 'no'}.`
    : 'No confirmed Trade Desk interview was extracted from the synced chunks.'
  console.log(JSON.stringify({ originalQuery, detectedCompany: 'The Trade Desk', detectedIntent: 'interview_status', sourceCount: sources.length, topSources: top, answerPreview, privateBodiesPrinted: false, privateLinksPrinted: false }, null, 2))
} finally {
  await prisma.$disconnect()
}
