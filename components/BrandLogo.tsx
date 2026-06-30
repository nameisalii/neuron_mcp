import { clsx } from 'clsx'

export type BrandKey = 'slack' | 'notion' | 'linear' | 'gmail' | 'discord' | 'granola' | 'telegram' | 'teams' | 'jira' | 'whatsapp'

// simpleicons CDN is only a fallback for brands without a bundled asset.
const BRAND_HEX: Record<BrandKey, string> = {
  slack: '4A154B',
  notion: '000000',
  linear: '5E6AD2',
  gmail: 'EA4335',
  discord: '5865F2',
  granola: '1C1A17',
  telegram: '26A5E4',
  teams: '6264A7',
  jira: '0052CC',
  whatsapp: '25D366',
}

const BRAND_LABEL: Record<BrandKey, string> = {
  slack: 'Slack',
  notion: 'Notion',
  linear: 'Linear',
  gmail: 'Gmail',
  discord: 'Discord',
  granola: 'Granola',
  telegram: 'Telegram',
  teams: 'Microsoft Teams',
  jira: 'Jira',
  whatsapp: 'WhatsApp Business',
}

// Brands with a bundled, full-color asset are served locally so they match the
// product everywhere they appear, rather than the monochrome simpleicons CDN.
const LOCAL_BRAND_ASSET: Partial<Record<BrandKey, string>> = {
  gmail: '/icons/gmail.png',
  slack: '/icons/slack.png',
  notion: '/icons/notion.svg',
  linear: '/icons/linear.svg',
  discord: '/icons/discord.png',
  granola: '/icons/granola.png',
  telegram: '/icons/telegram.png',
  teams: '/icons/teams.png',
  jira: '/icons/jira.png',
  whatsapp: '/icons/whatsapp.svg',
}

interface BrandLogoProps {
  brand: BrandKey
  className?: string
  tone?: 'color' | 'navy'
}

export default function BrandLogo({ brand, className, tone = 'color' }: BrandLogoProps) {
  const localAsset = LOCAL_BRAND_ASSET[brand]
  const src = localAsset ?? `https://cdn.simpleicons.org/${brand}/${tone === 'navy' ? '1A2540' : BRAND_HEX[brand]}`
  return (
    <img
      src={src}
      alt={`${BRAND_LABEL[brand]} logo`}
      className={clsx('object-contain', className)}
      loading="lazy"
    />
  )
}

/** Brand logo inside a white tile — used as the connector card avatar. */
export function BrandTile({ brand, className }: { brand: BrandKey; className?: string }) {
  return (
    <div
      className={clsx(
        'flex items-center justify-center rounded-xl bg-white border border-warm shadow-sm shrink-0',
        className,
      )}
    >
      <BrandLogo brand={brand} className="h-[72%] w-[72%]" />
    </div>
  )
}
