import { auth } from '@clerk/nextjs/server'
import { NextResponse } from 'next/server'
import { z } from 'zod'
import { requireWorkspaceMember } from '@/lib/api/workspace-auth'
import { trackEvent } from '@/lib/activity'
import { KNOWLEDGE_CATEGORY_OPTIONS } from '@/lib/knowledge/categories'
import { DATATRUCK_ENDPOINT_LABELS } from '@/lib/datatruck/client'
import { createManualKnowledgeItemWithOptionalDocument, type ManualKnowledgeFile } from '@/lib/knowledge/manual'

export const runtime = 'nodejs'

const ALLOWED_SOURCES = new Set(['slack', 'notion', 'linear', 'gmail', 'granola', 'discord', 'telegram', 'teams', 'jira', 'whatsapp', 'datatruck', 'five_eld'])
const ALLOWED_CATEGORIES = new Set<string>(KNOWLEDGE_CATEGORY_OPTIONS.map((option) => option.value))
const ALLOWED_DOCUMENT_TYPES = new Set(['BOL', 'POD', 'RATE_CONFIRMATION', 'INVOICE', 'LUMPER_RECEIPT', 'OTHER'])
const ALLOWED_FILE_EXTENSIONS = new Set(['pdf', 'txt', 'md', 'markdown', 'csv', 'xlsx', 'log', 'docx', 'png', 'jpg', 'jpeg', 'gif', 'webp', 'heic'])
const MAX_FILE_SIZE_BYTES = 10 * 1024 * 1024 // 10 MB

const FieldsSchema = z.object({
  title: z.string().trim().min(1, 'Title is required').max(200),
  description: z.string().trim().min(1, 'Description is required').max(5000),
  category: z.string().trim().toLowerCase().default('fact'),
  externalLoadId: z.string().trim().max(60).optional().nullable(),
  documentType: z.string().trim().toUpperCase().optional().nullable(),
  moduleKey: z.string().trim().max(60).optional().nullable(),
})

interface ParsedBody {
  fields: z.infer<typeof FieldsSchema>
  file: ManualKnowledgeFile | null
}

async function parseBody(req: Request): Promise<ParsedBody | { error: string }> {
  const contentType = req.headers.get('content-type') ?? ''

  if (contentType.includes('multipart/form-data')) {
    let form: FormData
    try {
      form = await req.formData()
    } catch {
      return { error: 'Invalid request body' }
    }
    const raw = {
      title: String(form.get('title') ?? ''),
      description: String(form.get('description') ?? ''),
      category: String(form.get('category') ?? 'fact'),
      externalLoadId: form.get('externalLoadId') ? String(form.get('externalLoadId')) : null,
      documentType: form.get('documentType') ? String(form.get('documentType')) : null,
      moduleKey: form.get('moduleKey') ? String(form.get('moduleKey')) : null,
    }
    const parsed = FieldsSchema.safeParse(raw)
    if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? 'Invalid fields' }

    const fileEntry = form.get('file')
    let file: ManualKnowledgeFile | null = null
    if (fileEntry instanceof File && fileEntry.size > 0) {
      if (fileEntry.size > MAX_FILE_SIZE_BYTES) return { error: 'File is too large. The limit is 10 MB.' }
      const extension = fileEntry.name.split('.').pop()?.toLowerCase() ?? ''
      if (!ALLOWED_FILE_EXTENSIONS.has(extension)) {
        return { error: 'Unsupported file type. Upload a PDF, text, Markdown, CSV, DOCX, or image file.' }
      }
      file = {
        fileName: fileEntry.name,
        mimeType: fileEntry.type || null,
        fileSize: fileEntry.size,
        buffer: Buffer.from(await fileEntry.arrayBuffer()),
      }
    }
    return { fields: parsed.data, file }
  }

  let body: unknown
  try {
    body = await req.json()
  } catch {
    return { error: 'Invalid request body' }
  }
  const parsed = FieldsSchema.safeParse(body)
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? 'Invalid fields' }
  return { fields: parsed.data, file: null }
}

export async function POST(req: Request, { params }: { params: Promise<{ source: string }> }) {
  try {
    const { userId } = await auth()
    if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const workspace = await requireWorkspaceMember(userId)
    if ('error' in workspace) return NextResponse.json({ error: workspace.error }, { status: workspace.status })

    const { source } = await params
    if (!ALLOWED_SOURCES.has(source)) {
      return NextResponse.json({ error: 'Unsupported integration' }, { status: 400 })
    }

    const parsed = await parseBody(req)
    if ('error' in parsed) return NextResponse.json({ error: parsed.error }, { status: 400 })

    const { fields, file } = parsed
    if (!ALLOWED_CATEGORIES.has(fields.category)) {
      return NextResponse.json({ error: 'Choose a valid category.' }, { status: 400 })
    }
    if (fields.documentType && !ALLOWED_DOCUMENT_TYPES.has(fields.documentType)) {
      return NextResponse.json({ error: 'Choose a valid document type.' }, { status: 400 })
    }
    if (fields.moduleKey && (source !== 'datatruck' || !Object.prototype.hasOwnProperty.call(DATATRUCK_ENDPOINT_LABELS, fields.moduleKey))) {
      return NextResponse.json({ error: 'Unknown Datatruck module.' }, { status: 400 })
    }

    const result = await createManualKnowledgeItemWithOptionalDocument({
      workspaceId: workspace.workspaceId,
      source,
      title: fields.title,
      description: fields.description,
      category: fields.category,
      createdByUserId: userId,
      createdByName: workspace.member.displayName,
      externalLoadId: fields.externalLoadId ?? null,
      documentType: fields.documentType ?? null,
      moduleKey: fields.moduleKey ?? null,
      file,
    })

    const sourceLabel = source.charAt(0).toUpperCase() + source.slice(1)
    await trackEvent(
      workspace.workspaceId,
      userId,
      workspace.member.displayName,
      'verify',
      `${workspace.member.displayName} added knowledge to ${sourceLabel}`,
      {
        integration: source,
        sourceUrl: `/dashboard/integrations/${source}`,
        manual: true,
        ...(result.documentAttachment ? { documentId: result.documentAttachment.id } : {}),
      },
    ).catch(() => null)

    return NextResponse.json({
      success: true,
      knowledgeItem: result.knowledgeItem,
      documentAttachment: result.documentAttachment,
    })
  } catch (err) {
    console.error('[integrations/knowledge]', err instanceof Error ? err.message : 'unknown error')
    return NextResponse.json({ error: 'Could not save knowledge. Try again.' }, { status: 500 })
  }
}
