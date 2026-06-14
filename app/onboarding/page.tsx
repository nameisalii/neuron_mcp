import { auth, currentUser } from '@clerk/nextjs/server'
import { redirect } from 'next/navigation'
import { provisionUser } from '@/lib/provision-user'
import OnboardingClient from './OnboardingClient'

export default async function OnboardingPage() {
  const { userId } = await auth()
  if (!userId) redirect('/sign-in')

  const clerkUser = await currentUser()
  const email = clerkUser?.emailAddresses[0]?.emailAddress
  if (!clerkUser || !email) redirect('/sign-in')

  const { user } = await provisionUser({
    clerkId: userId,
    email,
    name: [clerkUser.firstName, clerkUser.lastName].filter(Boolean).join(' ') || null,
    imageUrl: clerkUser.imageUrl,
  })

  if (user.onboardingCompleted) redirect('/dashboard/overview')

  return (
    <main className="flex min-h-screen items-center justify-center bg-gray-50 p-4">
      <OnboardingClient />
    </main>
  )
}
