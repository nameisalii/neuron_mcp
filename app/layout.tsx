import type { Metadata } from 'next'
import { ClerkProvider } from '@clerk/nextjs'
import './globals.css'

export const metadata: Metadata = {
  title: 'Neuron — Your Company Brain',
  description: 'Capture, organize, and query your company knowledge from Slack.',
}

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
