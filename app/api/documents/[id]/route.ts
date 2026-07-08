import { auth } from '@clerk/nextjs/server'
import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { requireWorkspaceMember } from '@/lib/api/workspace-auth'
import { readDocumentFile } from '@/lib/storage/documents'

export const runtime = 'nodejs'

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { userId } = await auth()
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const workspace = await requireWorkspaceMember(userId)
  if ('error' in workspace) return NextResponse.json({ error: workspace.error }, { status: workspace.status })

  const { id } = await params
  // Scoped to the caller's workspace — a foreign document id is indistinguishable from a missing one.
  const document = await prisma.documentAttachment.findFirst({
    where: { id, workspaceId: workspace.workspaceId },
    select: { fileName: true, mimeType: true, storageKey: true },
  })
  if (!document?.storageKey) {
    return NextResponse.json({ error: 'Document not found' }, { status: 404 })
  }

  const file = await readDocumentFile(document.storageKey)
  if (!file) {
    return NextResponse.json({ error: 'Document file is unavailable' }, { status: 404 })
  }

  return new Response(new Uint8Array(file), {
    headers: {
      'Content-Type': document.mimeType ?? 'application/octet-stream',
      'Content-Disposition': `inline; filename="${document.fileName.replace(/"/g, '')}"`,
      'Cache-Control': 'private, no-store',
    },
  })
}
