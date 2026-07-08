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

it('groups integrations into General, Truck, and Upcoming sections', () => {
  const integrations = read('app/(dashboard)/dashboard/integrations/page.tsx')
  expect(integrations).toContain('<IntegrationSection title="General">')
  expect(integrations).toContain('<IntegrationSection title="Truck">')
  expect(integrations).toContain('<IntegrationSection title="Upcoming">')
  const generalSection = integrations.slice(
    integrations.indexOf('<IntegrationSection title="General">'),
    integrations.indexOf('<IntegrationSection title="Truck">'),
  )
  const truckSection = integrations.slice(
    integrations.indexOf('<IntegrationSection title="Truck">'),
    integrations.indexOf('<IntegrationSection title="Upcoming">'),
  )
  expect(generalSection).not.toContain('<DatatruckIntegrationCard')
  expect(truckSection).toContain('<DatatruckIntegrationCard')
  expect(integrations.indexOf('<IntegrationSection title="Upcoming">')).toBeLessThan(integrations.indexOf('<WhatsAppIntegrationCard'))
})

it('keeps query submit payload compatible with /api/query', () => {
  const queryClient = read('app/(dashboard)/dashboard/query/QueryClient.tsx')
  expect(queryClient).toContain('question: q,')
  expect(queryClient).toContain('...(conversationId ? { conversationId } : {})')
  expect(queryClient).toContain('...(documentIds ? { documentIds } : {})')
  expect(queryClient).toContain('body: JSON.stringify(payload)')
})
