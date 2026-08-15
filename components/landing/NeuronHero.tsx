'use client'

import Link from 'next/link'
import { useEffect, useRef } from 'react'

const integrations = [
  { label: 'Gmail', mark: 'M', angle: -1.35 },
  { label: 'Slack', mark: '✣', angle: 1.42 },
  { label: 'Telegram', mark: '➤', angle: -2.35 },
  { label: 'Notion', mark: 'N', angle: 0.2 },
]

function KnowledgeSphere() {
  const canvasRef = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const context = canvas.getContext('2d')
    if (!context) return

    const points = Array.from({ length: 950 }, (_, index) => {
      const y = 1 - (index / 949) * 2
      const radius = Math.sqrt(1 - y * y)
      const theta = Math.PI * (1 + Math.sqrt(5)) * index
      return { x: Math.cos(theta) * radius, y, z: Math.sin(theta) * radius }
    })
    let frame = 0

    const draw = () => {
      const bounds = canvas.getBoundingClientRect()
      const density = Math.min(window.devicePixelRatio || 1, 2)
      const width = Math.round(bounds.width * density)
      const height = Math.round(bounds.height * density)
      if (canvas.width !== width || canvas.height !== height) {
        canvas.width = width
        canvas.height = height
      }

      context.clearRect(0, 0, width, height)
      const time = performance.now() * 0.00013
      const cosine = Math.cos(time)
      const sine = Math.sin(time)
      const sphereRadius = Math.min(width, height) * 0.39
      const centerX = width / 2
      const centerY = height / 2

      for (const point of points) {
        const rotatedX = point.x * cosine - point.z * sine
        const rotatedZ = point.x * sine + point.z * cosine
        const depth = (rotatedZ + 1) / 2
        const dotRadius = (0.75 + depth * 1.15) * density
        context.beginPath()
        context.arc(
          centerX + rotatedX * sphereRadius,
          centerY + point.y * sphereRadius,
          dotRadius,
          0,
          Math.PI * 2,
        )
        context.fillStyle = `rgba(247, 239, 224, ${0.28 + depth * 0.68})`
        context.fill()
      }
      frame = requestAnimationFrame(draw)
    }

    draw()
    return () => cancelAnimationFrame(frame)
  }, [])

  return (
    <div className="relative mx-auto aspect-square w-full max-w-[520px]" aria-label="Neuron knowledge sphere">
      <canvas ref={canvasRef} className="h-full w-full" />
      {integrations.map((integration) => (
        <div
          key={integration.label}
          aria-label={integration.label}
          className="absolute grid h-11 w-11 place-items-center rounded-full bg-[#f7efe0] text-sm font-black text-black shadow-[0_8px_25px_rgba(0,0,0,0.35)]"
          style={{
            left: `${50 + Math.cos(integration.angle) * 45}%`,
            top: `${50 + Math.sin(integration.angle) * 45}%`,
            transform: 'translate(-50%, -50%)',
          }}
        >
          {integration.mark}
        </div>
      ))}
    </div>
  )
}

export default function NeuronHero() {
  return (
    <main className="min-h-screen bg-black text-[#f7efe0]">
      <header className="border-b border-white/10 bg-[#f8f6f1] text-black">
        <nav className="mx-auto flex h-[72px] max-w-[1440px] items-center justify-between px-6 sm:px-10 lg:px-16" aria-label="Main navigation">
          <Link href="/" className="flex items-center gap-2 text-[17px] font-bold">
            <span className="text-xl" aria-hidden="true">✳</span>
            Neuron
          </Link>
          <div className="hidden items-center gap-8 text-sm md:flex">
            <a href="#product">Product</a>
            <a href="#integrations">Integrations</a>
            <a href="#docs">Docs</a>
            <a href="#manifesto">Manifesto</a>
          </div>
          <Link href="/sign-up" className="rounded-full bg-black px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-black/80">
            Try Neuron Now
          </Link>
        </nav>
      </header>

      <section id="product" className="mx-auto grid min-h-[calc(100vh-72px)] max-w-[1440px] items-center gap-10 px-6 py-16 sm:px-10 lg:grid-cols-[minmax(0,1.1fr)_minmax(400px,0.9fr)] lg:gap-16 lg:px-16 lg:py-20">
        <div className="relative z-10 text-left">
          <h1 className="max-w-[11ch] text-balance text-[clamp(3.25rem,6vw,6.7rem)] font-semibold leading-[0.98] tracking-[-0.045em]">
            One brain.<br />For you, and your whole company.
          </h1>
          <p className="mt-8 max-w-[59ch] text-[17px] leading-8 text-[#f7efe0]/75 sm:text-lg">
            Neuron connects your team&apos;s conversations, tasks, decisions, and knowledge from tools like Slack, Gmail, Telegram, Notion, Linear, Discord, and more, so your company can search and remember what matters.
          </p>
          <Link href="/sign-up" className="mt-9 inline-flex items-center gap-3 rounded-full bg-[#f7efe0] px-6 py-3.5 text-sm font-bold text-black transition hover:scale-[1.02] hover:bg-white">
            Try Neuron Now <span aria-hidden="true" className="text-lg">→</span>
          </Link>
        </div>
        <KnowledgeSphere />
      </section>
    </main>
  )
}
