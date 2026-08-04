/** @jest-environment node */
import fs from 'fs'
import path from 'path'

const read = (file: string) => fs.readFileSync(path.join(process.cwd(), file), 'utf8')

it('offers scoped reset controls for Slack, Linear, and Notion', () => {
  const integrations = read('app/(dashboard)/dashboard/integrations/page.tsx')
  const slackCard = read('app/(dashboard)/dashboard/integrations/SlackIntegrationCard.tsx')
  const notionCard = read('app/(dashboard)/dashboard/integrations/NotionIntegrationCard.tsx')
  expect(slackCard).toContain('resetType="slack"')
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
