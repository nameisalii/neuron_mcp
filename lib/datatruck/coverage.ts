export type DatatruckCoverageStatus =
  | 'official_api'
  | 'custom_api'
  | 'webhook'
  | 'file_import'
  | 'not_connected'
  | 'unsupported'

export const DATATRUCK_COVERAGE_SOURCE_LABELS: Record<DatatruckCoverageStatus, string> = {
  official_api: 'Official API',
  custom_api: 'Custom API',
  webhook: 'Webhook',
  file_import: 'File import',
  not_connected: 'No source connected',
  unsupported: 'Unsupported',
}

export interface DatatruckCoverageInput {
  configuredBy: 'metadata' | 'env' | 'default' | 'not_mapped'
  confirmed: boolean
  fileImportedCount: number
}

/**
 * Derives the coverage status for a Datatruck module from how its endpoint
 * is configured and whether files were manually imported for it. A module
 * with both an API mapping and file imports reports the API source (live
 * sync outranks static imports).
 */
export function datatruckCoverageStatus(input: DatatruckCoverageInput): DatatruckCoverageStatus {
  if (input.confirmed && input.configuredBy !== 'not_mapped') return 'official_api'
  if (input.configuredBy === 'metadata' || input.configuredBy === 'env') return 'custom_api'
  if (input.fileImportedCount > 0) return 'file_import'
  return 'not_connected'
}

export function datatruckCoverageSourceLabel(status: DatatruckCoverageStatus): string {
  return DATATRUCK_COVERAGE_SOURCE_LABELS[status]
}
