export type DatatruckResponseShape = 'array' | 'results' | 'data' | 'items' | 'unknown'

export interface DatatruckShapeDetection {
  shape: DatatruckResponseShape
  recordCount: number
  fieldNames: string[]
  pagination: {
    detected: boolean
    nextField: string | null
    pageField: string | null
  }
}

const LIST_FIELDS: Array<{ field: 'results' | 'data' | 'items'; shape: DatatruckResponseShape }> = [
  { field: 'results', shape: 'results' },
  { field: 'data', shape: 'data' },
  { field: 'items', shape: 'items' },
]

const NEXT_FIELDS = ['next', 'next_page', 'nextPage', 'next_url', 'nextUrl']
const PAGE_FIELDS = ['page', 'page_number', 'pageNumber', 'current_page', 'currentPage', 'offset']

function recordsOf(value: unknown): Array<Record<string, unknown>> {
  if (!Array.isArray(value)) return []
  return value.filter((item): item is Record<string, unknown> => Boolean(item) && typeof item === 'object' && !Array.isArray(item))
}

/**
 * Detects the list shape of a Datatruck API response so custom endpoints
 * can be ingested without hand-written parsers.
 */
export function detectDatatruckResponseShape(payload: unknown): DatatruckShapeDetection {
  if (Array.isArray(payload)) {
    const records = recordsOf(payload)
    return {
      shape: 'array',
      recordCount: records.length,
      fieldNames: records[0] ? Object.keys(records[0]).slice(0, 60) : [],
      pagination: { detected: false, nextField: null, pageField: null },
    }
  }

  if (payload && typeof payload === 'object') {
    const container = payload as Record<string, unknown>
    for (const { field, shape } of LIST_FIELDS) {
      if (Array.isArray(container[field])) {
        const records = recordsOf(container[field])
        const nextField = NEXT_FIELDS.find((key) => key in container) ?? null
        const pageField = PAGE_FIELDS.find((key) => key in container) ?? null
        return {
          shape,
          recordCount: records.length,
          fieldNames: records[0] ? Object.keys(records[0]).slice(0, 60) : [],
          pagination: {
            detected: Boolean(nextField || pageField || 'count' in container),
            nextField,
            pageField,
          },
        }
      }
    }
  }

  return {
    shape: 'unknown',
    recordCount: 0,
    fieldNames: payload && typeof payload === 'object' ? Object.keys(payload as Record<string, unknown>).slice(0, 40) : [],
    pagination: { detected: false, nextField: null, pageField: null },
  }
}
