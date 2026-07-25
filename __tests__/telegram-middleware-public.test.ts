import fs from 'node:fs'
import path from 'node:path'

describe('Telegram webhook middleware access', () => {
  it('lists the Telegram webhook before protected integration authentication', () => {
    const source = fs.readFileSync(path.join(process.cwd(), 'middleware.ts'), 'utf8')
    expect(source).toContain("'/api/integrations/telegram/webhook'")
    expect(source.indexOf('if (isPublicIntegrationRoute(req))'))
      .toBeLessThan(source.indexOf('if (isProtectedRoute(req))'))
  })
})
