import { POST as syncSlack } from '../sync/route'

export async function POST() {
  return syncSlack(new Request('http://localhost/api/integrations/slack/sync?mode=user', { method: 'POST' }))
}
