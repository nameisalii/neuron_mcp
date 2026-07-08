import { auth } from '@clerk/nextjs/server'
import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { requireWorkspaceMember } from '@/lib/api/workspace-auth'
import { extractDocumentText } from '@/lib/documents/extractText'
import { parseDocumentAssignment } from '@/lib/documents/assignmentParser'
import { deleteDocumentFile, sanitizeFileName, saveUploadedDocument } from '@/lib/storage/documents'

export const runtime = 'nodejs'

const MAX_FILE_SIZE_BYTES = 10 * 1024 * 1024 // 10 MB
const ALLOWED_EXTENSIONS = new Set(['pdf', 'txt', 'md', 'markdown', 'csv', 'log', 'docx', 'png', 'jpg', 'jpeg', 'gif', 'webp', 'heic'])
const ALLOWED_DOCUMENT_TYPES = new Set(['BOL', 'POD', 'RATE_CONFIRMATION', 'INVOICE', 'LUMPER_RECEIPT', 'OTHER'])
const TEXT_PREVIEW_CHARS = 300

function fileExtension(fileName: string): string {
  return fileName.split('.').pop()?.toLowerCase() ?? ''
}

function optionalField(value: FormDataEntryValue | null): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null
}

export async function POST(req: Request) {
  try {
    const { userId } = await auth()
    if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const workspace = await requireWorkspaceMember(userId)
    if ('error' in workspace) return NextResponse.json({ error: workspace.error }, { status: workspace.status })

    let form: FormData
    try {
      form = await req.formData()
    } catch {
      return NextResponse.json({ error: 'Invalid upload request' }, { status: 400 })
    }

    const file = form.get('file')
    if (!(file instanceof File) || file.size === 0) {
      return NextResponse.json({ error: 'Choose a file to upload.' }, { status: 400 })
    }
    if (file.size > MAX_FILE_SIZE_BYTES) {
      return NextResponse.json({ error: 'File is too large. The limit is 10 MB.' }, { status: 400 })
    }
    const extension = fileExtension(file.name)
    if (!ALLOWED_EXTENSIONS.has(extension)) {
      return NextResponse.json(
        { error: 'Unsupported file type. Upload a PDF, text, Markdown, CSV, DOCX, or image file.' },
        { status: 400 },
      )
    }

    const message = optionalField(form.get('message')) ?? ''
    const assignment = parseDocumentAssignment(message)
    const requestedType = optionalField(form.get('documentType'))?.toUpperCase() ?? null
    const documentType = requestedType && ALLOWED_DOCUMENT_TYPES.has(requestedType) ? requestedType : assignment.documentType
    const externalLoadId = optionalField(form.get('externalLoadId')) ?? assignment.externalLoadId
    const sourceContext = optionalField(form.get('sourceContext'))?.toLowerCase() ?? null
    const assignToDatatruck = sourceContext === 'datatruck' || assignment.assignToDatatruck
    const source = assignToDatatruck ? 'datatruck' : 'manual_upload'

    const buffer = Buffer.from(await file.arrayBuffer())
    const extraction = await extractDocumentText({ buffer, fileName: file.name, mimeType: file.type || null })

    const safeName = sanitizeFileName(file.name)
    const document = await prisma.documentAttachment.create({
      data: {
        workspaceId: workspace.workspaceId,
        fileName: safeName,
        mimeType: file.type || null,
        fileSize: file.size,
        source,
        documentType,
        externalLoadId,
        extractedText: extraction.text,
        extractionStatus: extraction.status,
        uploadedByUserId: userId,
        uploadedByName: workspace.member.displayName,
      },
      select: { id: true, createdAt: true },
    })

    try {
      const { storageKey } = await saveUploadedDocument({
        workspaceId: workspace.workspaceId,
        documentId: document.id,
        fileName: safeName,
        buffer,
      })
      await prisma.documentAttachment.update({
        where: { id: document.id },
        data: { storageKey, storageUrl: `/api/documents/${document.id}` },
      })
    } catch (err) {
      // Roll back the row so we never keep metadata for a file that was not stored.
      await prisma.documentAttachment.delete({ where: { id: document.id } }).catch(() => null)
      await deleteDocumentFile(`${workspace.workspaceId}/${document.id}/${safeName}`).catch(() => null)
      console.error('[documents/upload] storage failed', err instanceof Error ? err.message : 'unknown error')
      return NextResponse.json({ error: 'Could not store the file. Try again.' }, { status: 500 })
    }

    return NextResponse.json({
      success: true,
      document: {
        id: document.id,
        fileName: safeName,
        mimeType: file.type || null,
        fileSize: file.size,
        documentType,
        externalLoadId,
        source,
        extractionStatus: extraction.status,
        textPreview: extraction.text ? extraction.text.slice(0, TEXT_PREVIEW_CHARS) : null,
        createdAt: document.createdAt.toISOString(),
      },
    })
  } catch (err) {
    console.error('[documents/upload]', err instanceof Error ? err.message : 'unknown error')
    return NextResponse.json({ error: 'Upload failed. Try again.' }, { status: 500 })
  }
}
