import { auth } from '@clerk/nextjs/server'
import { redirect } from 'next/navigation'

// Reads the signed-in user at request time; must not be prerendered at build.
export const dynamic = 'force-dynamic'

export default async function RootPage() {
  const { userId } = await auth()
  redirect(userId ? '/dashboard' : '/sign-up')
}
