/**
 * @jest-environment node
 */
import { parseDocumentAssignment } from '../assignmentParser'

jest.mock('@/lib/db', () => ({ prisma: {} }))

it('parses "Attach this as BOL for load 12345"', () => {
  expect(parseDocumentAssignment('Attach this as BOL for load 12345')).toEqual({
    documentType: 'BOL',
    externalLoadId: '12345',
    assignToDatatruck: true,
  })
})

it('parses "This is POD for load 8821"', () => {
  expect(parseDocumentAssignment('This is POD for load 8821')).toEqual({
    documentType: 'POD',
    externalLoadId: '8821',
    assignToDatatruck: true,
  })
})

it('parses "Add this document to Datatruck" without a load id', () => {
  const result = parseDocumentAssignment('Add this document to Datatruck')

  expect(result.documentType).toBeNull()
  expect(result.externalLoadId).toBeNull()
  expect(result.assignToDatatruck).toBe(true)
})

it('returns no assignment for a plain question', () => {
  expect(parseDocumentAssignment('Read this file and tell me what it says')).toEqual({
    documentType: null,
    externalLoadId: null,
    assignToDatatruck: false,
  })
})
