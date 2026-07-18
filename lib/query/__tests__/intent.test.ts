import { detectQueryIntent } from '../intent'

const NOW = new Date('2026-07-09T18:30:00.000Z')

it('detects latest Telegram summary intent', () => {
  expect(detectQueryIntent('give recent updates in telegram', NOW)).toMatchObject({
    requestedSources: ['telegram'],
    temporalIntent: { type: 'last_7_days' },
    queryType: 'summary',
  })
})

it('detects source aliases', () => {
  expect(detectQueryIntent('latest email updates', NOW).requestedSources).toEqual(['gmail'])
  expect(detectQueryIntent('what happened in Microsoft Teams?', NOW).requestedSources).toEqual(['teams'])
  expect(detectQueryIntent('what happened in TMS today?', NOW).requestedSources).toEqual(['datatruck'])
  expect(detectQueryIntent('where is truck 554322 in TT ELD?', NOW).requestedSources).toEqual(['five_eld'])
})

it.each([
  ['today', 'today'],
  ['yesterday', 'yesterday'],
  ['this week', 'this_week'],
  ['last 7 days', 'last_7_days'],
  ['latest', 'latest'],
] as const)('detects %s temporal intent', (query, type) => {
  expect(detectQueryIntent(`show ${query} Slack changes`, NOW).temporalIntent.type).toBe(type)
})

it('detects document and calculation queries', () => {
  expect(detectQueryIntent('find BOL for load 12345', NOW).queryType).toBe('document')
  expect(detectQueryIntent('how many Datatruck loads changed today?', NOW).queryType).toBe('calculation')
})
