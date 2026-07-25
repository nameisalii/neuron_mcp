import type { Metadata } from 'next'
import { ClerkProvider } from '@clerk/nextjs'
import './globals.css'

export const metadata: Metadata = {
  title: 'Neuron — Your Company Brain',
  description: 'Capture, organize, and query your company knowledge from Slack.',
}

// The app is wrapped in ClerkProvider, which needs auth context at render time.
// Render everything per-request so no page (including /_not-found) is
// prerendered at build, which fails without Clerk keys available.
export const dynamic = 'force-dynamic'

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <ClerkProvider>
      <html
        lang="en"
        style={
          {
            '--font-inter': 'Inter, system-ui, -apple-system, sans-serif',
            '--font-fraunces': 'Georgia, Cambria, "Times New Roman", serif',
          } as React.CSSProperties
        }
      >
        <body>{children}</body>
      </html>
    </ClerkProvider>
  )
}
