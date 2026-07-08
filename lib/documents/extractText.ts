export type ExtractionStatus = 'extracted' | 'unsupported' | 'failed' | 'needs_ocr'

export interface ExtractTextResult {
  text: string | null
  status: ExtractionStatus
  errorReason?: string
}

// Keeps prompt context and DB rows bounded even for very large documents.
const MAX_TEXT_CHARS = 50_000

const TEXT_EXTENSIONS = new Set(['txt', 'md', 'markdown', 'csv', 'log'])

function extensionOf(fileName: string): string {
  return fileName.split('.').pop()?.toLowerCase() ?? ''
}

function capText(text: string): string | null {
  const trimmed = text.replace(/\u0000/g, '').trim()
  if (!trimmed) return null
  return trimmed.slice(0, MAX_TEXT_CHARS)
}

export interface ExtractTextParams {
  buffer: Buffer
  fileName: string
  mimeType: string | null
}

/**
 * Best-effort text extraction. Never throws — a failed extraction still lets
 * the caller store file metadata with an honest extractionStatus.
 */
export async function extractDocumentText({ buffer, fileName, mimeType }: ExtractTextParams): Promise<ExtractTextResult> {
  const extension = extensionOf(fileName)
  const mime = mimeType?.toLowerCase() ?? ''

  if (TEXT_EXTENSIONS.has(extension) || mime.startsWith('text/')) {
    const text = capText(buffer.toString('utf8'))
    return text
      ? { text, status: 'extracted' }
      : { text: null, status: 'failed', errorReason: 'File contains no readable text' }
  }

  if (extension === 'pdf' || mime === 'application/pdf') {
    try {
      // Subpath import skips pdf-parse's debug harness that reads a test fixture.
      const { default: pdfParse } = await import('pdf-parse/lib/pdf-parse.js')
      const parsed = await pdfParse(buffer)
      const text = capText(parsed.text)
      // A valid PDF with no text layer is almost always a scan — OCR is out of scope in v1.
      return text
        ? { text, status: 'extracted' }
        : { text: null, status: 'needs_ocr', errorReason: 'PDF has no text layer (likely scanned)' }
    } catch (err) {
      return { text: null, status: 'failed', errorReason: err instanceof Error ? err.message.slice(0, 200) : 'PDF parsing failed' }
    }
  }

  if (mime.startsWith('image/') || ['png', 'jpg', 'jpeg', 'gif', 'webp', 'heic'].includes(extension)) {
    return { text: null, status: 'needs_ocr', errorReason: 'Image files require OCR, which is not supported yet' }
  }

  return { text: null, status: 'unsupported', errorReason: `No extractor for .${extension || 'unknown'} files yet` }
}
