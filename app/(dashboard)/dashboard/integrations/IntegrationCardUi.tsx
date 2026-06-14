import { CheckCircle, ExternalLink } from 'lucide-react'
import Link from 'next/link'

export const integrationActionClass =
  'inline-flex h-9 items-center justify-center gap-1.5 rounded-[10px] border border-warm px-3 text-sm font-medium text-ink transition-colors hover:bg-cream disabled:cursor-not-allowed disabled:opacity-50'

export const integrationConnectClass =
  'inline-flex h-9 items-center justify-center gap-1.5 rounded-[10px] bg-navy px-4 text-sm font-medium text-white shadow-soft transition-all hover:-translate-y-0.5 hover:bg-navy-deep hover:shadow-lift disabled:cursor-not-allowed disabled:opacity-50'

export const integrationResetClass =
  'inline-flex h-9 items-center justify-center gap-1.5 rounded-[10px] border border-red-200 px-3 text-sm font-medium text-red-600 transition-colors hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-50'

export function IntegrationViewLink({ href }: { href: string }) {
  return (
    <Link href={href} className={integrationActionClass}>
      <ExternalLink className="h-3.5 w-3.5" />
      View
    </Link>
  )
}

export function ConnectedBadge() {
  return (
    <span className="inline-flex h-9 items-center gap-1.5 rounded-full bg-[#E6F2EC] px-3 text-xs font-medium text-positive">
      <CheckCircle className="h-3.5 w-3.5" />
      Connected
    </span>
  )
}
