import { auth } from '@clerk/nextjs/server'
import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { requireWorkspaceMember } from '@/lib/api/workspace-auth'

export async function POST() {
  const { userId } = await auth()
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const workspace = await requireWorkspaceMember(userId)
  if ('error' in workspace) return NextResponse.json({ error: workspace.error }, { status: workspace.status })

  const [connector, knowledge, documents] = await prisma.$transaction([
    prisma.apiConnector.deleteMany({ where: { workspaceId: workspace.workspaceId, sourceKey: 'datatruck' } }),
    prisma.knowledgeItem.deleteMany({ where: { workspaceId: workspace.workspaceId, source: 'datatruck' } }),
    prisma.documentAttachment.deleteMany({ where: { workspaceId: workspace.workspaceId, source: 'datatruck' } }),
  ])

  return NextResponse.json({
    success: true,
    deleted: connector.count + knowledge.count + documents.count,
    connectorDeleted: connector.count,
    knowledgeDeleted: knowledge.count,
    documentsDeleted: documents.count,
  })
}
