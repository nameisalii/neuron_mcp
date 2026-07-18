/**
 * @jest-environment node
 */
import { extractDocumentText } from '../extractText'

it('extracts text from a plain text file', async () => {
  const result = await extractDocumentText({
    buffer: Buffer.from('Load 12345 delivered on time.'),
    fileName: 'notes.txt',
    mimeType: 'text/plain',
  })

  expect(result.status).toBe('extracted')
  expect(result.text).toBe('Load 12345 delivered on time.')
})

it('extracts readable text from a CSV file', async () => {
  const result = await extractDocumentText({
    buffer: Buffer.from('load,pay\n12345,500.00'),
    fileName: 'loads.csv',
    mimeType: 'text/csv',
  })

  expect(result.status).toBe('extracted')
  expect(result.text).toContain('12345,500.00')
})

it('does not crash on an invalid PDF', async () => {
  const result = await extractDocumentText({
    buffer: Buffer.from('this is not a pdf'),
    fileName: 'broken.pdf',
    mimeType: 'application/pdf',
  })

  expect(['failed', 'needs_ocr']).toContain(result.status)
  expect(result.text).toBeNull()
})

it('marks images as needing OCR', async () => {
  const result = await extractDocumentText({
    buffer: Buffer.from([0x89, 0x50, 0x4e, 0x47]),
    fileName: 'scan.png',
    mimeType: 'image/png',
  })

  expect(result.status).toBe('needs_ocr')
})

it('marks unknown formats as unsupported', async () => {
  const result = await extractDocumentText({
    buffer: Buffer.from('binary'),
    fileName: 'archive.zip',
    mimeType: 'application/zip',
  })

  expect(result.status).toBe('unsupported')
})

it('extracts spreadsheet data from XLSX files', async () => {
  const XLSX = await import('xlsx')
  const sheet = XLSX.utils.aoa_to_sheet([['invoice', 'total'], ['INV-1022', 2450]])
  const workbook = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(workbook, sheet, 'Invoices')
  const buffer = XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' }) as Buffer

  const result = await extractDocumentText({ buffer, fileName: 'invoices.xlsx', mimeType: null })

  expect(result.status).toBe('extracted')
  expect(result.text).toContain('Sheet: Invoices')
  expect(result.text).toContain('INV-1022')
})
