import { clsx } from 'clsx'

export type BrandKey = 'slack' | 'notion' | 'linear' | 'gmail' | 'discord'

// simpleicons CDN renders clean single-color brand SVGs. Brand hex keeps each
// connector recognizable; pass tone="navy" for a tasteful monochrome treatment.
const BRAND_HEX: Record<BrandKey, string> = {
  slack: '4A154B',
  notion: '000000',
  linear: '5E6AD2',
  gmail: 'EA4335',
  discord: '5865F2',
}

const BRAND_LABEL: Record<BrandKey, string> = {
  slack: 'Slack',
  notion: 'Notion',
  linear: 'Linear',
  gmail: 'Gmail',
  discord: 'Discord',
}

// Brands with a bundled, full-color asset are served locally so they match the
// product everywhere they appear, rather than the monochrome simpleicons CDN.
const LOCAL_BRAND_ASSET: Partial<Record<BrandKey, string>> = {
  gmail: '/icons/gmail.png',
  slack: '/icons/slack.png',
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

/** Brand logo inside a soft warm tile — used as the connector card avatar. */
export function BrandTile({ brand, className }: { brand: BrandKey; className?: string }) {
  return (
    <div
      className={clsx(
        'flex items-center justify-center rounded-xl bg-cream border border-warm shrink-0',
        className,
      )}
    >
      <BrandLogo brand={brand} className="w-1/2 h-1/2" />
    </div>
  )
}
