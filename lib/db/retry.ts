export interface PrismaRetryOptions {
  retries?: number
  delaysMs?: number[]
  onRetry?: (error: unknown, attempt: number) => void
}

const TRANSIENT_PRISMA_CODES = new Set(['P1001', 'P1002', 'P1008', 'P1017'])
const TRANSIENT_MESSAGES = [
  'server has closed the connection',
  'connection terminated',
  'connection closed',
  'kind: closed',
]

export function isTransientPrismaError(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false
  const candidate = error as { code?: unknown; message?: unknown }
  if (typeof candidate.code === 'string' && TRANSIENT_PRISMA_CODES.has(candidate.code)) return true
  const message = typeof candidate.message === 'string' ? candidate.message.toLowerCase() : ''
  return TRANSIENT_MESSAGES.some((fragment) => message.includes(fragment))
}

export async function withPrismaRetry<T>(
  operation: () => Promise<T>,
  options: PrismaRetryOptions = {},
): Promise<T> {
  const delays = options.delaysMs ?? [250, 750, 1500]
  const retries = Math.max(0, options.retries ?? delays.length)
  let attempt = 0
  while (true) {
    try {
      return await operation()
    } catch (error) {
      if (!isTransientPrismaError(error) || attempt >= retries) throw error
      attempt++
      options.onRetry?.(error, attempt)
      await new Promise((resolve) => setTimeout(resolve, delays[Math.min(attempt - 1, delays.length - 1)] ?? 250))
    }
  }
}
