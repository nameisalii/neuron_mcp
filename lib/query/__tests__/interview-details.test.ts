import { buildDetailedInterviewAnswer, extractInterviewDetails } from '../interview-details'
import { rewriteQuery } from '../rewrite'
import type { QuerySource } from '../source-ranking'

const confirmed: QuerySource = {
  chunkId: 'gmail-confirmed', pageId: 'thread-1', pageTitle: 'Your Screening Interview is Confirmed! [The Trade Desk]', notionPageId: null,
  content: `Thank you for booking time with me to speak about the 2027 North America Software Engineering Internship role.
We are set to speak at the following time:
Date/Time: Aug 7, 2026 11:00am–11:30am (GMT-07:00) Pacific Time (US & Canada)
Interviewers: Rachel Levine
Zoom: https://thetradedesk.zoom.us/j/94726662353`,
  labels: ['gmail', 'INBOX'], source: 'gmail', sourceUrl: 'https://mail.google.com/mail/#inbox/thread-1', sourceExternalId: 'message-1',
  owner: 'Rachel Levine <rachel.levine@thetradedesk.com>', sourceMetadata: { from: 'Rachel Levine <rachel.levine@thetradedesk.com>' },
  sourceCreatedAt: '2026-08-04T17:41:00Z', updatedAt: '2026-08-04T17:41:00Z', relevanceScore: 0.95, verified: true,
}

const assessment: QuerySource = {
  ...confirmed, chunkId: 'gmail-assessment', pageTitle: 'The Trade Desk | Invitation to Complete Online Assessment', sourceExternalId: 'message-2',
  content: 'You are invited to complete a CodeSignal Online Assessment. Start here: https://app.codesignal.com/assessment/abc',
}

it('extracts complete interview details from Gmail body content', () => {
  const details = extractInterviewDetails(confirmed, 'The Trade Desk')
  expect(details).toMatchObject({
    role: '2027 North America Software Engineering Internship',
    eventType: 'screening interview', status: 'confirmed', date: 'Aug 7, 2026',
    time: '11:00am–11:30am', duration: '30 minutes', interviewerNames: ['Rachel Levine'], platform: 'Zoom',
  })
  expect(details.timezone).toContain('GMT-07:00')
  expect(details.meetingLinks).toEqual(['https://thetradedesk.zoom.us/j/94726662353'])
})

it('answers with exact details and merges the related assessment timeline', () => {
  const answer = buildDetailedInterviewAnswer(rewriteQuery({ currentQuery: 'Do I have an interview with trade desk?' }), [confirmed, assessment])!
  expect(answer).toContain('2027 North America Software Engineering Internship')
  expect(answer).toContain('Aug 7, 2026, 11:00am–11:30am')
  expect(answer).toContain('Rachel Levine')
  expect(answer).toContain('https://thetradedesk.zoom.us/j/94726662353')
  expect(answer).toContain('CodeSignal')
  expect(answer).not.toMatch(/review the source cards for exact details/i)
})

it('does not invent fields missing from the source body', () => {
  const sparse = { ...confirmed, content: 'The Trade Desk confirmed your interview.', owner: null, sourceMetadata: null }
  const answer = buildDetailedInterviewAnswer(rewriteQuery({ currentQuery: 'Do I have an interview with trade desk?' }), [sparse])!
  expect(answer).toContain('Date/time: Not specified')
  expect(answer).toContain('could not confirm')
  expect(answer).not.toContain('Rachel Levine')
})

it('rejects hidden authentication links', () => {
  const source = { ...confirmed, content: `${confirmed.content}\nhttps://example.com/oauth?access_token=secret` }
  expect(extractInterviewDetails(source, 'The Trade Desk').meetingLinks).toHaveLength(1)
})
