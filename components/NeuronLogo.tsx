import { clsx } from 'clsx'

/**
 * Connected-nodes "neuron" mark, drawn inline as SVG for crispness at any size.
 * `tone` controls stroke/fill color so it works on light (navy) and dark (white) surfaces.
 */
export function NeuronMark({ className, tone = 'white' }: { className?: string; tone?: 'white' | 'navy' }) {
  const stroke = tone === 'white' ? '#FFFFFF' : '#1A2540'
  return (
    <svg viewBox="0 0 32 32" fill="none" className={className} aria-hidden="true">
      <g stroke={stroke} strokeWidth="1.6" strokeLinecap="round">
        <line x1="9" y1="10" x2="16" y2="6" opacity="0.85" />
        <line x1="9" y1="10" x2="11" y2="20" opacity="0.85" />
        <line x1="16" y1="6" x2="23" y2="11" opacity="0.85" />
        <line x1="11" y1="20" x2="20" y2="24" opacity="0.85" />
        <line x1="23" y1="11" x2="20" y2="24" opacity="0.85" />
        <line x1="16" y1="6" x2="11" y2="20" opacity="0.5" />
        <line x1="23" y1="11" x2="11" y2="20" opacity="0.5" />
      </g>
      <g fill={stroke}>
        <circle cx="9" cy="10" r="2.4" />
        <circle cx="16" cy="6" r="2.1" />
        <circle cx="23" cy="11" r="2.4" />
        <circle cx="11" cy="20" r="2.1" />
        <circle cx="20" cy="24" r="2.6" />
      </g>
    </svg>
  )
}

/** Navy rounded badge holding the white mark — reads on warm/light backgrounds. */
export function NeuronBadge({ className }: { className?: string }) {
  return (
    <div
      className={clsx(
        'flex items-center justify-center rounded-[10px] bg-navy shadow-soft',
        className,
      )}
    >
      <NeuronMark className="w-[60%] h-[60%]" tone="white" />
    </div>
  )
}

interface NeuronLogoProps {
  className?: string
  /** 'badge' for light surfaces (navy badge + mark), 'bare' for dark surfaces (plain white mark) */
  variant?: 'badge' | 'bare'
  showWord?: boolean
  size?: 'sm' | 'md' | 'lg'
}

const sizeMap = {
  sm: { box: 'w-8 h-8', word: 'text-lg' },
  md: { box: 'w-9 h-9', word: 'text-xl' },
  lg: { box: 'w-12 h-12', word: 'text-2xl' },
}

export default function NeuronLogo({
  className,
  variant = 'badge',
  showWord = true,
  size = 'md',
}: NeuronLogoProps) {
  const s = sizeMap[size]
  return (
    <div className={clsx('flex items-center gap-2.5', className)}>
      {variant === 'badge' ? (
        <NeuronBadge className={s.box} />
      ) : (
        <NeuronMark className={s.box} tone="white" />
      )}
      {showWord && (
        <span
          className={clsx(
            'font-display font-medium tracking-tight',
            s.word,
            variant === 'badge' ? 'text-navy' : 'text-white',
          )}
        >
          Neuron
        </span>
      )}
    </div>
  )
}
