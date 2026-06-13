import type { Metadata } from 'next'
import { ClerkProvider } from '@clerk/nextjs'
import { Inter, Fraunces } from 'next/font/google'
import './globals.css'

const inter = Inter({
  subsets: ['latin'],
  variable: '--font-inter',
  display: 'swap',
})

const fraunces = Fraunces({
  subsets: ['latin'],
  variable: '--font-fraunces',
  display: 'swap',
  axes: ['opsz'],
})

export const metadata: Metadata = {
  title: 'Neuron — Your Company Brain',
  description: 'Capture, organize, and query your company knowledge from Slack.',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <ClerkProvider>
      <html lang="en" className={`${inter.variable} ${fraunces.variable}`}>
        <body>{children}</body>
      </html>
    </ClerkProvider>
  )
}
