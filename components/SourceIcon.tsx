import Image from 'next/image'
import clsx from 'clsx'

interface SourceIconProps {
  source: string
  className?: string
  size?: number
}

// Sources backed by a bundled icon asset, with display label and file path.
const SOURCE_ASSET: Record<string, { alt: string; src: string }> = {
  linear: { alt: 'Linear', src: '/icons/linear.svg' },
  notion: { alt: 'Notion', src: '/icons/notion.svg' },
  gmail: { alt: 'Gmail', src: '/icons/gmail.png' },
  slack: { alt: 'Slack', src: '/icons/slack.png' },
}

export default function SourceIcon({ source, className, size = 20 }: SourceIconProps) {
  const normalized = source.toLowerCase()
  const asset = SOURCE_ASSET[normalized]

  if (asset) {
    return (
      <Image
        src={asset.src}
        alt={asset.alt}
        width={size}
        height={size}
        className={clsx('shrink-0 object-contain', className)}
      />
    )
  }

  return (
    <span
      className={clsx(
        'shrink-0 rounded text-white text-[10px] font-bold inline-flex items-center justify-center bg-gray-500',
        className,
      )}
      style={{ width: size, height: size }}
      aria-label={normalized}
    >
      {normalized.slice(0, 1).toUpperCase()}
    </span>
  )
}
