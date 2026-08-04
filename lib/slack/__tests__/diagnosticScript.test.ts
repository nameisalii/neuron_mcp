/** @jest-environment node */
import { execFileSync } from 'node:child_process'
import path from 'node:path'

it('prints Slack OAuth presence checks without printing secret values', () => {
  const secret = 'do-not-print-this-slack-client-secret'
  const output = execFileSync(
    process.execPath,
    [path.join(process.cwd(), 'scripts/check-slack-oauth-config.mjs')],
    {
      encoding: 'utf8',
      env: {
        ...process.env,
        SLACK_CLIENT_ID: 'client-id-value',
        SLACK_CLIENT_SECRET: secret,
        SLACK_REDIRECT_URI: 'http://localhost:3000/api/integrations/slack/callback',
        SLACK_ALLOWED_TEAM_ID: '',
      },
    },
  )

  expect(output).toContain('SLACK_CLIENT_ID present: true')
  expect(output).toContain('SLACK_CLIENT_SECRET present: true')
  expect(output).toContain('team parameter configured: false')
  expect(output).not.toContain(secret)
  expect(output).not.toContain('client-id-value')
})
