import { auth } from '@clerk/nextjs/server'
import { NextResponse } from 'next/server'
import { z } from 'zod'
import { randomBytes } from 'crypto'
import { prisma } from '@/lib/db'
import { Resend } from 'resend'
import { getWorkspaceForUser } from '@/lib/workspace'
import { assertRole, canInvite } from '@/lib/team'
import { getAppUrl } from '@/lib/app-url'

const InviteSchema = z.object({
  emails: z.string().min(1),
  role: z.enum(['admin', 'member', 'viewer']).default('member'),
})

const resend = new Resend(process.env.RESEND_API_KEY)

export async function POST(req: Request) {
  const { userId } = await auth()
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const workspace = await getWorkspaceForUser(userId)
  if (!workspace) return NextResponse.json({ error: 'No workspace' }, { status: 404 })

  try {
    await assertRole(workspace.id, userId, canInvite)
  } catch {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const body = await req.json()
  const parsed = InviteSchema.safeParse(body)
  if (!parsed.success) return NextResponse.json({ error: 'Invalid input' }, { status: 400 })

  const emails = parsed.data.emails
    .split(',')
    .map((e) => e.trim().toLowerCase())
    .filter((e) => e.length > 0)

  const SEVEN_DAYS = 7 * 24 * 60 * 60 * 1000
  const inviter = await prisma.workspaceMember.findUnique({
    where: { workspaceId_userId: { workspaceId: workspace.id, userId } },
    select: { displayName: true },
  })

  const created = await Promise.all(
    emails.map(async (email) => {
      const token = randomBytes(32).toString('hex')
      const invite = await prisma.invitation.create({
        data: {
          workspaceId: workspace.id,
          email,
          role: parsed.data.role,
          invitedBy: userId,
          token,
          expiresAt: new Date(Date.now() + SEVEN_DAYS),
        },
      })

      const inviteUrl = `${getAppUrl()}/onboarding/invite/${token}`
      await resend.emails.send({
        from: 'Neuron <noreply@neuron.app>',
        to: email,
        subject: `${inviter?.displayName ?? 'Someone'} invited you to Neuron`,
        html: `<p>You've been invited to join <strong>${workspace.name ?? 'a Neuron workspace'}</strong> as <strong>${parsed.data.role}</strong>.</p>
<p><a href="${inviteUrl}">Accept invitation</a></p>
<p>This link expires in 7 days.</p>`,
      })

      return invite
    }),
  )

  return NextResponse.json({ invited: created.length })
}

export async function GET() {
  const { userId } = await auth()
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const workspace = await getWorkspaceForUser(userId)
  if (!workspace) return NextResponse.json({ error: 'No workspace' }, { status: 404 })

  const invitations = await prisma.invitation.findMany({
    where: { workspaceId: workspace.id, status: 'pending' },
    orderBy: { createdAt: 'desc' },
  })

  return NextResponse.json({ invitations })
}
