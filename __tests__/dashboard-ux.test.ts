/** @jest-environment node */
import fs from 'fs'
import path from 'path'

const read = (file: string) => fs.readFileSync(path.join(process.cwd(), file), 'utf8')

it('keeps Overview as the stats and filtered knowledge dashboard without Recent Activity', () => {
  const overview = read('app/(dashboard)/dashboard/overview/page.tsx')
  expect(overview).toContain("label: 'Knowledge Items'")
  expect(overview).toContain("label: 'Decisions'")
  expect(overview).toContain("label: 'Ideas'")
  expect(overview).toContain("label: 'Last Sync'")
  expect(overview).toContain('<BrainGrid')
  expect(overview).not.toContain('Recent Activity')
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
  expect(integrations).toContain('resetType="slack"')
  expect(integrations).toContain('resetType="linear"')
  expect(integrations).toContain('resetType="notion"')
})
