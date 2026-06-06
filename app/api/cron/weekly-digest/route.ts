import { timingSafeEqual } from 'crypto'
import { NextRequest, NextResponse } from 'next/server'
import { Resend } from 'resend'
import { prisma } from '@/lib/db'
import { generateWeeklyDigest, type DigestPrefs } from '@/lib/digest/generate'
import { renderDigestEmail } from '@/lib/digest/email'

const resend = new Resend(process.env.RESEND_API_KEY)

function validateCronSecret(incoming: string): boolean {
  const expected = process.env.CRON_SECRET
  if (!expected) return false
  try {
    const a = Buffer.from(incoming)
    const b = Buffer.from(expected)
    if (a.length !== b.length) return false
    return timingSafeEqual(a, b)
  } catch { return false }
}

export async function GET(req: NextRequest) {
  try {
    const secret = req.headers.get('x-cron-secret') ?? ''
    if (!validateCronSecret(secret)) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const members = await prisma.workspaceMember.findMany({
      where: { status: 'active' },
      select: { workspaceId: true, userId: true, displayName: true },
    })

    let processed = 0

    for (const member of members) {
      try {
        const pref = await prisma.userPreference.findUnique({
          where: { workspaceId_userId: { workspaceId: member.workspaceId, userId: member.userId } },
        })

        const prefs: DigestPrefs = {
          focusAreas: (pref?.focusAreas as string[]) ?? [],
          staleThresholdDays: pref?.staleThresholdDays ?? 30,
          digestEnabled: pref?.digestEnabled ?? true,
          emailDigest: pref?.emailDigest ?? false,
        }

        if (!prefs.digestEnabled) continue

        const content = await generateWeeklyDigest(member.workspaceId, member.userId, prefs)

        await prisma.digest.create({
          data: {
            workspaceId: member.workspaceId,
            userId: member.userId,
            date: new Date(),
            content: content as never,
            type: 'weekly',
            deliveredAt: new Date(),
          },
        })

        if (prefs.emailDigest) {
          const user = await prisma.user.findFirst({ where: { workspace: { id: member.workspaceId } }, select: { email: true } })
          if (user?.email) {
            await resend.emails.send({
              from: 'Neuron <hello@neuron.app>',
              to: user.email,
              subject: 'Your weekly Neuron digest',
              html: renderDigestEmail(content, member.displayName, 'weekly'),
            })
          }
        }

        processed++
      } catch (err) {
        console.error(`[cron/weekly-digest] member ${member.userId} failed:`, err)
      }
    }

    return NextResponse.json({ processed, total: members.length })
  } catch (err) {
    console.error('[cron/weekly-digest]', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
