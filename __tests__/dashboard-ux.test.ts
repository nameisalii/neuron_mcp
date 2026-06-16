/** @jest-environment node */
import fs from 'fs'
import path from 'path'

const read = (file: string) => fs.readFileSync(path.join(process.cwd(), file), 'utf8')

it('keeps Overview as the stats and filtered knowledge dashboard without Recent Activity', () => {
  const overview = read('app/(dashboard)/dashboard/overview/page.tsx')
  const overviewClient = read('app/(dashboard)/dashboard/overview/OverviewClient.tsx')
  expect(overview).toContain('<OverviewClient')
  expect(overviewClient).toContain("label: 'Knowledge Items'")
  expect(overviewClient).toContain("label: 'Decisions'")
  expect(overviewClient).toContain("label: 'Ideas'")
  expect(overviewClient).toContain("label: 'Last Sync'")
  expect(overviewClient).toContain('<BrainGrid')
  expect(overviewClient).not.toContain('Recent Activity')
})

it('shows only the top three Notion pages by default', () => {
  const notion = read('app/(dashboard)/dashboard/notion/page.tsx')
  expect(notion).toContain('rankNotionPages')
  expect(notion).toContain('ranked.slice(0, 3)')
  expect(notion).toContain('Summary')
  expect(notion).toContain('View all pages')
})

it('offers scoped reset controls for Slack, Linear, and Notion', () => {
  const integrations = read('app/(dashboard)/dashboard/integrations/page.tsx')
  const notionCard = read('app/(dashboard)/dashboard/integrations/NotionIntegrationCard.tsx')
  expect(integrations).toContain('resetType="slack"')
  expect(integrations).toContain('resetType="linear"')
  expect(notionCard).toContain('resetType="notion"')
})
