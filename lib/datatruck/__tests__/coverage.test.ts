/**
 * @jest-environment node
 */
import { datatruckCoverageStatus, datatruckCoverageSourceLabel } from '../coverage'

describe('datatruckCoverageStatus', () => {
  it('marks confirmed configured endpoints as official_api', () => {
    expect(datatruckCoverageStatus({ configuredBy: 'default', confirmed: true, fileImportedCount: 0 })).toBe('official_api')
  })

  it('marks metadata and env mappings as custom_api', () => {
    expect(datatruckCoverageStatus({ configuredBy: 'metadata', confirmed: false, fileImportedCount: 0 })).toBe('custom_api')
    expect(datatruckCoverageStatus({ configuredBy: 'env', confirmed: false, fileImportedCount: 0 })).toBe('custom_api')
  })

  it('marks modules with only imported files as file_import', () => {
    expect(datatruckCoverageStatus({ configuredBy: 'not_mapped', confirmed: false, fileImportedCount: 3 })).toBe('file_import')
  })

  it('prefers the API source when both a mapping and imports exist', () => {
    expect(datatruckCoverageStatus({ configuredBy: 'metadata', confirmed: false, fileImportedCount: 3 })).toBe('custom_api')
  })

  it('marks everything else as not_connected', () => {
    expect(datatruckCoverageStatus({ configuredBy: 'not_mapped', confirmed: false, fileImportedCount: 0 })).toBe('not_connected')
  })
})

describe('datatruckCoverageSourceLabel', () => {
  it('maps statuses to friendly labels', () => {
    expect(datatruckCoverageSourceLabel('official_api')).toBe('Official API')
    expect(datatruckCoverageSourceLabel('custom_api')).toBe('Custom API')
    expect(datatruckCoverageSourceLabel('file_import')).toBe('File import')
    expect(datatruckCoverageSourceLabel('not_connected')).toBe('No source connected')
  })
})
