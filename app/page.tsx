import { auth } from '@clerk/nextjs/server'
import { redirect } from 'next/navigation'
import NeuronHero from '@/components/landing/NeuronHero'

export default async function RootPage() {
  const { userId } = await auth()
  if (userId) redirect('/dashboard')

  return <NeuronHero />
}
