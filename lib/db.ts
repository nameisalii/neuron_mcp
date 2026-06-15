import { PrismaClient } from '@prisma/client'

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined
}

function getDatabaseUrl(): string | undefined {
  const value = process.env.DATABASE_URL
  if (!value) return undefined

  try {
    const url = new URL(value)
    if (!url.searchParams.has('connection_limit')) url.searchParams.set('connection_limit', '5')
    if (!url.searchParams.has('pool_timeout')) url.searchParams.set('pool_timeout', '20')
    return url.toString()
  } catch {
    return value
  }
}

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    datasourceUrl: getDatabaseUrl(),
    log: process.env.NODE_ENV === 'development' ? ['query', 'warn', 'error'] : ['error'],
  })

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = prisma
