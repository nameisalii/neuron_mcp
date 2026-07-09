import { mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import path from 'node:path'

// Local/dev storage. TODO(production): swap this module's internals for Vercel
// Blob or S3 behind the same three functions — callers only see storage keys.
const STORAGE_ROOT = process.env.DOCUMENT_STORAGE_DIR || path.join(process.cwd(), 'storage', 'documents')

const FALLBACK_FILE_NAME = 'file'
const MAX_FILE_NAME_LENGTH = 120

/** Strips directories and unsafe characters so a user filename can never escape its folder. */
export function sanitizeFileName(fileName: string): string {
  const base = path.basename(fileName).replace(/[^a-zA-Z0-9._-]+/g, '_').replace(/^\.+/, '')
  const trimmed = base.slice(-MAX_FILE_NAME_LENGTH)
  return trimmed || FALLBACK_FILE_NAME
}

/** Resolves a storage key to an absolute path, refusing anything outside the storage root. */
function resolveStoragePath(storageKey: string): string | null {
  const resolved = path.resolve(STORAGE_ROOT, storageKey)
  const root = path.resolve(STORAGE_ROOT)
  if (!resolved.startsWith(root + path.sep)) return null
  return resolved
}

export interface SaveUploadedDocumentParams {
  workspaceId: string
  documentId: string
  fileName: string
  buffer: Buffer
}

export async function saveUploadedDocument({ workspaceId, documentId, fileName, buffer }: SaveUploadedDocumentParams): Promise<{ storageKey: string }> {
  const safeName = sanitizeFileName(fileName)
  const storageKey = path.posix.join(workspaceId, documentId, safeName)
  const absolutePath = resolveStoragePath(storageKey)
  if (!absolutePath) throw new Error('Invalid storage location')
  await mkdir(path.dirname(absolutePath), { recursive: true })
  await writeFile(absolutePath, buffer)
  return { storageKey }
}

export async function readDocumentFile(storageKey: string): Promise<Buffer | null> {
  const absolutePath = resolveStoragePath(storageKey)
  if (!absolutePath) return null
  try {
    return await readFile(absolutePath)
  } catch {
    return null
  }
}

export async function deleteDocumentFile(storageKey: string): Promise<void> {
  const absolutePath = resolveStoragePath(storageKey)
  if (!absolutePath) return
  // Remove the per-document folder so no empty directories accumulate.
  await rm(path.dirname(absolutePath), { recursive: true, force: true })
}
