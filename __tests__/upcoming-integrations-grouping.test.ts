/** @jest-environment node */
import fs from 'node:fs'
import path from 'node:path'

it('keeps public Gmail in General while Teams remains Upcoming', () => {
  const page = fs.readFileSync(path.join(process.cwd(), 'app/(dashboard)/dashboard/integrations/page.tsx'), 'utf8')
  const general = page.slice(page.indexOf('<IntegrationSection title="General">'), page.indexOf('<IntegrationSection title="Truck">'))
  const truck = page.slice(page.indexOf('<IntegrationSection title="Truck">'), page.indexOf('<IntegrationSection title="Upcoming"'))
  const upcoming = page.slice(page.indexOf('<IntegrationSection title="Upcoming"'))

  expect(general).toContain('<GmailIntegrationCard')
  expect(general).toContain('upcomingIntegrationTestingEnabled ? <TeamsIntegrationCard')
  expect(general).toContain('<NotionIntegrationCard')
  expect(general).toContain('<TelegramIntegrationCard')
  expect(general).toContain('<JiraIntegrationCard')
  expect(truck).toContain('<TtEldIntegrationCard')
  expect(truck).toContain('<DatatruckIntegrationCard')
  expect(upcoming).toContain('!upcomingIntegrationTestingEnabled')
  expect(upcoming).not.toContain('name="Gmail"')
  expect(upcoming).toContain('name="Microsoft Teams"')
  expect(upcoming).toContain('These integrations are being prepared for public release')
})
