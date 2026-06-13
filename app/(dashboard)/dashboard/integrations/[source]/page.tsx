import { auth } from '@clerk/nextjs/server'
import { notFound, redirect } from 'next/navigation'
import { prisma } from '@/lib/db'
import IntegrationOverviewView from '../IntegrationOverviewView'
import { loadIntegrationOverview, parseIntegrationFilter, type IntegrationSource } from '@/lib/integrations/overview'

const ALLOWED_SOURCES = new Set<IntegrationSource>(['slack', 'notion', 'linear', 'gmail'])

export default async function IntegrationSourcePage({
  params,
  searchParams,
}: {
  params: Promise<{ source: string }>
  searchParams: Promise<{ filter?: string }>
}) {
  const { userId } = await auth()
  if (!userId) redirect('/sign-in')

  const { source } = await params
  if (!ALLOWED_SOURCES.has(source as IntegrationSource)) notFound()

  const user = await prisma.user.findUnique({
    where: { clerkId: userId },
    select: { workspace: { select: { id: true } } },
  })
  if (!user?.workspace) redirect('/onboarding')

  const filter = parseIntegrationFilter((await searchParams).filter)
  const data = await loadIntegrationOverview(user.workspace.id, userId, source as IntegrationSource, filter)

  return <IntegrationOverviewView data={data} />
}
