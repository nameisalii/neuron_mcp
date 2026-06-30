import { auth } from '@clerk/nextjs/server'
import { redirect } from 'next/navigation'

// Reads the signed-in user at request time; must not be prerendered at build.
export const dynamic = 'force-dynamic'

export default async function OnboardingLayout({ children }: { children: React.ReactNode }) {
  const { userId } = await auth()
  if (!userId) redirect('/sign-in')

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
      {children}
    </div>
  )
}
