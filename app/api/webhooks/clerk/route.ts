import { headers } from 'next/headers'
import type { WebhookEvent } from '@clerk/nextjs/server'
import { Webhook } from 'svix'
import { prisma } from '@/lib/db'

export async function POST(req: Request) {
  const WEBHOOK_SECRET = process.env.CLERK_WEBHOOK_SECRET
  if (!WEBHOOK_SECRET) throw new Error('Missing CLERK_WEBHOOK_SECRET')

  const headerPayload = await headers()
  const svix_id = headerPayload.get('svix-id')
  const svix_timestamp = headerPayload.get('svix-timestamp')
  const svix_signature = headerPayload.get('svix-signature')

  if (!svix_id || !svix_timestamp || !svix_signature) {
    return new Response('Missing svix headers', { status: 400 })
  }

  const body = await req.text()
  const wh = new Webhook(WEBHOOK_SECRET)
  let evt: WebhookEvent

  try {
    evt = wh.verify(body, {
      'svix-id': svix_id,
      'svix-timestamp': svix_timestamp,
      'svix-signature': svix_signature,
    }) as WebhookEvent
  } catch {
    return new Response('Invalid webhook signature', { status: 400 })
  }

  if (evt.type === 'user.created') {
    const { id: clerkId, email_addresses, first_name, last_name, image_url } = evt.data
    const email = email_addresses[0]?.email_address
    const name = [first_name, last_name].filter(Boolean).join(' ') || null

    if (!email) return new Response('No email address', { status: 400 })

    // 1. Upsert user (idempotent for webhook retries)
    const user = await prisma.user.upsert({
      where: { clerkId },
      update: {},
      create: { clerkId, email, name },
    })

    // 2. Upsert solo workspace owned by this user's DB id
    const workspace = await prisma.workspace.upsert({
      where: { ownerId: user.id },
      update: {},
      create: { ownerId: user.id, type: 'solo', plan: 'free' },
    })

    // 3. Seed owner membership so permission system works immediately
    await prisma.workspaceMember.upsert({
      where: { workspaceId_userId: { workspaceId: workspace.id, userId: clerkId } },
      update: {},
      create: {
        workspaceId: workspace.id,
        userId: clerkId,
        role: 'owner',
        displayName: name ?? email,
        avatarUrl: image_url ?? null,
        status: 'active',
      },
    })
  }

  return new Response('OK', { status: 200 })
}
