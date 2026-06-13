import { auth } from '@clerk/nextjs/server'
import { redirect } from 'next/navigation'
import { prisma } from '@/lib/db'
import { generateWeek1Report } from '@/lib/email/week1-report'
import EmailDigestPreview from './EmailDigestPreview'

export default async function EmailPreviewPage() {
  // TODO: restore NODE_ENV guard before deployment
  const { userId } = await auth()
  if (!userId) redirect('/sign-in')

  const user = await prisma.user.findUnique({
    where: { clerkId: userId },
    select: { workspace: { select: { id: true } } },
  })

  if (!user?.workspace) {
    return (
      <div className="max-w-3xl mx-auto py-8">
        <p className="text-gray-500">No workspace found.</p>
      </div>
    )
  }

  const data = await generateWeek1Report(user.workspace.id)

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Email Preview</h1>
        <p className="text-xs text-amber-600 mt-1 font-medium">Development only</p>
      </div>

      <EmailDigestPreview data={data} />
    </div>
  )
}
