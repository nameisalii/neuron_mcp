import { formatKnowledgeItemPreview } from '../preview'

const dt38 = `Linear issue DT-38: URGENT: Limit Unauthorized User on DeepTracer Website to create jobs
Description:
**Issue:** At present, unauthorized users can create jobs without log-in.

**Objective:** We want to ensure only logged-in users can create new jobs.

**Task Description:** Implement a security mechanism that redirects unauthenticated users to sign-up.

[https://github.com/DrDongSi/Deep-Tracer-Website/pull/279](https://github.com/DrDongSi/Deep-Tracer-Website/pull/279)

Checklist:
- [X] Only allow logged-in users to submit new jobs
- [ ] Add a job queue button
Status: Canceled (canceled)
Team: DeepTracer (DT)
Creator: rzhu@overlake.org
Priority: Urgent (1)
Labels: frontend, Testing
Created: 2025-03-02T02:15:39.229Z
Updated: 2026-02-10T15:34:43.287Z
Status history:
- 2026-02-10T15:34:43.257Z: Unknown changed In Progress to Canceled
Linear URL: https://linear.app/deeptracer/issue/DT-38/example`

it('formats a Linear issue into a clean source-aware preview', () => {
  const preview = formatKnowledgeItemPreview({
    content: dt38,
    category: 'status_update',
    source: 'linear',
    sourceUrl: 'https://linear.app/deeptracer/issue/DT-38/example',
  })

  expect(preview.displayTitle).toBe('DT-38: Limit Unauthorized User on DeepTracer Website to create jobs')
  expect(preview.displaySummary).toBe('We want to ensure only logged-in users can create new jobs.')
  expect(preview.metadataChips.map((chip) => chip.value)).toEqual([
    'Canceled',
    'Urgent',
    'DeepTracer',
    'frontend',
    'Testing',
    'Updated Feb 10, 2026',
  ])
  expect(preview.githubLinks).toEqual(['https://github.com/DrDongSi/Deep-Tracer-Website/pull/279'])
  expect(preview.details).toEqual(expect.arrayContaining([
    { label: 'Creator', value: 'rzhu@overlake.org' },
    { label: 'Checklist', value: expect.stringContaining('Open: Add a job queue button') },
  ]))
  expect(preview.rawContent).not.toContain('https://linear.app')
})

it('humanizes short generic knowledge without repeating it as summary', () => {
  const preview = formatKnowledgeItemPreview({ content: 'Choose Postgres', category: 'decision', source: 'slack' })
  expect(preview.displayTitle).toBe('Choose Postgres')
  expect(preview.displaySummary).toBe('Relevant context from Slack.')
})
