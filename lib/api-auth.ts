import { timingSafeEqual } from 'crypto'

export function validateApiKey(req: Request): string | null {
  // VALIDATION BLOCKER: this env-backed key/workspace pair is intentionally
  // single-tenant. See docs/validation-first-plan.md before expanding MCP use.
  const apiKey = process.env.NEURON_API_KEY
  const workspaceId = process.env.NEURON_WORKSPACE_ID
  if (!apiKey || !workspaceId) return null

  const header = req.headers.get('authorization') ?? ''
  if (!header.startsWith('Bearer ')) return null

  const provided = header.slice('Bearer '.length)

  // timingSafeEqual requires equal-length buffers
  const a = Buffer.from(provided.padEnd(apiKey.length, '\0'))
  const b = Buffer.from(apiKey.padEnd(provided.length, '\0'))
  const paddedA = a.length < b.length ? Buffer.concat([a, Buffer.alloc(b.length - a.length)]) : a
  const paddedB = b.length < a.length ? Buffer.concat([b, Buffer.alloc(a.length - b.length)]) : b

  const match = timingSafeEqual(paddedA, paddedB) && provided.length === apiKey.length
  return match ? workspaceId : null
}
