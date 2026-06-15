export { getAppUrl } from '@/lib/app-url'
import { getAppUrl } from '@/lib/app-url'

export function getLinearRedirectUri(): string {
  return `${getAppUrl()}/api/integrations/linear/callback`
}
