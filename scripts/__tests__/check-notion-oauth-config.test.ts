/** @jest-environment node */
import { execFileSync } from 'node:child_process'
import path from 'node:path'

it('reports Notion OAuth configuration without printing secret values', () => {
  const secret = 'must-never-appear-in-diagnostics'
  const output = execFileSync(
    process.execPath,
    [path.join(process.cwd(), 'scripts/check-notion-oauth-config.mjs')],
    {
      encoding: 'utf8',
      env: {
        ...process.env,
        NEXT_PUBLIC_APP_URL: 'http://localhost:3000',
        NOTION_CLIENT_ID: 'client-id-for-test',
        NOTION_CLIENT_SECRET: secret,
        NOTION_REDIRECT_URI: 'http://localhost:3000/api/integrations/notion/callback',
      },
    },
  )

  expect(output).toContain('NOTION_CLIENT_SECRET present true')
  expect(output).toContain('computed redirect URI http://localhost:3000/api/integrations/notion/callback')
  expect(output).not.toContain(secret)
  expect(output).not.toContain('client-id-for-test')
})
