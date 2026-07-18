'use client'

import { useState } from 'react'
import Image from 'next/image'
import { Truck } from 'lucide-react'
import clsx from 'clsx'

type TruckProvider = 'datatruck' | 'five_eld'

const LOGOS: Record<TruckProvider, { src: string; alt: string }> = {
  datatruck: { src: '/integrations/datalogo.png', alt: 'Datatruck logo' },
  five_eld: { src: '/integrations/tt_eld.png', alt: 'Five ELD logo' },
}

export default function TruckIntegrationLogo({ provider, size = 32, className }: { provider: TruckProvider; size?: number; className?: string }) {
  const [failed, setFailed] = useState(false)
  const logo = LOGOS[provider]

  return (
    <span className={clsx('inline-flex shrink-0 items-center justify-center overflow-hidden rounded-xl border border-warm bg-white shadow-sm', className)} style={{ width: size + 16, height: size + 16 }}>
      {failed ? <Truck size={size * 0.75} className="text-navy" aria-label={logo.alt} /> : (
        <Image
          src={logo.src}
          alt={logo.alt}
          width={size}
          height={size}
          className={clsx('h-full w-full object-contain', provider === 'datatruck' ? 'scale-[1.65]' : 'scale-125')}
          onError={() => setFailed(true)}
        />
      )}
    </span>
  )
}
