import { auth } from '@clerk/nextjs/server'
import { NextResponse } from 'next/server'
import { z } from 'zod'
import { prisma } from '@/lib/db'
import { encrypt } from '@/lib/crypto'
import { getPhoneNumber, WhatsAppApiError } from '@/lib/whatsapp/api'

const ALLOWED_ROLES = new Set(['owner', 'admin'])

const ConnectSchema = z.object({
  accessToken: z.string().trim().min(20),
  phoneNumberId: z.string().trim().min(6),
  businessAccountId: z.string().trim().min(6).optional(),
})

export async function POST(req: Request) {
  try {
    const { userId } = await auth()
    if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const user = await prisma.user.findUnique({
      where: { clerkId: userId },
      select: { workspace: { select: { id: true } } },
    })
    if (!user?.workspace) return NextResponse.json({ error: 'No workspace found' }, { status: 404 })
    const workspaceId = user.workspace.id

    const member = await prisma.workspaceMember.findUnique({
      where: { workspaceId_userId: { workspaceId, userId } },
      select: { role: true, status: true },
    })
    if (!member || !ALLOWED_ROLES.has(member.role) || member.status !== 'active') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    let body: unknown
    try {
      body = await req.json()
    } catch {
      return NextResponse.json({ error: 'Invalid request body' }, { status: 400 })
    }

    const parsed = ConnectSchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json({ error: 'Enter a valid access token and phone number ID' }, { status: 400 })
    }
    const { accessToken, phoneNumberId, businessAccountId } = parsed.data

    let phone
    try {
      phone = await getPhoneNumber(accessToken, phoneNumberId)
    } catch (err) {
      if (err instanceof WhatsAppApiError && (err.status === 401 || err.status === 403)) {
        return NextResponse.json({ error: 'Meta rejected this WhatsApp token or phone number ID.' }, { status: 422 })
      }
      console.error('[whatsapp/connect] phone number verification failed')
      return NextResponse.json({ error: 'Could not verify this WhatsApp Business phone number.' }, { status: 502 })
    }

    await prisma.integration.upsert({
      where: { workspaceId_type: { workspaceId, type: 'whatsapp' } },
      update: {
        accessToken: encrypt(accessToken),
        teamId: phoneNumberId,
        teamName: phone.display_phone_number ?? phone.verified_name ?? 'WhatsApp Business',
        metadata: {
          status: 'connected',
          connectedBy: userId,
          connectedAt: new Date().toISOString(),
          phoneNumberId,
          businessAccountId: businessAccountId ?? null,
          verifiedName: phone.verified_name ?? null,
          displayPhoneNumber: phone.display_phone_number ?? null,
        },
      },
      create: {
        workspaceId,
        type: 'whatsapp',
        accessToken: encrypt(accessToken),
        teamId: phoneNumberId,
        teamName: phone.display_phone_number ?? phone.verified_name ?? 'WhatsApp Business',
        channels: [],
        metadata: {
          status: 'connected',
          connectedBy: userId,
          connectedAt: new Date().toISOString(),
          phoneNumberId,
          businessAccountId: businessAccountId ?? null,
          verifiedName: phone.verified_name ?? null,
          displayPhoneNumber: phone.display_phone_number ?? null,
        },
      },
    })

    return NextResponse.json({ success: true })
  } catch (err) {
    console.error('[whatsapp/connect]', err instanceof Error ? err.message : 'unknown error')
    return NextResponse.json({ error: 'Failed to save WhatsApp Business connection' }, { status: 500 })
  }
}
