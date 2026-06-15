import { clsx } from 'clsx'

/** Exact Neuron brand asset from neuronn/2 (1).png. */
const NEURON_LOGO_SRC = '/neuron-logo.png'

/**
 * Neuron brand mark, rendered without cropping or reshaping the source asset.
 * `tone` is accepted for backwards compatibility but does not recolor it.
 */
export function NeuronMark({
  className,
  tone: _tone = 'white',
}: {
  className?: string
  tone?: 'white' | 'navy'
}) {
  return (
    <img
      src={NEURON_LOGO_SRC}
      alt="Neuron"
      className={clsx('object-contain', className)}
    />
  )
}

/** Rounded brand tile — the logo asset already includes its dark backdrop. */
export function NeuronBadge({ className }: { className?: string }) {
  return <NeuronMark className={clsx('shadow-soft', className)} />
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
